-- ============================================================
-- 第 12 步：增加补贴（subsidy_pay）
-- 1. position_catalog 增加 subsidy_monthly（岗位月度补贴标准）
-- 2. payroll_month 增加 subsidy_pay（按出勤天数比例计算结果）
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- ── 1. position_catalog 加列
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'position_catalog'
      AND column_name = 'subsidy_monthly'
  ) THEN
    ALTER TABLE public.position_catalog
      ADD COLUMN subsidy_monthly NUMERIC(10,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'position_catalog.subsidy_monthly 已添加';
  ELSE
    RAISE NOTICE 'position_catalog.subsidy_monthly 已存在，跳过';
  END IF;
END $$;

-- ── 2. payroll_month 加列
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payroll_month'
      AND column_name = 'subsidy_pay'
  ) THEN
    ALTER TABLE public.payroll_month
      ADD COLUMN subsidy_pay NUMERIC(12,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'payroll_month.subsidy_pay 已添加';
  ELSE
    RAISE NOTICE 'payroll_month.subsidy_pay 已存在，跳过';
  END IF;
END $$;

-- ── 验证
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'position_catalog'
     AND column_name = 'subsidy_monthly') AS position_subsidy_col,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'payroll_month'
     AND column_name = 'subsidy_pay')     AS payroll_subsidy_col;
-- 期望结果：两列均为 1
