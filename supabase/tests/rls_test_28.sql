\set ON_ERROR_STOP on
-- 0036: seguimiento de visitas, niños, rutas y comentarios en vivo.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ declare v uuid; kid uuid; code text; n int; begin
  insert into public.contacts (church_id, created_by, name, status) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Visita Nueva', 'visitor') returning id into v;
  insert into public.church_services (church_id, name, dow, time, main)
  select '10000000-0000-0000-0000-000000000001', 'Prueba hoy', extract(dow from public.church_today())::int, '10:00', true
  where not exists (select 1 from public.church_services where church_id = '10000000-0000-0000-0000-000000000001' and dow = extract(dow from public.church_today())::int);
  perform public.set_attendance(v, public.church_today(), (select id from public.church_services where church_id = '10000000-0000-0000-0000-000000000001' and dow = extract(dow from public.church_today())::int limit 1), true);
  select count(*) into n from public.follow_up_tasks where contact_id = v;
  if n <> 2 then raise exception 'FALLO: no se crearon la llamada y la visita (%)', n; end if;
  insert into public.contact_visits (contact_id, note) values (v, 'Lo llamé');
  if exists (select 1 from public.follow_up_tasks where contact_id = v and done_at is null) then raise exception 'FALLO: la visita no cerró las tareas'; end if;
  -- niños
  insert into public.contacts (church_id, created_by, name, status, age) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Nene Prueba', 'member', 3) returning id into kid;
  code := public.check_in_child(kid, 'Guardería', 'Su mamá');
  if code !~ '^\d{4}$' then raise exception 'FALLO: código %', code; end if;
  if public.check_in_child(kid, 'Guardería') <> code then raise exception 'FALLO: dos códigos para el mismo chico'; end if;
  if not exists (select 1 from public.attendances where contact_id = kid and attended_on = public.church_today()) then raise exception 'FALLO: no se tomó la asistencia del chico'; end if;
  if (select count(*) from public.check_out_child('0000x')) <> 0 then raise exception 'FALLO: retiró con un código falso'; end if;
  if (select count(*) from public.check_out_child(code)) <> 1 then raise exception 'FALLO: no lo pudo retirar'; end if;
  -- comentarios en vivo
  insert into public.live_comments (video_id, body) values ('abcdefghijk', '¡Amén!');
  if (select count(*) from public.live_comments_list('abcdefghijk')) <> 1 then raise exception 'FALLO: comentario en vivo'; end if;
end $$;
-- un miembro no retira chicos ni ve los códigos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  begin perform public.check_out_child('1234'); raise exception 'FALLO: un miembro retiró a un chico';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if exists (select 1 from public.checkins_today()) then raise exception 'FALLO: un miembro ve los códigos'; end if;
  begin perform public.set_live('https://youtu.be/abcdefghijk'); raise exception 'FALLO: un miembro puso en vivo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
