-- ============================================================
-- 第 7 步验证：调用 run_payroll_v3_test 并检查计算结果
-- 把 '2026-03-01' 换成你要测试的月份
-- ============================================================

-- 1. 调用新函数（只影响 payroll_month，不影响 payroll_store_split）
SELECT public.run_payroll_v3_test('2026-03-01');

-- 2. 查看本月 payroll_month 计算明细
SELECT
  e.name                            AS 员工姓名,
  e.emp_no                          AS 工号,
  pm.total_days                     AS 出勤天数,
  pm.base_pay                       AS 基本工资,
  pm.position_pay                   AS 岗位工资,
  pm.meal_allowance_total           AS 餐补合计,
  pm.attendance_bonus               AS 全勤奖,
  pm.overtime_hours_total           AS 加班小时,
  pm.overtime_pay                   AS 加班费,
  pm.performance_total              AS 绩效,
  pm.store_bonus_total              AS 门店奖金,
  pm.adjustment_manual              AS 手录调整,
  pm.gross_total                    AS 应发总工资,
  pm.status                         AS 状态
FROM public.payroll_month pm
JOIN public.employees e ON e.id = pm.employee_id
WHERE pm.month = '2026-03-01'
ORDER BY e.name;

-- 3. 检查各分项合计是否等于 gross_total（差值应为 0）
SELECT
  e.name,
  pm.gross_total,
  (pm.base_pay + pm.position_pay + pm.meal_allowance_total
    + pm.attendance_bonus + pm.overtime_pay
    + pm.performance_total + pm.store_bonus_total
    + pm.adjustment_manual)         AS 分项合计,
  pm.gross_total
    - (pm.base_pay + pm.position_pay + pm.meal_allowance_total
       + pm.attendance_bonus + pm.overtime_pay
       + pm.performance_total + pm.store_bonus_total
       + pm.adjustment_manual)      AS 差值
FROM public.payroll_month pm
JOIN public.employees e ON e.id = pm.employee_id
WHERE pm.month = '2026-03-01'
ORDER BY e.name;
