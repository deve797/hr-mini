-- ============================================================
-- 第 7 步：新建 run_payroll_v3_test 函数（独立名称，不影响现有流程）
-- 包含完整薪资计算逻辑（新字段版本）
-- 在 Supabase SQL Editor 中执行本文件
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 薪资计算规则说明
-- ────────────────────────────────────────────────────────────
-- 应出勤天数 = 当月天数 - 2
-- base_pay          = base_salary / 应出勤天数 × 实际出勤天数（含试用+转正）
-- position_pay      = position_salary / 应出勤天数 × 转正天数（试用期无岗位工资）
-- subsidy_pay       = subsidy_monthly / 应出勤天数 × 实际出勤天数（含试用+转正）
-- meal_allowance    = 12h班制：20元/天；9/10h班制：10元/天 + days_reaching_12h × 10元
-- attendance_bonus  = 实际出勤 >= 应出勤 → employees.perfect_attendance_bonus，否则 0
-- overtime_pay      = (base_salary + position_salary) / 应出勤天数 / work_shift × 1.0 × overtime_hours
-- performance_total = payroll_performance 中该员工本月合计
-- store_bonus_total = payroll_store_bonus 中该员工本月合计（跨门店求和）
-- gross_total       = 上述所有项 + adjustment_manual（手录调整，保留不覆盖）
-- 已锁定（status='locked'）的记录不会被覆盖
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.run_payroll_v3_test(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month         date    := date_trunc('month', p_month)::date;
  v_month_days    int;
  v_expected_days int;    -- 应出勤天数
BEGIN
  -- 当月总天数与应出勤天数
  v_month_days    := extract(day from (v_month + interval '1 month' - interval '1 day'))::int;
  v_expected_days := greatest(v_month_days - 2, 1);  -- 防止 <= 0

  -- ── Step 1: UPSERT payroll_month ──────────────────────────
  -- 对本月有 monthly_workdays 且 system_status = 'active' 的员工进行计算
  -- 已锁定记录：INSERT 时遇到冲突但 status = 'locked' 则跳过更新
  INSERT INTO public.payroll_month (
    month, employee_id,
    total_days,
    base_pay,
    position_pay,
    subsidy_pay,
    meal_allowance_total,
    attendance_bonus,
    overtime_hours_total,
    overtime_pay,
    performance_total,
    store_bonus_total,
    adjustment_manual,
    manual_overrides,
    gross_total,
    status
  )
  SELECT
    v_month,
    calc.employee_id,
    calc.total_workdays,
    calc.base_pay,
    calc.position_pay,
    calc.subsidy_pay,
    calc.meal_allowance_total,
    calc.attendance_bonus,
    calc.overtime_hours_total,
    calc.overtime_pay,
    calc.performance_total,
    calc.store_bonus_total,
    coalesce(existing.adjustment_manual, 0),
    '{}'::jsonb,
    0,       -- gross_total 在 Step 2 单独更新
    'draft'
  FROM (
    SELECT
      mw_agg.employee_id,
      mw_agg.total_workdays,
      mw_agg.total_regular_days,
      mw_agg.total_overtime_hours  AS overtime_hours_total,
      mw_agg.meal_allowance_total,
      -- base_pay：全部实际出勤天数（含试用+转正）按比例
      round(
        e.base_salary
          / v_expected_days::numeric
          * mw_agg.total_workdays::numeric,
        2
      ) AS base_pay,
      -- position_pay：仅转正天数可享有岗位工资
      round(
        coalesce(pc.position_salary, 0)
          / v_expected_days::numeric
          * mw_agg.total_regular_days::numeric,
        2
      ) AS position_pay,
      -- subsidy_pay：补贴按实际出勤天数比例计算（含试用+转正）
      round(
        coalesce(pc.subsidy_monthly, 0)
          / v_expected_days::numeric
          * mw_agg.total_workdays::numeric,
        2
      ) AS subsidy_pay,
      -- attendance_bonus：实际出勤 >= 应出勤 → 全勤奖
      CASE
        WHEN mw_agg.total_workdays >= v_expected_days
        THEN coalesce(e.perfect_attendance_bonus, 0)
        ELSE 0
      END AS attendance_bonus,
      -- overtime_pay：加班费（以 base + position 月薪为基数）
      round(
        CASE
          WHEN v_expected_days > 0 AND coalesce(e.work_shift, 0) > 0
               AND mw_agg.total_overtime_hours > 0
          THEN (e.base_salary + coalesce(pc.position_salary, 0))
                 / v_expected_days::numeric
                 / e.work_shift::numeric
                 * 1.0
                 * mw_agg.total_overtime_hours
          ELSE 0
        END,
        2
      ) AS overtime_pay,
      coalesce(perf.total_amount, 0) AS performance_total,
      coalesce(bonus.total_amount, 0) AS store_bonus_total
    FROM (
      -- 汇总同一员工本月跨门店的工时数据
      SELECT
        mw.employee_id,
        sum(mw.workdays)                          AS total_workdays,
        sum(coalesce(mw.regular_days, 0))         AS total_regular_days,
        sum(coalesce(mw.overtime_hours, 0))       AS total_overtime_hours,
        sum(
          CASE
            WHEN e2.work_shift = 12
            THEN mw.workdays * 20.0
            ELSE mw.workdays * 10.0 + coalesce(mw.days_reaching_12h, 0) * 10.0
          END
        )                                         AS meal_allowance_total
      FROM public.monthly_workdays mw
      JOIN public.employees e2 ON e2.id = mw.employee_id
      WHERE mw.month = v_month
      GROUP BY mw.employee_id
    ) mw_agg
    JOIN public.employees e
      ON e.id = mw_agg.employee_id
      AND e.system_status = 'active'
    LEFT JOIN public.position_catalog pc
      ON pc.id = e.position_id
    LEFT JOIN (
      SELECT employee_id, sum(amount) AS total_amount
      FROM public.payroll_performance
      WHERE month = v_month
      GROUP BY employee_id
    ) perf ON perf.employee_id = mw_agg.employee_id
    LEFT JOIN (
      SELECT employee_id, sum(amount) AS total_amount
      FROM public.payroll_store_bonus
      WHERE month = v_month
      GROUP BY employee_id
    ) bonus ON bonus.employee_id = mw_agg.employee_id
  ) calc
  LEFT JOIN (
    SELECT employee_id, adjustment_manual
    FROM public.payroll_month
    WHERE month = v_month
  ) existing ON existing.employee_id = calc.employee_id
  ON CONFLICT (month, employee_id) DO UPDATE SET
    total_days            = EXCLUDED.total_days,
    base_pay              = CASE
      WHEN payroll_month.manual_overrides ? 'base_pay'
      THEN payroll_month.base_pay
      ELSE EXCLUDED.base_pay
    END,
    position_pay          = CASE
      WHEN payroll_month.manual_overrides ? 'position_pay'
      THEN payroll_month.position_pay
      ELSE EXCLUDED.position_pay
    END,
    meal_allowance_total  = CASE
      WHEN payroll_month.manual_overrides ? 'meal_allowance_total'
      THEN payroll_month.meal_allowance_total
      ELSE EXCLUDED.meal_allowance_total
    END,
    attendance_bonus      = CASE
      WHEN payroll_month.manual_overrides ? 'attendance_bonus'
      THEN payroll_month.attendance_bonus
      ELSE EXCLUDED.attendance_bonus
    END,
    subsidy_pay           = CASE
      WHEN payroll_month.manual_overrides ? 'subsidy_pay'
      THEN payroll_month.subsidy_pay
      ELSE EXCLUDED.subsidy_pay
    END,
    overtime_hours_total  = EXCLUDED.overtime_hours_total,
    overtime_pay          = CASE
      WHEN payroll_month.manual_overrides ? 'overtime_pay'
      THEN payroll_month.overtime_pay
      ELSE EXCLUDED.overtime_pay
    END,
    performance_total     = EXCLUDED.performance_total,
    store_bonus_total     = EXCLUDED.store_bonus_total
    -- adjustment_manual、manual_overrides、status、store_approved_at 不覆盖
  WHERE payroll_month.status != 'locked';

  -- ── Step 2: 重新汇总 gross_total（排除已锁定）─────────────
  UPDATE public.payroll_month
  SET gross_total = base_pay
                  + position_pay
                  + subsidy_pay
                  + meal_allowance_total
                  + attendance_bonus
                  + overtime_pay
                  + performance_total
                  + store_bonus_total
                  + adjustment_manual
  WHERE month = v_month
    AND status != 'locked';

END;
$$;

-- ────────────────────────────────────────────────────────────
-- 验证：函数是否创建成功
-- ────────────────────────────────────────────────────────────
SELECT
  p.proname       AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef     AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'run_payroll_v3_test';
