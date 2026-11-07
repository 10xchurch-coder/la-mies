\set ON_ERROR_STOP on
-- 0021: informe del domingo y informes escritos.
reset role;
do $$ declare n int; d date := current_date - extract(dow from current_date)::int; begin
  -- domingo 15 h sin asistencia: todavía no sale
  n := public.run_weekly_report('10000000-0000-0000-0000-000000000001', (d + time '15:00')::timestamp);
  if n <> 0 then raise exception 'FALLO: salió sin asistencia antes de las 20'; end if;
  -- domingo 20 h: sale igual, una sola vez
  n := public.run_weekly_report('10000000-0000-0000-0000-000000000001', (d + time '20:05')::timestamp);
  if n < 1 then raise exception 'FALLO: no salió a las 20'; end if;
  n := public.run_weekly_report('10000000-0000-0000-0000-000000000001', (d + time '21:05')::timestamp);
  if n <> 0 then raise exception 'FALLO: salió dos veces'; end if;
  -- el pastor recibe finanzas; un miembro sin acceso no
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'report' and body like '%Finanzas:%') then
    raise exception 'FALLO: el pastor no recibió finanzas en el informe'; end if;
  perform public.post_pastor_report('10000000-0000-0000-0000-000000000001', 'monthly', '2026-10', 'Informe de octubre', '## Resumen' || chr(10) || '- Todo bien', true);
  perform public.post_pastor_report('10000000-0000-0000-0000-000000000001', 'monthly', '2026-10', 'Informe de octubre', '## Resumen' || chr(10) || '- Corregido', true);
  if (select count(*) from public.pastor_reports where period = '2026-10') <> 1 then raise exception 'FALLO: informe duplicado'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  if exists (select 1 from public.pastor_reports) then raise exception 'FALLO: un miembro ve informes del pastor'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if not exists (select 1 from public.pastor_reports where body like '%Corregido%') then raise exception 'FALLO: el pastor no ve el informe'; end if;
end $$;
reset role;
