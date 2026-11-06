\set ON_ERROR_STOP on
-- Desvincular una cuenta que se unió sola a una ficha por el celular.
reset role;
insert into public.contacts (id, church_id, created_by, name, phone, status, profile_id)
values ('90000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Ficha equivocada', '3764000999', 'contact', null);
update public.contacts set profile_id = null where profile_id = '00000000-0000-0000-0000-0000000000c3';
update public.contacts set profile_id = '00000000-0000-0000-0000-0000000000c3' where id = '90000000-0000-0000-0000-000000000009';
insert into public.notifications (church_id, user_id, kind, title, body, link)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'link', 'Cuenta vinculada por teléfono', 'x', '/contacto/90000000-0000-0000-0000-000000000009');
do $$ begin
  if (select link from public.notifications where kind = 'link' order by created_at desc limit 1) not like '%?vinculo=1' then
    raise exception 'FALLO: el aviso no abre el cartel de revisión'; end if;
end $$;

-- Un miembro no puede desvincular.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  begin
    perform public.unlink_account('90000000-0000-0000-0000-000000000009');
    raise exception 'FALLO: un miembro pudo desvincular';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- La secretaría sí; la cuenta queda con una ficha propia.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  perform public.unlink_account('90000000-0000-0000-0000-000000000009');
end $$;
reset role;
do $$ begin
  if (select profile_id from public.contacts where id = '90000000-0000-0000-0000-000000000009') is not null then
    raise exception 'FALLO: la ficha sigue unida'; end if;
  if (select count(*) from public.contacts where profile_id = '00000000-0000-0000-0000-0000000000c3') <> 1 then
    raise exception 'FALLO: la cuenta no quedó con una ficha propia'; end if;
end $$;
