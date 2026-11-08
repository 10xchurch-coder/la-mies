\set ON_ERROR_STOP on
-- 0041: unir dos fichas de la misma persona.
reset role;
do $$ declare s uuid; begin
  select id into s from public.church_services where church_id = '10000000-0000-0000-0000-000000000001' limit 1;
  if s is null then
    insert into public.church_services (church_id, name, dow, starts_at) values ('10000000-0000-0000-0000-000000000001', 'Culto', 0, '10:00') returning id into s;
  end if;
  insert into public.contacts (id, church_id, created_by, name, status, phone)
  values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Leo', 'member', null),
         ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Leonardo Pérez', 'contact', '3764 111222');
  insert into public.attendances (church_id, contact_id, attended_on, service, recorded_by, service_id) values
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', '2026-11-01', 'sun', '00000000-0000-0000-0000-00000000000a', s),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a2', '2026-11-01', 'sun', '00000000-0000-0000-0000-00000000000a', s),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', '2026-10-25', 'sun', '00000000-0000-0000-0000-00000000000a', s);
end $$;
-- un miembro no puede unir
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  begin perform public.merge_contacts('20000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a1'); raise exception 'FALLO: un miembro unió fichas';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
-- el pastor une: queda Leonardo con las dos asistencias (la repetida una sola vez) y estado miembro
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.merge_contacts('20000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a1', null);
reset role;
do $$ declare n int; st text; ph text; begin
  select count(*) into n from public.attendances where contact_id = '20000000-0000-0000-0000-0000000000a2';
  if n <> 2 then raise exception 'FALLO: asistencias % (esperaba 2)', n; end if;
  select status, phone into st, ph from public.contacts where id = '20000000-0000-0000-0000-0000000000a2';
  if st <> 'member' or ph is null then raise exception 'FALLO: datos %, %', st, ph; end if;
  if not exists (select 1 from public.contacts where id = '20000000-0000-0000-0000-0000000000a1' and archived and merged_into = '20000000-0000-0000-0000-0000000000a2') then
    raise exception 'FALLO: la ficha vieja no quedó archivada';
  end if;
  if exists (select 1 from public.attendances where contact_id = '20000000-0000-0000-0000-0000000000a1') then raise exception 'FALLO: quedaron asistencias en la vieja'; end if;
end $$;
delete from public.attendances where contact_id in ('20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2');
update public.contacts set merged_into = null where id = '20000000-0000-0000-0000-0000000000a1';
delete from public.contacts where id in ('20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2');
