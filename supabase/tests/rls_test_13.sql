\set ON_ERROR_STOP on
-- 0018: informe con clases y reuniones; progreso mensual solo para líderes.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ declare r jsonb; begin
  r := public.weekly_report(null, null);
  if jsonb_typeof(r->'classes') <> 'array' or jsonb_typeof(r->'services') <> 'array' then raise exception 'FALLO: el informe no trae clases y reuniones'; end if;
  if (select count(*) from public.church_progress(null)) < 1 then raise exception 'FALLO: progreso vacío'; end if;
  if (select count(*) from public.church_progress(3)) > 3 then raise exception 'FALLO: no respeta los meses'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  begin perform * from public.church_progress(null); raise exception 'FALLO: un miembro vio el progreso';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
