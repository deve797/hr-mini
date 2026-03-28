-- ============================================================
-- 第 11 步：payroll_month 增加 manual_overrides（jsonb）
-- 用于标记哪些薪资分项被财务手动改过；重跑 run_payroll_v3_test 时保留这些字段
-- 在 Supabase SQL Editor 中执行
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payroll_month'
      AND column_name = 'manual_overrides'
  ) THEN
    ALTER TABLE public.payroll_month
      ADD COLUMN manual_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'payroll_month.manual_overrides 已添加';
  ELSE
    RAISE NOTICE 'payroll_month.manual_overrides 已存在，跳过';
  END IF;
END $$;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_month'
  AND column_name = 'manual_overrides';
