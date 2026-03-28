-- Step 5: 更新 enforce_payable_employee 触发器，支持月中转正
-- 月中转正场景：试用期员工在同一个月内既有试用期天数又有转正后天数
-- 修改前：试用期员工 regular_days > 0 会报错
-- 修改后：允许 trial_days > 0 AND regular_days > 0 同时存在（月中转正）

-- 只保留以下限制：
--   1. 员工 system_status 必须为 'active'
--   2. 非试用期员工（转正/离职等）不允许录入 trial_days > 0

CREATE OR REPLACE FUNCTION public.enforce_payable_employee()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_system_status      text;
  v_employment_status  text;
BEGIN
  SELECT system_status, employment_status
    INTO v_system_status, v_employment_status
    FROM public.employees
   WHERE id = NEW.employee_id;

  -- 员工必须 active 才允许录工时
  IF v_system_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Employee not payable: system_status=%', v_system_status;
  END IF;

  -- 转正员工不允许录 trial_days
  IF v_employment_status IS DISTINCT FROM '试用期' THEN
    IF COALESCE(NEW.trial_days, 0) > 0 THEN
      RAISE EXCEPTION 'Regular employee cannot have trial_days';
    END IF;
  END IF;

  -- 试用期员工：
  --   允许 trial_days > 0, regular_days = 0  （纯试用期出勤）
  --   允许 trial_days > 0, regular_days > 0  （月中转正）
  --   不允许 trial_days = 0, regular_days > 0 （试用期员工不能只录转正天数）
  IF v_employment_status = '试用期' THEN
    IF COALESCE(NEW.trial_days, 0) = 0 AND COALESCE(NEW.regular_days, 0) > 0 THEN
      RAISE EXCEPTION 'Trial employee cannot have regular_days without trial_days (use mid-month conversion)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 验证触发器是否已关联到 monthly_workdays 表
SELECT
  t.tgname   AS trigger_name,
  c.relname  AS table_name,
  p.proname  AS function_name
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_proc p      ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND (t.tgname ILIKE '%payable%' OR p.proname ILIKE '%payable%');
