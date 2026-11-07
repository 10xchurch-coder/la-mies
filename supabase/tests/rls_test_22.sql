\set ON_ERROR_STOP on
-- 0029: privacidad de personas, ministerios y clases.
reset role;
insert into public.contacts (id, church_id, name, status, created_by) values
  ('d0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'Miembro cargado por la secretaría', 'member', '00000000-0000-0000-0000-0000000000c1'),
  ('d0000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'Contacto de c3', 'contact', '00000000-0000-0000-0000-0000000000c3')
on conflict (id) do nothing;
delete from public.ministry_members where profile_id = '00000000-0000-0000-0000-0000000000c3';
update public.profiles set takes_attendance = false where id = '00000000-0000-0000-0000-0000000000c3';
insert into public.ministries (id, church_id, name) values ('e0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'Ministerio de prueba') on conflict do nothing;
insert into public.ministry_members (ministry_id, profile_id) values ('e0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  if exists (select 1 from public.contacts where id = 'd0000000-0000-0000-0000-0000000000a1') then raise exception 'FALLO: un miembro ve a todos los miembros'; end if;
  if not exists (select 1 from public.contacts where id = 'd0000000-0000-0000-0000-0000000000a2') then raise exception 'FALLO: no ve a su propio contacto'; end if;
  if exists (select 1 from public.ministries where id = 'e0000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO: ve un ministerio donde no está'; end if;
  if exists (select 1 from public.classes) then raise exception 'FALLO: un miembro ve las clases'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if not exists (select 1 from public.ministries where id = 'e0000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO: no ve su ministerio'; end if;
  if not exists (select 1 from public.ministry_members where ministry_id = 'e0000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO: no ve a los de su ministerio'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if not exists (select 1 from public.contacts where id = 'd0000000-0000-0000-0000-0000000000a1') then raise exception 'FALLO: el pastor no ve a los miembros'; end if;
  if not exists (select 1 from public.ministries where id = 'e0000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO: el pastor no ve los ministerios'; end if;
end $$;
reset role;
