-- 在 Supabase SQL Editor 中执行本文件：创建签约主体表并插入示例数据

-- 1. 若表不存在则创建（按需调整列类型）
CREATE TABLE IF NOT EXISTS public.contract_entity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. 启用 RLS
ALTER TABLE public.contract_entity ENABLE ROW LEVEL SECURITY;

-- 3. 允许已登录用户读取签约主体（供员工入职下拉使用）
DROP POLICY IF EXISTS "allow_authenticated_select_contract_entity" ON public.contract_entity;
CREATE POLICY "allow_authenticated_select_contract_entity"
ON public.contract_entity
FOR SELECT
TO authenticated
USING (true);

-- 4. 若表为空则插入一条示例签约主体
INSERT INTO public.contract_entity (name)
SELECT '默认签约主体'
WHERE NOT EXISTS (SELECT 1 FROM public.contract_entity LIMIT 1);
