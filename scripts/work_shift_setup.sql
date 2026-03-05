-- 在 Supabase SQL Editor 中执行：插入班次 9=早班 10=晚班 12=全天，以满足 employees_work_shift_check 约束（仅允许 9, 10, 12）

-- 若表不存在则创建
CREATE TABLE IF NOT EXISTS public.work_shift (
  id integer PRIMARY KEY,
  name text NOT NULL
);

ALTER TABLE public.work_shift ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_authenticated_select_work_shift" ON public.work_shift;
CREATE POLICY "allow_authenticated_select_work_shift"
ON public.work_shift FOR SELECT TO authenticated USING (true);

-- 插入约束允许的 id：9, 10, 12（对应工作时长）
INSERT INTO public.work_shift (id, name)
VALUES (9, '9小时/天'), (10, '10小时/天'), (12, '12小时/天')
ON CONFLICT (id) DO NOTHING;
