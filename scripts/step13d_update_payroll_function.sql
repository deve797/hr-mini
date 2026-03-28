-- ============================================================
-- 第 13d 步：更新 run_payroll_v3_test — 拓店补贴 expansion_subsidy
-- 规则：开业日起连续 3 个自然月内为「新店」；仅一/二/三级储备店长
--       且 position_catalog.expansion_subsidy_monthly > 0 时，
--       按门店维度：月标准 / 应出勤天数 × 该店出勤天数，再跨店求和。
-- 依赖：step13a_schema_changes.sql（payroll_month.expansion_subsidy、
--       stores.opening_date、position_catalog.expansion_subsidy_monthly）
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 薪资计算规则说明（节选）
-- ────────────────────────────────────────────────────────────
-- expansion_subsidy = Σ门店(
--   CASE 新店且岗位有拓店月标准
--   THEN expansion_subsidy_monthly / 应出勤 × 该门店 workdays
--   ELSE 0 END
-- )
-- gross_total = ... + expansion_subsidy + adjustment_manual
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
  v_month_days    := extract(day from (v_month + interval '1 month' - interval '1 day'))::int;
  v_expected_days := greatest(v_month_days - 2, 1);

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
    expansion_subsidy,
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
    calc.expansion_subsidy,
    coalesce(existing.adjustment_manual, 0),
    '{}'::jsonb,
    0,
    'draft'
  FROM (
    SELECT
      mw_agg.employee_id,
      mw_agg.total_workdays,
      mw_agg.total_regular_days,
      mw_agg.total_overtime_hours  AS overtime_hours_total,
      mw_agg.meal_allowance_total,
      round(
        e.base_salary
          / v_expected_days::numeric
          * mw_agg.total_workdays::numeric,
        2
      ) AS base_pay,
      round(
        coalesce(pc.position_salary, 0)
          / v_expected_days::numeric
          * mw_agg.total_regular_days::numeric,
        2
      ) AS position_pay,
      round(
        coalesce(pc.subsidy_monthly, 0)
          / v_expected_days::numeric
          * mw_agg.total_workdays::numeric,
        2
      ) AS subsidy_pay,
      CASE
        WHEN mw_agg.total_workdays >= v_expected_days
        THEN coalesce(e.perfect_attendance_bonus, 0)
        ELSE 0
      END AS attendance_bonus,
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
      coalesce(bonus.total_amount, 0) AS store_bonus_total,
      coalesce(exp_agg.expansion_subsidy, 0) AS expansion_subsidy
    FROM (
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
      SELECT
        mw.employee_id,
        round(
          sum(
            CASE
              WHEN s.opening_date IS NOT NULL
                AND v_month >= date_trunc('month', s.opening_date)::date
                AND v_month < (date_trunc('month', s.opening_date) + interval '3 months')::date
                AND coalesce(pc2.expansion_subsidy_monthly, 0) > 0
              THEN coalesce(pc2.expansion_subsidy_monthly, 0)
                / v_expected_days::numeric
                * mw.workdays::numeric
              ELSE 0
            END
          ),
          2
        ) AS expansion_subsidy
      FROM public.monthly_workdays mw
      LEFT JOIN public.stores s ON s.id = mw.store_id
      JOIN public.employees e3 ON e3.id = mw.employee_id
      LEFT JOIN public.position_catalog pc2 ON pc2.id = e3.position_id
      WHERE mw.month = v_month
      GROUP BY mw.employee_id
    ) exp_agg ON exp_agg.employee_id = mw_agg.employee_id
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
    expansion_subsidy     = CASE
      WHEN payroll_month.manual_overrides ? 'expansion_subsidy'
      THEN payroll_month.expansion_subsidy
      ELSE EXCLUDED.expansion_subsidy
    END,
    overtime_hours_total  = EXCLUDED.overtime_hours_total,
    overtime_pay          = CASE
      WHEN payroll_month.manual_overrides ? 'overtime_pay'
      THEN payroll_month.overtime_pay
      ELSE EXCLUDED.overtime_pay
    END,
    performance_total     = EXCLUDED.performance_total,
    store_bonus_total     = EXCLUDED.store_bonus_total
  WHERE payroll_month.status != 'locked';

  UPDATE public.payroll_month
  SET gross_total = base_pay
                  + position_pay
                  + subsidy_pay
                  + meal_allowance_total
                  + attendance_bonus
                  + overtime_pay
                  + performance_total
                  + store_bonus_total
                  + expansion_subsidy
                  + adjustment_manual
  WHERE month = v_month
    AND status != 'locked';

END;
$$;

SELECT
  p.proname       AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef     AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'run_payroll_v3_test';
