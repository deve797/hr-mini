-- 员工入职页：用工状态 employment_status + 系统状态 status 双字段、created_at、唯一约束
-- 在 Supabase SQL Editor 中执行，可重复运行。
-- 与 insurance_requests_setup.sql 中的 employees.status (pending/active/inactive) 兼容。

-- 1) 新增用工状态 employment_status（与 system 的 status 分离）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'employment_status'
  ) THEN
    ALTER TABLE public.employees
      ADD COLUMN employment_status text NOT NULL DEFAULT '试用期'
      CHECK (employment_status IN ('试用期', '转正', '离职'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) 确保 employees.status 为系统状态（pending/active/inactive），与 insurance_requests_setup 一致
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.employees
      ADD COLUMN status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'active', 'inactive'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_status_check;
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_status_check
    CHECK (status IN ('pending', 'active', 'inactive'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) 若无 created_at 则新增（用于「最近新增员工」排序）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.employees ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- 4) 手机号、身份证号唯一约束（若尚未存在）
DO $$
BEGIN
  ALTER TABLE public.employees ADD CONSTRAINT uq_employees_phone UNIQUE (phone);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.employees ADD CONSTRAINT uq_employees_id_card UNIQUE (id_card);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 若表中字段名为 id_number 而非 id_card，请将上列改为：
-- ALTER TABLE public.employees ADD CONSTRAINT uq_employees_id_number UNIQUE (id_number);
