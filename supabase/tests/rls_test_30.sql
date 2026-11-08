\set ON_ERROR_STOP on
-- 0038: copias semanales.
reset role;
do $$ begin
  if public.run_weekly_backups() < 1 then raise exception 'FALLO: no hizo copias'; end if;
  if not exists (select 1 from public.church_backups where church_id = '10000000-0000-0000-0000-000000000001' and data ? 'contacts') then raise exception 'FALLO: copia sin contactos'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin perform 1 from public.church_backups limit 1; raise exception 'FALLO: un usuario leyó las copias';
  exception when insufficient_privilege then null; end;
  begin perform public.run_weekly_backups(); raise exception 'FALLO: un usuario corrió las copias';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
