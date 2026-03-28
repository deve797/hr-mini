-- ============================================================
-- 第 8 步：改写 run_payroll_v2
-- 1. 调用 run_payroll_v3_test 替代旧的 run_payroll
-- 2. 修复门店分摊逻辑：门店专属奖金直接归入对应门店，不参与比例分摊
-- 调用链保持不变：api_run_payroll_v2 → run_payroll_v2（前端无需修改）
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 新版门店分摊公式说明
-- ────────────────────────────────────────────────────────────
-- 旧逻辑（有隐患）：
--   store_total = gross_total × (本店天数 / 总天数)
--   → 门店奖金被按比例摊给所有门店，B店会承担A店发出的奖金
--
-- 新逻辑（修正后）：
--   比例部分 = (gross_total - store_bonus_total) × (本店天数 / 总天数)
--   直接部分 = payroll_store_bonus 中该员工该门店本月之和
--   store_total = 比例部分 + 直接部分
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.run_payroll_v2(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN

  -- Step 1: 用新版函数计算所有薪资分项（含绩效、门店奖金、餐补等）
  PERFORM public.run_payroll_v3_test(v_month);

  -- Step 2: 重建门店分摊
  DELETE FROM public.payroll_store_split WHERE month = v_month;

  INSERT INTO public.payroll_store_split(month, employee_id, store_id, workdays, ratio, store_total)
  SELECT
    mw.month,
    mw.employee_id,
    mw.store_id,
    mw.workdays,
    (mw.workdays / nullif(pm.total_days, 0))::numeric(10,6)        AS ratio,
    round(
      -- 比例分摊部分：gross_total 扣除门店专属奖金后按出勤天数比例分配
      (pm.gross_total - coalesce(pm.store_bonus_total, 0))
        * (mw.workdays / nullif(pm.total_days, 0))
      -- 直接归入部分：该员工在本门店的专属奖金
      + coalesce(sb.store_bonus_direct, 0),
      2
    )                                                               AS store_total
  FROM public.monthly_workdays mw
  JOIN public.payroll_month pm
    ON pm.month = mw.month AND pm.employee_id = mw.employee_id
  LEFT JOIN (
    SELECT employee_id, store_id, sum(amount) AS store_bonus_direct
    FROM public.payroll_store_bonus
    WHERE month = v_month
    GROUP BY employee_id, store_id
  ) sb
    ON sb.employee_id = mw.employee_id AND sb.store_id = mw.store_id
  WHERE mw.month = v_month
    AND pm.total_days > 0;

  -- Step 3: 差额修正（修正四舍五入导致合计与 gross_total 存在微小差异）
  WITH s AS (
    SELECT employee_id, sum(store_total)::numeric(12,2) AS split_sum
    FROM public.payroll_store_split
    WHERE month = v_month
    GROUP BY employee_id
  ),
  d AS (
    SELECT pm.employee_id, (pm.gross_total - s.split_sum)::numeric(12,2) AS diff
    FROM public.payroll_month pm
    JOIN s ON s.employee_id = pm.employee_id
    WHERE pm.month = v_month AND (pm.gross_total - s.split_sum) <> 0
  ),
  target AS (
    SELECT DISTINCT ON (employee_id) employee_id, id
    FROM public.payroll_store_split
    WHERE month = v_month
    ORDER BY employee_id, workdays DESC
  )
  UPDATE public.payroll_store_split ps
  SET store_total = ps.store_total + d.diff
  FROM d
  JOIN target t ON t.employee_id = d.employee_id
  WHERE ps.id = t.id;

END;
$$;

-- ────────────────────────────────────────────────────────────
-- 验证：函数已更新，运行并检查结果
-- ────────────────────────────────────────────────────────────

-- 1. 调用新版 run_payroll_v2（把月份改为你要测试的月份）
SELECT public.run_payroll_v2('2026-03-01');

-- 2. 检查 payroll_store_split：各门店分摊金额
SELECT
  e.name                                    AS 员工姓名,
  s.name                                    AS 门店,
  ps.workdays                               AS 本店天数,
  ps.ratio                                  AS 分摊比例,
  ps.store_total                            AS 本店应付
FROM public.payroll_store_split ps
JOIN public.employees e ON e.id = ps.employee_id
JOIN public.stores s    ON s.id  = ps.store_id
WHERE ps.month = '2026-03-01'
ORDER BY e.name, ps.workdays DESC;

-- 3. 验证：各员工所有门店 store_total 合计 = gross_total（差值应为 0）
SELECT
  e.name                                    AS 员工姓名,
  pm.gross_total                            AS 应发总工资,
  sum(ps.store_total)::numeric(12,2)        AS 门店分摊合计,
  (pm.gross_total - sum(ps.store_total))::numeric(12,2) AS 差值
FROM public.payroll_month pm
JOIN public.employees e ON e.id = pm.employee_id
LEFT JOIN public.payroll_store_split ps
  ON ps.month = pm.month AND ps.employee_id = pm.employee_id
WHERE pm.month = '2026-03-01'
GROUP BY e.name, pm.gross_total
ORDER BY e.name;
