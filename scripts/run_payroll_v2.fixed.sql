CREATE OR REPLACE FUNCTION public.run_payroll_v2(p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_month date := date_trunc('month', p_month)::date;
begin
  -- 重新计算基础工资（但不覆盖手录项）
  perform run_payroll(v_month);

  -- 把手录奖金加进去
  update payroll_month
  set gross_total =
        gross_total
      + performance_manual
      + bonus_manual
      + adjustment_manual
  where month = v_month;

  -- 重建分摊
  delete from payroll_store_split where month = v_month;

  insert into payroll_store_split(month, employee_id, store_id, workdays, ratio, store_total)
  select
    mw.month,
    mw.employee_id,
    mw.store_id,
    mw.workdays,
    (mw.workdays / nullif(pm.total_days,0))::numeric(10,6),
    round(pm.gross_total * (mw.workdays / nullif(pm.total_days,0)), 2)
  from monthly_workdays mw
  join payroll_month pm
    on pm.month = mw.month and pm.employee_id = mw.employee_id
  where mw.month = v_month and pm.total_days > 0;

  -- 差额修正
  with s as (
    select employee_id, sum(store_total)::numeric(12,2) as split_sum
    from payroll_store_split
    where month = v_month
    group by employee_id
  ),
  d as (
    select pm.employee_id, (pm.gross_total - s.split_sum)::numeric(12,2) as diff
    from payroll_month pm
    join s on s.employee_id = pm.employee_id
    where pm.month = v_month and (pm.gross_total - s.split_sum) <> 0
  ),
  target as (
    select distinct on (employee_id) employee_id, id
    from payroll_store_split
    where month = v_month
    order by employee_id, workdays desc
  )
  update payroll_store_split ps
  set store_total = ps.store_total + d.diff
  from d
  join target t on t.employee_id = d.employee_id
  where ps.id = t.id;

end;
$function$
