-- 在 Supabase SQL Editor 中执行，用于导出 / 定位 public.api_run_payroll_v2

-- 查询 1：若仅有一个重载，复制结果里 definition 整格（从 CREATE OR REPLACE FUNCTION 到结尾）
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'api_run_payroll_v2';

-- 查询 2：若查询 1 报错「多于一个函数」，先看每一行的参数类型
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.oid
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'api_run_payroll_v2';

-- 查询 3：把括号里换成查询 2 里某一行的参数列表（示例）
-- SELECT pg_get_functiondef('public.api_run_payroll_v2(p_month date)'::regprocedure);
