-- 薪资核对与店长审核：payroll_month 增加店长审核字段 + RPC，财务角色在 users_profile 中配置 role='finance' 即可。
-- 在 Supabase SQL Editor 中执行。

-- 1) payroll_month 表增加店长审核字段
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_month' AND column_name = 'store_approved_at'
  ) THEN
    ALTER TABLE public.payroll_month ADD COLUMN store_approved_at timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_month' AND column_name = 'store_approved_by'
  ) THEN
    ALTER TABLE public.payroll_month ADD COLUMN store_approved_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- 2) RPC：店长按「本店 + 月份」一键审核
CREATE OR REPLACE FUNCTION public.api_store_approve_payroll_month(p_month date, p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payroll_month pm
  SET
    store_approved_at = now(),
    store_approved_by = auth.uid()
  WHERE pm.month = p_month
    AND pm.employee_id IN (
      SELECT id FROM public.employees WHERE home_store_id = p_store_id
    );
END;
$$;

-- 3) 财务角色说明（无需改表结构）
-- users_profile 中为财务账号设置 role = 'finance'、store_id 可为空。
-- 与总部(hq)一样，需在 RLS 中允许 finance 访问 payroll_month、payroll_store_split 等表（若当前仅允许 hq，则增加 OR up.role = 'finance'）。
