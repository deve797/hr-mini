CREATE OR REPLACE FUNCTION public.api_run_payroll_v2(p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  perform run_payroll_v2(p_month);
end;
$function$