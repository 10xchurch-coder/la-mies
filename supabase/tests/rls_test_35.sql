\set ON_ERROR_STOP on
-- 0043: borrar mi cuenta en el momento; lo de la iglesia pasa al administrador.
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'borrar@test');
insert into public.profiles (id, church_id, role, display_name) values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', 'member', 'Para Borrar');
insert into public.contacts (id, church_id, created_by, name, status, profile_id, phone) values
  ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Para Borrar', 'member', '00000000-0000-0000-0000-0000000000d1', '111'),
  ('20000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Vecino visitado', 'contact', null, '222');
insert into public.attendances (church_id, contact_id, attended_on, service, recorded_by, service_id)
  select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000d2', current_date, 'sun', '00000000-0000-0000-0000-0000000000d1', s.id
  from public.church_services s where s.church_id = '10000000-0000-0000-0000-000000000001' limit 1;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
select public.delete_my_account();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000d1') then raise exception 'FALLO: el usuario sigue'; end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000d1') then raise exception 'FALLO: el perfil sigue'; end if;
  if (select created_by from public.contacts where id = '20000000-0000-0000-0000-0000000000d2') <> '00000000-0000-0000-0000-00000000000a' then raise exception 'FALLO: la ficha visitada no pasó al admin'; end if;
  if (select count(*) from public.attendances where contact_id = '20000000-0000-0000-0000-0000000000d2') <> (select least(count(*),1) from public.church_services where church_id = '10000000-0000-0000-0000-000000000001') then raise exception 'FALLO: se perdió la asistencia'; end if;
  if (select name || coalesce(phone,'') from public.contacts where id = '20000000-0000-0000-0000-0000000000d1') <> 'Cuenta eliminada' then raise exception 'FALLO: la ficha propia no quedó anónima'; end if;
end $$;
delete from public.contacts where id in ('20000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d2');
-- El único administrador no puede borrarse.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception 'FALLO: el único admin se borró';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
