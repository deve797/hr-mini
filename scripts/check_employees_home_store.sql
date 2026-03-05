-- 在 Supabase SQL Editor 中运行本脚本，排查 employees 表 home_store_id 为 null 的原因

-- 1. 查看 employees 表上所有触发器（若有触发器在 INSERT 时改写了 home_store_id 会在这里）
SELECT
  tgname AS trigger_name,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'employees'
  AND NOT t.tgisinternal
ORDER BY tgname;

-- 2. 查看 employees 表结构（确认 home_store_id 列及默认值）
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employees'
ORDER BY ordinal_position;

-- 3. 查看 employees 表的 RLS 策略
SELECT
  policyname,
  cmd,
  qual::text AS using_expr,
  with_check::text AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'employees';
