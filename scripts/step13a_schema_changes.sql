-- ============================================================
-- 第 13a 步：岗位薪资自动化 — 结构变更
-- 1. position_catalog：work_shift、expansion_subsidy_monthly
-- 2. stores：opening_date（新店前 3 个月判断）
-- 3. payroll_month：expansion_subsidy（计算结果）
-- 在 Supabase SQL Editor 中执行；可重复运行（IF NOT EXISTS）
-- ============================================================

-- ── 1. position_catalog ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'position_catalog'
      AND column_name = 'work_shift'
  ) THEN
    ALTER TABLE public.position_catalog
      ADD COLUMN work_shift SMALLINT;
    RAISE NOTICE 'position_catalog.work_shift 已添加';
  ELSE
    RAISE NOTICE 'position_catalog.work_shift 已存在，跳过';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'position_catalog'
      AND column_name = 'expansion_subsidy_monthly'
  ) THEN
    ALTER TABLE public.position_catalog
      ADD COLUMN expansion_subsidy_monthly NUMERIC(10,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'position_catalog.expansion_subsidy_monthly 已添加';
  ELSE
    RAISE NOTICE 'position_catalog.expansion_subsidy_monthly 已存在，跳过';
  END IF;
END $$;

-- ── 2. stores ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stores'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stores'
        AND column_name = 'opening_date'
    ) THEN
      ALTER TABLE public.stores
        ADD COLUMN opening_date DATE;
      RAISE NOTICE 'stores.opening_date 已添加';
    ELSE
      RAISE NOTICE 'stores.opening_date 已存在，跳过';
    END IF;
  ELSE
    RAISE WARNING 'public.stores 表不存在，未添加 opening_date';
  END IF;
END $$;

-- ── 3. payroll_month ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_month'
      AND column_name = 'expansion_subsidy'
  ) THEN
    ALTER TABLE public.payroll_month
      ADD COLUMN expansion_subsidy NUMERIC(12,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'payroll_month.expansion_subsidy 已添加';
  ELSE
    RAISE NOTICE 'payroll_month.expansion_subsidy 已存在，跳过';
  END IF;
END $$;

-- ── 验证 ─────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'position_catalog'
     AND column_name IN ('work_shift', 'expansion_subsidy_monthly')) AS position_catalog_new_cols,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'stores'
     AND column_name = 'opening_date') AS stores_opening_date_col,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'payroll_month'
     AND column_name = 'expansion_subsidy') AS payroll_expansion_col;
-- 期望：position_catalog_new_cols = 2；若 stores 存在则 stores_opening_date_col = 1；payroll_expansion_col = 1
