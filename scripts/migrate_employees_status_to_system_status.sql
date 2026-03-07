-- 员工状态字段迁移：employees.status → employment_status + system_status
-- 若数据库已删除 employees.status，仅需执行触发器函数更新（下方第二部分）。
-- 在 Supabase SQL Editor 中执行。

-- 1) 更新触发器：employee_insurance 插入后，将 employees.system_status 置为 'active'
--    （旧版写入 employees.status，现已改为 system_status）
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
