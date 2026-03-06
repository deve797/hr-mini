-- 员工编号自动生成：E0001, E0002, ... 全公司递增，INSERT 时由 trigger 填充，并发安全，可重复执行。
-- 在 Supabase SQL Editor 中一次性执行。

-- 1) 若 employees 表没有 emp_no 列则新增（项目已有则跳过）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'emp_no'
  ) THEN
    ALTER TABLE public.employees ADD COLUMN emp_no text;
  END IF;
END $$;

-- 2) 创建序列（仅当不存在时），从 1 开始，并发安全
CREATE SEQUENCE IF NOT EXISTS public.seq_employees_emp_no
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- 3) 触发器函数：仅在 NEW.emp_no 为空或 NULL 时生成 'E' || 下一个序列值
CREATE OR REPLACE FUNCTION public.fn_employees_set_emp_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_val bigint;
  new_no  text;
BEGIN
  IF (NEW.emp_no IS NULL OR trim(NEW.emp_no) = '') THEN
    next_val := nextval('public.seq_employees_emp_no');
    new_no   := 'E' || next_val::text;
    NEW.emp_no := new_no;
    IF (SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'id_number'
    )) THEN
      NEW.id_number := new_no;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4) 删除旧触发器后重新创建（可重复执行）
DROP TRIGGER IF EXISTS tr_employees_set_emp_no ON public.employees;
CREATE TRIGGER tr_employees_set_emp_no
  BEFORE INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_employees_set_emp_no();

-- 5) 迁移：为已有员工中 emp_no 为空或 NULL 的按当前最大号往后补齐（只补空值，不覆盖已有编号）
DO $$
DECLARE
  max_no bigint;
  r      record;
  cur_no bigint;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(emp_no, '^E', '', 'i'), '')::bigint
  ), 0) INTO max_no
  FROM public.employees
  WHERE emp_no IS NOT NULL AND trim(emp_no) <> '';

  cur_no := max_no;
  FOR r IN
    SELECT id FROM public.employees
    WHERE emp_no IS NULL OR trim(emp_no) = ''
    ORDER BY id
  LOOP
    cur_no := cur_no + 1;
    UPDATE public.employees SET emp_no = 'E' || cur_no::text WHERE id = r.id;
  END LOOP;

  IF cur_no > max_no THEN
    PERFORM setval('public.seq_employees_emp_no', cur_no);
  ELSE
    PERFORM setval('public.seq_employees_emp_no', (SELECT COALESCE(MAX(
      NULLIF(regexp_replace(emp_no, '^E', '', 'i'), '')::bigint
    ), 0) FROM public.employees));
  END IF;
END $$;

-- 6) 唯一约束（若已存在则忽略）
DO $$
BEGIN
  ALTER TABLE public.employees ADD CONSTRAINT uq_employees_emp_no UNIQUE (emp_no);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 7) 非空约束：仅当不存在空值时设置 NOT NULL（迁移后应无空值）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE emp_no IS NULL OR trim(emp_no) = '') THEN
    ALTER TABLE public.employees ALTER COLUMN emp_no SET NOT NULL;
  END IF;
END $$;
