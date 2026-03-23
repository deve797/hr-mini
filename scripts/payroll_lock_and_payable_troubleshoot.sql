-- 工资运行常见阻塞排查（Supabase SQL Editor）
-- 场景 1: Payroll is locked and cannot be modified
-- 场景 2: enforce_payable_employee 触发报错

-- 0) 先查看当月 payroll_month 是否已锁定
-- 把日期改成你页面选择的月份首日，例如 2026-03-01
SELECT month, employee_id, status
FROM public.payroll_month
WHERE month = DATE '2026-03-01'
ORDER BY employee_id
LIMIT 200;

-- 1) 若当月存在 locked，运行工资前先解锁（临时）
-- 注意：这会允许重算该月工资，完成后你可再次锁定
UPDATE public.payroll_month
SET status = 'draft'
WHERE month = DATE '2026-03-01'
  AND status = 'locked';

-- 2) 重新执行工资运行后，若再报 enforce_payable_employee，定位触发器定义
SELECT
  t.tgname AS trigger_name,
  c.relname AS table_name,
  p.proname AS function_name,
  pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND (t.tgname ILIKE '%payable%' OR p.proname ILIKE '%payable%');

-- 3) 导出 enforce_payable_employee 函数全文（若函数名不同，请替换）
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'enforce_payable_employee';

-- 4) 排查 employees 状态字段现状（用于判断应使用 employment_status 还是 system_status）
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employees'
  AND column_name IN ('status', 'system_status', 'employment_status')
ORDER BY column_name;
