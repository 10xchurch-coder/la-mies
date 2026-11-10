\set ON_ERROR_STOP on
-- 0048: certificado de bautismo.
reset role;
select set_config('request.jwt.claim.sub', '', false);
select id as cid from public.contacts where profile_id = '00000000-0000-0000-0000-000000000002' and not archived limit 1 \gset
update public.contacts set baptized_on = null where id = :'cid';
delete from public.notifications where kind = 'certificate';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  if exists (select 1 from public.baptism_certificate((select id from public.contacts where profile_id = auth.uid() limit 1))) then raise exception 'FALLO: certificado sin bautismo'; end if;
end $$;
reset role;
update public.contacts set baptized_on = date '2026-11-08', baptized_here = true where id = :'cid';
select set_config('test.c', :'cid', false);
set role authenticated;
do $$ begin
  if (select count(*) from public.baptism_certificate(current_setting('test.c')::uuid)) <> 1 then raise exception 'FALLO: no ve su certificado'; end if;
  if (select number from public.baptism_certificate(current_setting('test.c')::uuid)) not like 'B-2026-______' then raise exception 'FALLO: número'; end if;
  if public.my_baptism_certificate_id() is distinct from current_setting('test.c')::uuid then raise exception 'FALLO: my id'; end if;
  if not exists (select 1 from public.notifications where user_id = auth.uid() and kind = 'certificate') then raise exception 'FALLO: aviso'; end if;
end $$;
-- Otro miembro común no puede ver el certificado de ella.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if exists (select 1 from public.baptism_certificate(current_setting('test.c')::uuid)) then raise exception 'FALLO: certificado ajeno'; end if;
end $$;
-- Bautismo hecho en otra iglesia: no hay certificado.
reset role;
update public.contacts set baptized_here = false where id = :'cid';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  if exists (select 1 from public.baptism_certificate(current_setting('test.c')::uuid)) then raise exception 'FALLO: certificado de bautismo ajeno'; end if;
end $$;
reset role;
