-- 确保店长/HQ 登录后能读取自己的 users_profile（解决「店长账号不能登录」或登录后看不到身份）
-- 在 Supabase SQL Editor 中执行，可重复运行。
-- 前置：Authentication 中已创建用户；users_profile 表已有对应用户的 user_id、role、store_id。

ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;

-- 已登录用户只能读自己的 profile 行（按 user_id = auth.uid()）
DROP POLICY IF EXISTS "users_can_read_own_profile" ON public.users_profile;
CREATE POLICY "users_can_read_own_profile"
ON public.users_profile
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 如需允许用户更新自己的部分字段（例如仅 profile 表内非敏感字段），可在此追加 UPDATE 策略；
-- 若 profile 仅由后端/管理员维护，则只保留上面 SELECT 即可。
