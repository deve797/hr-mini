-- 在 Supabase SQL Editor 中执行，用于导出 / 定位 public.run_payroll
-- （run_payroll_v2 内部会 perform run_payroll；e.status 报错通常在此函数内）

-- 查询 1：若仅有一个重载，复制 definition 全文（从 CREATE OR REPLACE FUNCTION 到结尾）
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'run_payroll';

-- 查询 2：若查询 1 报错「多于一个函数」，先看参数列表
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.oid
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'run_payroll';

-- 查询 3：把括号里换成查询 2 中对应一行的参数，例如：
-- SELECT pg_get_functiondef('public.run_payroll(p_month date)'::regprocedure);
