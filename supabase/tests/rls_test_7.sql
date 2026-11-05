\set ON_ERROR_STOP on
-- Integrantes de ministerio por ficha (sin app) y su sincronización con las cuentas.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare mi uuid; mi2 uuid; sinapp uuid; juan uuid; ana uuid; n int;
begin
  insert into public.ministries (church_id, name) values (public.current_church_id(), 'Prueba Ministerio') returning id into mi;
  insert into public.ministries (church_id, name) values (public.current_church_id(), 'Prueba Ministerio 2') returning id into mi2;

  -- 1. Alguien sin app entra al ministerio.
  insert into public.contacts (name, status, interest) values ('Prueba Sin App', 'member', 'very') returning id into sinapp;
  insert into public.ministry_people (ministry_id, contact_id) values (mi, sinapp);
  if not exists (select 1 from public.ministry_people_list(mi) where contact_id = sinapp and profile_id is null) then
    raise exception 'FALLO: la persona sin app no aparece en el ministerio';
  end if;

  -- 2. Alguien con app: entra también al chat (ministry_members).
  insert into public.contacts (name, status, interest) values ('Prueba Juan Ficha', 'member', 'very') returning id into juan;
  perform public.link_account(juan, '00000000-0000-0000-0000-0000000000c3');
  insert into public.ministry_people (ministry_id, contact_id, is_leader) values (mi, juan, true);
  if not exists (select 1 from public.ministry_members where ministry_id = mi and profile_id = '00000000-0000-0000-0000-0000000000c3' and is_leader) then
    raise exception 'FALLO: la cuenta no quedó en el ministerio (chat y avisos)';
  end if;

  -- 3. Sacarlo de la lista lo saca también del chat.
  delete from public.ministry_people where ministry_id = mi and contact_id = juan;
  if exists (select 1 from public.ministry_members where ministry_id = mi and profile_id = '00000000-0000-0000-0000-0000000000c3') then
    raise exception 'FALLO: sigue en el chat después de sacarlo';
  end if;

  -- 4. Cuando la persona sin app se hace una cuenta y se vincula, entra al chat sola.
  perform public.link_account(sinapp, '00000000-0000-0000-0000-0000000000c2');
  if not exists (select 1 from public.ministry_members where ministry_id = mi and profile_id = '00000000-0000-0000-0000-0000000000c2') then
    raise exception 'FALLO: al vincular la cuenta no entró al ministerio';
  end if;

  -- 5. Una versión vieja de la app que escribe en ministry_members también aparece en la lista.
  insert into public.ministry_members (ministry_id, profile_id) values (mi2, '00000000-0000-0000-0000-0000000000c3');
  if not exists (select 1 from public.ministry_people where ministry_id = mi2 and contact_id = juan) then
    raise exception 'FALLO: lo agregado por la app vieja no aparece en la lista';
  end if;
  select count(*) into n from public.ministry_people_list(mi2);
  if n <> 1 then raise exception 'FALLO: la lista del ministerio 2 tiene % personas, esperaba 1', n; end if;
end $$;

-- 6. Un integrante común (no líder) no puede agregar gente.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$
declare mi uuid; k uuid;
begin
  select id into mi from public.ministries where name = 'Prueba Ministerio';
  select id into k from public.contacts where name = 'Prueba Juan Ficha';
  begin
    insert into public.ministry_people (ministry_id, contact_id) values (mi, k);
    raise exception 'FALLO: un integrante común agregó gente';
  exception when insufficient_privilege or check_violation then null;
    when others then
      if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
reset role;
select 'PARTE 7: TODAS LAS PRUEBAS PASARON' as resultado;
