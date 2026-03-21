-- employees.user_id：将登录账号（auth.users）与员工档案关联，便于店长本人参与考勤/工资/员工池。
-- 在 Supabase SQL Editor 中执行一次。

-- 1) 列与唯一约束（每个登录账号最多绑定一条员工档案）
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- 外键到 auth.users（若环境不允许跨 schema 引用，可改为仅 UNIQUE + 应用层校验）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_user_id_fkey'
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_user_id_not_null
  ON public.employees(user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.employees.user_id IS '登录用户 UUID（auth.users.id），与账号一一对应；用于本人考勤/工资与员工池。';

-- 2) 可选：已存在档案时，在 Table Editor 或 SQL 中绑定店长示例
-- UPDATE public.employees SET user_id = '<Auth 用户的 UUID>' WHERE id = '<employees.id>';

-- 3) RLS 建议（按你现有 employees 策略合并，勿重复创建冲突策略）
--    - INSERT/UPDATE：若写入 user_id，应限制为 user_id IS NULL OR user_id = auth.uid()，防止绑到他人账号。
--    - SELECT：允许用户读取 user_id = auth.uid() 的员工行（便于「我是谁」页展示）。
