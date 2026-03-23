-- 安全重算某月工资（Supabase SQL Editor）
-- 用法：
-- 1) 把下面 v_month 改成目标月份首日（例如 2026-03-01）
-- 2) 在 SQL Editor 一次性执行本文件
-- 3) 结果区会返回该月 payroll_month 的最新状态
--
-- 说明：
-- - 会临时关闭 payroll_month 上用于阻止 locked 更新的触发器
-- - 执行解锁（locked -> draft）后调用 api_run_payroll_v2
-- - 无论成功失败，都会尝试恢复触发器

DO $$
DECLARE
  v_month date := DATE '2026-03-01';
  v_lock_trigger_name text;
BEGIN
  -- 定位“锁定月份不可改”触发器
  SELECT t.tgname
  INTO v_lock_trigger_name
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND n.nspname = 'public'
    AND c.relname = 'payroll_month'
    AND t.tgname ILIKE '%prevent_update_locked_payroll%'
  LIMIT 1;

  IF v_lock_trigger_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.payroll_month DISABLE TRIGGER %I',
      v_lock_trigger_name
    );
  END IF;

  BEGIN
    -- 解锁本月工资单（仅 locked -> draft）
    UPDATE public.payroll_month
    SET status = 'draft'
    WHERE month = v_month
      AND status = 'locked';

    -- 运行工资计算（含分摊）
    PERFORM public.api_run_payroll_v2(v_month);
  EXCEPTION
    WHEN OTHERS THEN
      -- 失败也要恢复触发器，避免长期处于关闭状态
      IF v_lock_trigger_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.payroll_month ENABLE TRIGGER %I',
          v_lock_trigger_name
        );
      END IF;
      RAISE;
  END;

  -- 成功后恢复触发器
  IF v_lock_trigger_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.payroll_month ENABLE TRIGGER %I',
      v_lock_trigger_name
    );
  END IF;
END
$$;

-- 查看本月状态（运行后确认）
SELECT month, employee_id, status, total_days, gross_total
FROM public.payroll_month
WHERE month = DATE '2026-03-01'
ORDER BY gross_total DESC, employee_id;
