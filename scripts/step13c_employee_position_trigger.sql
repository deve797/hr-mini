-- ============================================================
-- 第 13c 步：岗位薪资自动化 — 员工岗位联动触发器
-- 当 employees.position_id 插入或更新时，从 position_catalog 同步：
-- （含 SET position_id = position_id 触发的重算，用于批量对齐旧数据）
--   work_shift、base_salary（9/10h→1500，12h→1800）、perfect_attendance_bonus（100）
-- 依赖：step13a、step13b（position_catalog.work_shift 已填）
-- 在 Supabase SQL Editor 中执行
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_employee_from_position_catalog()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_work_shift smallint;
BEGIN
  IF NEW.position_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pc.work_shift
  INTO v_work_shift
  FROM public.position_catalog pc
  WHERE pc.id = NEW.position_id;

  IF NOT FOUND THEN
    RAISE WARNING 'sync_employee_from_position_catalog: position_id % 在 position_catalog 中不存在', NEW.position_id;
    RETURN NEW;
  END IF;

  IF v_work_shift IS NULL THEN
    RAISE WARNING 'sync_employee_from_position_catalog: position_id % 的 work_shift 为空，跳过同步', NEW.position_id;
    RETURN NEW;
  END IF;

  NEW.work_shift := v_work_shift::integer;
  NEW.base_salary := CASE WHEN v_work_shift = 12 THEN 1800 ELSE 1500 END;
  NEW.perfect_attendance_bonus := 100;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_sync_from_position_catalog ON public.employees;

CREATE TRIGGER trg_employees_sync_from_position_catalog
BEFORE INSERT OR UPDATE OF position_id ON public.employees
FOR EACH ROW
EXECUTE PROCEDURE public.sync_employee_from_position_catalog();

-- ── 说明：已有员工可执行 step13e_sync_employees.sql，或：
-- UPDATE public.employees SET position_id = position_id WHERE position_id IS NOT NULL;

-- ── 验证 ─────────────────────────────────────────────────────
SELECT
  t.tgname AS trigger_name,
  p.proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'employees'
  AND NOT t.tgisinternal
  AND t.tgname = 'trg_employees_sync_from_position_catalog';
