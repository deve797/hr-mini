-- 门店可调用员工池：store_staff_pool
-- 用于投保申请页等按「本店可调用员工」过滤，而非按 employees.current_store_id。
-- 在 Supabase SQL Editor 中执行，可重复运行。

-- 1) 建表
CREATE TABLE IF NOT EXISTS public.store_staff_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) 唯一约束：同一门店下同一员工只能出现一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_staff_pool_store_employee
  ON public.store_staff_pool (store_id, employee_id);

-- 3) 便于按门店、按员工查询
CREATE INDEX IF NOT EXISTS idx_store_staff_pool_store_id ON public.store_staff_pool(store_id);
CREATE INDEX IF NOT EXISTS idx_store_staff_pool_employee_id ON public.store_staff_pool(employee_id);
CREATE INDEX IF NOT EXISTS idx_store_staff_pool_status ON public.store_staff_pool(status);

-- 4) RLS
ALTER TABLE public.store_staff_pool ENABLE ROW LEVEL SECURITY;

-- HQ：可查看、插入、更新、删除全部
DROP POLICY IF EXISTS "hq_store_staff_pool_all" ON public.store_staff_pool;
CREATE POLICY "hq_store_staff_pool_all"
ON public.store_staff_pool
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE user_id = auth.uid() AND role = 'hq')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.users_profile WHERE user_id = auth.uid() AND role = 'hq')
);

-- 店长：仅可查看自己门店的池（SELECT only，不可 insert/update/delete）
DROP POLICY IF EXISTS "store_manager_store_staff_pool_select_own" ON public.store_staff_pool;
CREATE POLICY "store_manager_store_staff_pool_select_own"
ON public.store_staff_pool
FOR SELECT
TO authenticated
USING (
  store_id = (
    SELECT up.store_id FROM public.users_profile up
    WHERE up.user_id = auth.uid() AND up.role = 'store_manager'
    LIMIT 1
  )
);

-- 说明：insert/update/delete 仅通过 "hq_store_staff_pool_all" 对 HQ 开放，店长无写权限。
