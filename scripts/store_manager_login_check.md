# 店长账号无法登录 — 排查清单

按顺序在 Supabase Dashboard 和本应用里检查以下项。

## 1. Authentication 里是否有该店长用户

- 打开 **Supabase → Authentication → Users**
- 用店长邮箱搜索，确认存在对应用户
- 若不存在：点击 **Add user** → 填写邮箱与密码 → 创建

## 2. 密码是否正确

- 若忘记密码：在 **Authentication → Users** 找到该用户 → **...** → **Send password recovery**，或直接 **Reset password** 设新密码后再用新密码登录

## 3. 邮箱是否已确认（最常见）

- 若项目开启了 **Confirm email**，新创建或邀请的用户必须“已确认”才能用密码登录
- 在 **Authentication → Users** 找到店长用户，查看 **Email Confirmed At** 是否有时间
- 若为空：点进该用户，在 **Email** 处勾选 **Auto Confirm User** 或到 **Authentication → Providers → Email** 暂时关闭 **Confirm email**
- 或在 SQL Editor 执行（把 `'店长邮箱@xxx.com'` 换成实际邮箱）：
  ```sql
  UPDATE auth.users SET email_confirmed_at = now() WHERE email = '店长邮箱@xxx.com';
  ```

## 4. users_profile 是否有店长记录

- 打开 **Table Editor → users_profile**
- 确认存在一行：**user_id** = 该店长在 Authentication → Users 里的 **User UID**（复制 UUID），**role** = `store_manager`，**store_id** = 所属门店的 UUID
- 若没有：在 **SQL Editor** 执行（替换两个 UUID）：
  ```sql
  INSERT INTO public.users_profile (user_id, role, store_id)
  VALUES (
    '这里填店长在 Auth 里的 User UID',
    'store_manager',
    '这里填门店的 UUID'
  )
  ON CONFLICT (user_id) DO UPDATE SET role = 'store_manager', store_id = EXCLUDED.store_id;
  ```
- 若表主键不是 `user_id` 或没有 ON CONFLICT，请直接在该表里新增一行并填好 `user_id`、`role`、`store_id`

## 5. RLS 是否允许读自己的 profile

- 在 **SQL Editor** 执行项目里的 **scripts/users_profile_rls.sql**（或执行以下内容）：
  ```sql
  ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "users_can_read_own_profile" ON public.users_profile;
  CREATE POLICY "users_can_read_own_profile"
  ON public.users_profile FOR SELECT TO authenticated
  USING (user_id = auth.uid());
  ```

## 6. 看浏览器里具体报错

- 用店长账号在登录页输入邮箱、密码，点击登录
- 若失败，页面上会显示：**登录失败 [错误码]: 错误信息** 以及一段中文提示
- **invalid_credentials**：用户不存在或密码错误，对照上面 1、2
- **email_not_confirmed**：邮箱未确认，对照上面 3
- 其他错误码/信息：把完整内容发给技术支持或查 Supabase 文档

完成 1～5 后，再用店长账号尝试登录；若仍失败，把登录页的完整报错贴出来便于继续排查。
