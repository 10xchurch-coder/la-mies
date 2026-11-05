\set ON_ERROR_STOP on
-- Familia, bautismo, turnos por ficha, contacto que pasa a visita.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a1a', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare a uuid; b uuid; n int; k uuid;
begin
  insert into public.contacts (name, status, marital, baptized, baptized_here, interest)
    values ('Prueba Esposo', 'member', 'separated', true, false, 'very') returning id into a;
  insert into public.contacts (name, status, marital, interest) values ('Prueba Esposa', 'member', 'divorced', 'very') returning id into b;
  update public.contacts set spouse_id = b where id = a;
  if (select spouse_id from public.contacts where id = b) <> a then raise exception 'FALLO: el cónyuge no quedó en los dos sentidos'; end if;
  insert into public.contact_children (contact_id, name, birthdate) values (a, 'Nene', '2020-05-05');
  insert into public.contact_children (contact_id, name, age) values (b, 'Nena', 3);
  select count(*) into n from public.family_children(b);
  if n <> 2 then raise exception 'FALLO: los hijos de la familia son %, esperaba 2', n; end if;
  if (select count(*) from public.search_people('espos')) < 2 then raise exception 'FALLO: búsqueda de personas'; end if;
  -- Contacto que viene a la iglesia pasa a visita.
  insert into public.contacts (name, status, interest) values ('Prueba Contacto', 'contact', 'some') returning id into k;
  perform public.set_attendance(k, current_date, (select id from public.church_services where main order by sort_order limit 1), true);
  if (select status from public.contacts where id = k) <> 'visitor' then raise exception 'FALLO: el contacto no pasó a visita'; end if;
  -- Turno con maestro por ficha.
  insert into public.class_schedule (class_id, on_date, teacher_contact_id)
    values ((select id from public.classes order by sort_order limit 1), current_date + 1, a);
  if not exists (select 1 from public.class_schedule where teacher_contact_id = a) then raise exception 'FALLO: turno por ficha'; end if;
end $$;
reset role;
select 'PARTE 6: TODAS LAS PRUEBAS PASARON' as resultado;
