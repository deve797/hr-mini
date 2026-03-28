-- ============================================================
-- 第 13e 步：一次性批量对齐员工班次 / 基本工资 / 全勤奖
-- 从 position_catalog 读取 work_shift，按班次规则写 base_salary、perfect_attendance_bonus
-- 说明：不修改 position_id；触发器为 UPDATE OF position_id，本 UPDATE 不会重复触发
-- 依赖：step13b（岗位 work_shift 已填）
-- 在 Supabase SQL Editor 中执行
-- ============================================================

UPDATE public.employees e
SET
  work_shift               = pc.work_shift::integer,
  base_salary              = CASE WHEN pc.work_shift = 12 THEN 1800 ELSE 1500 END,
  perfect_attendance_bonus = 100
FROM public.position_catalog pc
WHERE pc.id = e.position_id
  AND e.position_id IS NOT NULL
  AND pc.work_shift IS NOT NULL;

-- ── 验证 ─────────────────────────────────────────────────────
SELECT
  e.name,
  pc.position_name,
  e.work_shift,
  e.base_salary,
  e.perfect_attendance_bonus
FROM public.employees e
LEFT JOIN public.position_catalog pc ON pc.id = e.position_id
WHERE e.position_id IS NOT NULL
ORDER BY e.name;
