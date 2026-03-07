-- 门店申请投保、总部购买闭环：employees.status、insurance_requests、employee_insurance、RLS、触发器
-- 在 Supabase SQL Editor 中执行，可重复运行。
-- 若报错 "cannot drop columns from view"，请先单独执行：DROP VIEW IF EXISTS public.v_employee_insurance_status CASCADE;

-- 先删除可能存在的视图，避免后续 ALTER TABLE 或重建视图时报错
DROP VIEW IF EXISTS public.v_employee_insurance_status CASCADE;

-- 1) employees 表：新增/确保 status 字段
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
  WHEN duplicate_object THEN NULL; -- 约束已存在时忽略
END $$;

-- 若列已存在但无约束，尝试添加约束（忽略已存在）
DO $$
BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_status_check
    CHECK (status IN ('pending', 'active', 'inactive'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) 新建表 insurance_requests
CREATE TABLE IF NOT EXISTS public.insurance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_by uuid,
  processed_at timestamptz
);

-- 3) 索引
CREATE INDEX IF NOT EXISTS idx_insurance_requests_employee_id ON public.insurance_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_insurance_requests_store_id ON public.insurance_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_insurance_requests_status ON public.insurance_requests(status);

-- 4) RLS + policy（仅 insurance_requests，不涉及 stores / users_profile）
ALTER TABLE public.insurance_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hq_insurance_requests_all" ON public.insurance_requests;
CREATE POLICY "hq_insurance_requests_all"
ON public.insurance_requests
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE user_id = auth.uid() AND role = 'hq')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.users_profile WHERE user_id = auth.uid() AND role = 'hq')
);

DROP POLICY IF EXISTS "store_manager_insurance_requests_insert_own_store" ON public.insurance_requests;
CREATE POLICY "store_manager_insurance_requests_insert_own_store"
ON public.insurance_requests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users_profile up
    WHERE up.user_id = auth.uid() AND up.role = 'store_manager' AND up.store_id = insurance_requests.store_id
  )
);

DROP POLICY IF EXISTS "store_manager_insurance_requests_select_own_store" ON public.insurance_requests;
CREATE POLICY "store_manager_insurance_requests_select_own_store"
ON public.insurance_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users_profile up
    WHERE up.user_id = auth.uid() AND up.role = 'store_manager' AND up.store_id = insurance_requests.store_id
  )
);

-- 店长无 UPDATE 策略，即不允许 update

-- 5) employee_insurance 表（不存在则创建）
CREATE TABLE IF NOT EXISTS public.employee_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  policy_no text,
  insurer text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6) 触发器：employee_insurance 插入成功后，将 employees.system_status 更新为 'active'
CREATE OR REPLACE FUNCTION public.set_employee_active_on_insurance_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.employees SET system_status = 'active' WHERE id = NEW.employee_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_insurance_set_employee_active ON public.employee_insurance;
CREATE TRIGGER trg_employee_insurance_set_employee_active
  AFTER INSERT ON public.employee_insurance
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_employee_active_on_insurance_insert();

-- 7) 视图：员工是否已购买意外险（用于考勤录入前校验，仅当存在有效保单时方可录入工时）
CREATE OR REPLACE VIEW public.v_employee_insurance_status AS
SELECT
  e.id AS employee_id,
  EXISTS (
    SELECT 1 FROM public.employee_insurance ei
    WHERE ei.employee_id = e.id
      AND ei.status = 'active'
      AND ei.end_date >= current_date
  ) AS is_insured
FROM public.employees e;
