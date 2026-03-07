-- 补充：让 finance 与 hq 一样对 store_staff_pool 拥有全读写权限
-- 在 Supabase SQL Editor 中执行。若已存在 hq_store_staff_pool_all 会先删除再建新策略。

DROP POLICY IF EXISTS "hq_store_staff_pool_all" ON public.store_staff_pool;

CREATE POLICY "hq_finance_store_staff_pool_all"
ON public.store_staff_pool
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE user_id = auth.uid() AND role IN ('hq', 'finance')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE user_id = auth.uid() AND role IN ('hq', 'finance')
  )
);

-- 说明：店长策略 store_manager_store_staff_pool_select_own 保持不变（仅 SELECT 自己 store_id，无 insert/update/delete）。
