-- ============================================================
-- 第 2 步：新建绩效表和门店奖金表
-- 全部使用 IF NOT EXISTS，可以重复运行
-- 在 Supabase SQL Editor 中执行本文件
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. payroll_performance（员工绩效：按员工+月份）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_performance (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  month       date        NOT NULL,
  employee_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  note        text,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 唯一约束：同一员工同一月份只能有一条绩效记录
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_payroll_performance_month_employee'
  ) THEN
    ALTER TABLE public.payroll_performance
      ADD CONSTRAINT uq_payroll_performance_month_employee
      UNIQUE (month, employee_id);
    RAISE NOTICE 'payroll_performance 唯一约束已添加';
  ELSE
    RAISE NOTICE 'payroll_performance 唯一约束已存在，跳过';
  END IF;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_payroll_performance_month
  ON public.payroll_performance (month);
CREATE INDEX IF NOT EXISTS idx_payroll_performance_employee
  ON public.payroll_performance (employee_id);

-- RLS
ALTER TABLE public.payroll_performance ENABLE ROW LEVEL SECURITY;

-- finance 和 hq：可读写
DROP POLICY IF EXISTS "finance_hq_payroll_performance_all" ON public.payroll_performance;
CREATE POLICY "finance_hq_payroll_performance_all"
ON public.payroll_performance FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE user_id = auth.uid() AND role IN ('finance', 'hq')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE user_id = auth.uid() AND role IN ('finance', 'hq')
  )
);

-- store_manager：只读（查看本店员工的绩效）
DROP POLICY IF EXISTS "store_manager_payroll_performance_select" ON public.payroll_performance;
CREATE POLICY "store_manager_payroll_performance_select"
ON public.payroll_performance FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users_profile up
    JOIN public.employees e ON e.id = payroll_performance.employee_id
    WHERE up.user_id = auth.uid()
      AND up.role = 'store_manager'
      AND e.home_store_id = up.store_id
  )
);

-- ────────────────────────────────────────────────────────────
-- 2. payroll_store_bonus（门店奖金：按员工+门店+月份）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_store_bonus (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  month       date        NOT NULL,
  employee_id uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id    uuid        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  note        text,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 唯一约束：同一员工同一门店同一月份只能有一条奖金记录
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_payroll_store_bonus_month_employee_store'
  ) THEN
    ALTER TABLE public.payroll_store_bonus
      ADD CONSTRAINT uq_payroll_store_bonus_month_employee_store
      UNIQUE (month, employee_id, store_id);
    RAISE NOTICE 'payroll_store_bonus 唯一约束已添加';
  ELSE
    RAISE NOTICE 'payroll_store_bonus 唯一约束已存在，跳过';
  END IF;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_payroll_store_bonus_month
  ON public.payroll_store_bonus (month);
CREATE INDEX IF NOT EXISTS idx_payroll_store_bonus_employee
  ON public.payroll_store_bonus (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_store_bonus_store
  ON public.payroll_store_bonus (store_id);

-- RLS
ALTER TABLE public.payroll_store_bonus ENABLE ROW LEVEL SECURITY;

-- finance 和 hq：可读写
DROP POLICY IF EXISTS "finance_hq_payroll_store_bonus_all" ON public.payroll_store_bonus;
CREATE POLICY "finance_hq_payroll_store_bonus_all"
ON public.payroll_store_bonus FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE user_id = auth.uid() AND role IN ('finance', 'hq')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE user_id = auth.uid() AND role IN ('finance', 'hq')
  )
);

-- store_manager：只读本店奖金
DROP POLICY IF EXISTS "store_manager_payroll_store_bonus_select" ON public.payroll_store_bonus;
CREATE POLICY "store_manager_payroll_store_bonus_select"
ON public.payroll_store_bonus FOR SELECT TO authenticated
USING (
  store_id = (
    SELECT up.store_id FROM public.users_profile up
    WHERE up.user_id = auth.uid() AND up.role = 'store_manager'
    LIMIT 1
  )
);

-- ────────────────────────────────────────────────────────────
-- 验证：确认两张表存在且结构正确
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name = 'payroll_performance') AS performance_table_exists,

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'payroll_performance') AS performance_col_count,

  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name = 'payroll_store_bonus') AS bonus_table_exists,

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'payroll_store_bonus') AS bonus_col_count;

-- 期望结果：
-- performance_table_exists = 1
-- performance_col_count    = 8  (id,month,employee_id,amount,note,created_by,created_at,updated_at)
-- bonus_table_exists       = 1
-- bonus_col_count          = 9  (id,month,employee_id,store_id,amount,note,created_by,created_at,updated_at)
