-- ============================================================
-- 第 1 步：新增薪资相关字段（只加列，不改任何现有逻辑）
-- 全部使用 IF NOT EXISTS 检查，可以重复运行，不会报错
-- 在 Supabase SQL Editor 中执行本文件
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. 先查清楚 position_catalog 的真实列名（执行后看一下结果）
-- ────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'position_catalog'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────
-- 1. employees 表：新增月基本工资、全勤奖金额
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees'
      AND column_name = 'base_salary'
  ) THEN
    ALTER TABLE public.employees
      ADD COLUMN base_salary NUMERIC(10,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'employees.base_salary 已添加';
  ELSE
    RAISE NOTICE 'employees.base_salary 已存在，跳过';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees'
      AND column_name = 'perfect_attendance_bonus'
  ) THEN
    ALTER TABLE public.employees
      ADD COLUMN perfect_attendance_bonus NUMERIC(8,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'employees.perfect_attendance_bonus 已添加';
  ELSE
    RAISE NOTICE 'employees.perfect_attendance_bonus 已存在，跳过';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. position_catalog 表：新增岗位月工资
--    注意：若第 0 步显示该表不存在或列名不同，请先告知
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'position_catalog'
  ) THEN
    RAISE WARNING 'position_catalog 表不存在，请检查表名后告知';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'position_catalog'
      AND column_name = 'position_salary'
  ) THEN
    ALTER TABLE public.position_catalog
      ADD COLUMN position_salary NUMERIC(10,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'position_catalog.position_salary 已添加';
  ELSE
    RAISE NOTICE 'position_catalog.position_salary 已存在，跳过';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. monthly_workdays 表：新增加班小时数、达到12小时天数
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'monthly_workdays'
      AND column_name = 'overtime_hours'
  ) THEN
    ALTER TABLE public.monthly_workdays
      ADD COLUMN overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'monthly_workdays.overtime_hours 已添加';
  ELSE
    RAISE NOTICE 'monthly_workdays.overtime_hours 已存在，跳过';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'monthly_workdays'
      AND column_name = 'days_reaching_12h'
  ) THEN
    ALTER TABLE public.monthly_workdays
      ADD COLUMN days_reaching_12h SMALLINT NOT NULL DEFAULT 0;
    RAISE NOTICE 'monthly_workdays.days_reaching_12h 已添加';
  ELSE
    RAISE NOTICE 'monthly_workdays.days_reaching_12h 已存在，跳过';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. payroll_month 表：新增工资明细列
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  cols text[] := ARRAY[
    'base_pay', 'position_pay', 'meal_allowance_total',
    'attendance_bonus', 'overtime_hours_total', 'overtime_pay',
    'performance_total', 'store_bonus_total'
  ];
  col text;
BEGIN
  FOREACH col IN ARRAY cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payroll_month'
        AND column_name = col
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.payroll_month ADD COLUMN %I NUMERIC(12,2) NOT NULL DEFAULT 0',
        col
      );
      RAISE NOTICE 'payroll_month.% 已添加', col;
    ELSE
      RAISE NOTICE 'payroll_month.% 已存在，跳过', col;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 验证：执行以下 SELECT 确认所有字段都存在
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='employees'
     AND column_name IN ('base_salary','perfect_attendance_bonus')) AS employees_new_cols,

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='position_catalog'
     AND column_name = 'position_salary') AS position_catalog_new_cols,

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='monthly_workdays'
     AND column_name IN ('overtime_hours','days_reaching_12h')) AS monthly_workdays_new_cols,

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='payroll_month'
     AND column_name IN (
       'base_pay','position_pay','meal_allowance_total',
       'attendance_bonus','overtime_hours_total','overtime_pay',
       'performance_total','store_bonus_total'
     )) AS payroll_month_new_cols;

-- 期望结果：employees_new_cols=2, position_catalog_new_cols=1,
--           monthly_workdays_new_cols=2, payroll_month_new_cols=8
