-- ============================================================
-- 第 13b 步：岗位薪资自动化 — 岗位目录数据
-- 依赖：step13a_schema_changes.sql 已执行
-- 名称列：position_catalog.position_name
-- ============================================================

-- ── 补全缺失岗位（与现有「店长」「店员」同一 dept_id；已存在同名则跳过）──
-- 若你库中部门不同，请将下方 dept_id 改为与 SELECT id, dept_id FROM position_catalog LIMIT 1 一致
INSERT INTO public.position_catalog (
  id,
  dept_id,
  position_name,
  position_salary,
  subsidy_monthly,
  work_shift,
  expansion_subsidy_monthly
)
SELECT
  gen_random_uuid(),
  'eeb39329-1d7b-483c-b358-4662fc2a2f17'::uuid,
  t.position_name,
  t.position_salary,
  t.subsidy_monthly,
  t.work_shift,
  t.expansion_subsidy_monthly
FROM (
  VALUES
    ('一级储备店长'::text, 800::numeric, 800::numeric, 10::smallint, 600::numeric),
    ('二级储备店长', 600, 800, 10, 400),
    ('三级储备店长', 400, 800, 10, 200),
    ('四级储备店长', 400, 600, 12, 0),
    ('区域督导', 800, 800, 12, 0),
    ('副店长', 200, 500, 9, 0),
    ('男店员', 400, 500, 12, 0)
) AS t(position_name, position_salary, subsidy_monthly, work_shift, expansion_subsidy_monthly)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.position_catalog p
  WHERE p.position_name = t.position_name
);

-- 一级储备店长（10h，拓店补贴 600）
UPDATE public.position_catalog
SET work_shift = 10, position_salary = 800, subsidy_monthly = 800, expansion_subsidy_monthly = 600
WHERE position_name ILIKE '%一级%储备%店长%'
   OR position_name ILIKE '%一级%（10%';

-- 二级储备店长（10h，拓店补贴 400）
UPDATE public.position_catalog
SET work_shift = 10, position_salary = 600, subsidy_monthly = 800, expansion_subsidy_monthly = 400
WHERE position_name ILIKE '%二级%储备%店长%'
   OR position_name ILIKE '%二级%（10%';

-- 三级储备店长（10h，拓店补贴 200）
UPDATE public.position_catalog
SET work_shift = 10, position_salary = 400, subsidy_monthly = 800, expansion_subsidy_monthly = 200
WHERE position_name ILIKE '%三级%储备%店长%'
   OR position_name ILIKE '%三级%（10%';

-- 四级储备店长（12h，无拓店补贴）
UPDATE public.position_catalog
SET work_shift = 12, position_salary = 400, subsidy_monthly = 600, expansion_subsidy_monthly = 0
WHERE position_name ILIKE '%四级%储备%店长%'
   OR position_name ILIKE '%四级%（12%';

-- 区域督导（12h）
UPDATE public.position_catalog
SET work_shift = 12, position_salary = 800, subsidy_monthly = 800, expansion_subsidy_monthly = 0
WHERE position_name ILIKE '%区域督导%';

-- 男店员（12h）—— 在「店员」之前匹配
UPDATE public.position_catalog
SET work_shift = 12, position_salary = 400, subsidy_monthly = 500, expansion_subsidy_monthly = 0
WHERE position_name ILIKE '%男店员%';

-- 副店长（9h）—— 在「店长」之前匹配
UPDATE public.position_catalog
SET work_shift = 9, position_salary = 200, subsidy_monthly = 500, expansion_subsidy_monthly = 0
WHERE position_name ILIKE '%副店长%';

-- 店员（9h，排除男店员）
UPDATE public.position_catalog
SET work_shift = 9, position_salary = 100, subsidy_monthly = 500, expansion_subsidy_monthly = 0
WHERE position_name ILIKE '%店员%'
  AND position_name NOT ILIKE '%男%';

-- 店长（9h，排除副店长、储备店长、区域督导）
UPDATE public.position_catalog
SET work_shift = 9, position_salary = 300, subsidy_monthly = 600, expansion_subsidy_monthly = 0
WHERE position_name ILIKE '%店长%'
  AND position_name NOT ILIKE '%副%'
  AND position_name NOT ILIKE '%储备%'
  AND position_name NOT ILIKE '%区域%';

-- 全勤奖统一设为 100
UPDATE public.employees
SET perfect_attendance_bonus = 100;

-- ── 抽查：确认各岗位已正确更新 ──────────────────────────────
SELECT position_name, work_shift, position_salary, subsidy_monthly, expansion_subsidy_monthly
FROM public.position_catalog
ORDER BY work_shift, position_salary DESC;
