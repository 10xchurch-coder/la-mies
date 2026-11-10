\set ON_ERROR_STOP on
-- 0044: chat de la iglesia, chat de la salida, colectivo en vivo, cumpleaños del día.
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.groups set captain_id = '00000000-0000-0000-0000-000000000004' where id = '20000000-0000-0000-0000-000000000001';
update public.profiles set group_id = '20000000-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set group_id = '20000000-0000-0000-0000-000000000002' where id = '00000000-0000-0000-0000-000000000003';
update public.profiles set disabled_at = null where id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');
delete from public.user_blocks;
delete from public.sessions where ended_at is null;

-- 1. Chat de la iglesia: Lucía escribe, Nico lo ve; Nico la bloquea y deja de verlo.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into public.church_chat_messages (body) values ('Hola iglesia');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if (select count(*) from public.church_chat_list()) <> 1 then raise exception 'FALLO: Nico no ve el chat'; end if;
  begin
    insert into public.church_chat_messages (user_id, body) values ('00000000-0000-0000-0000-000000000002', 'falso');
    raise exception 'FALLO: escribió a nombre de otro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (select count(*) from public.church_chat_messages) <> 1 then raise exception 'FALLO: select del chat'; end if;
  delete from public.church_chat_messages; -- no es suyo: no borra nada
end $$;
insert into public.user_blocks (blocked_id) values ('00000000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.church_chat_list()) <> 0 then raise exception 'FALLO: ve a alguien bloqueado'; end if;
end $$;
delete from public.user_blocks;
insert into public.content_reports (church_id, kind, target_id, excerpt, reason)
  select church_id, 'church_chat', id, body, 'Otro motivo' from public.church_chat_messages limit 1;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.resolve_report((select id from public.content_reports where kind = 'church_chat' and status = 'open' limit 1), true);
do $$ begin
  if (select count(*) from public.church_chat_messages) <> 0 then raise exception 'FALLO: la denuncia no borró el mensaje'; end if;
end $$;

-- 1b. Chat de la salida: solo los que están en salida.
reset role;
insert into public.sessions (church_id, user_id, started_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', now() - interval '10 minutes'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', now() - interval '5 minutes');
delete from public.notifications where kind = 'outing_chat';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into public.outing_chat_messages (body) values ('Estoy en la esquina de la plaza');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if (select count(*) from public.outing_chat_list()) <> 0 then raise exception 'FALLO: Nico ve el chat sin estar en salida'; end if;
  begin
    insert into public.outing_chat_messages (body) values ('hola');
    raise exception 'FALLO: escribió sin estar en salida';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
do $$ begin
  if (select count(*) from public.outing_chat_list()) <> 1 then raise exception 'FALLO: Caro no ve el chat de la salida'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.notifications where kind = 'outing_chat' and user_id = '00000000-0000-0000-0000-000000000004') <> 1 then raise exception 'FALLO: no le llegó el aviso a Caro'; end if;
  if exists (select 1 from public.notifications where kind = 'outing_chat' and user_id = '00000000-0000-0000-0000-000000000002') then raise exception 'FALLO: aviso a quien escribió'; end if;
end $$;
delete from public.sessions where ended_at is null;

-- 2. Colectivo: la jefa de la ruta 1 sale; Lucía (ruta 1) la ve; Nico (ruta 2) no.
delete from public.notifications where kind = 'bus';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  begin
    perform public.start_bus_run('20000000-0000-0000-0000-000000000001', -27.36, -55.89);
    raise exception 'FALLO: Nico prendió el colectivo de otra ruta';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
select public.start_bus_run('20000000-0000-0000-0000-000000000001', -27.36, -55.89);
do $$ declare v uuid; begin
  select run_id into v from public.bus_live_routes() where group_id = '20000000-0000-0000-0000-000000000001';
  if v is null then raise exception 'FALLO: la jefa no ve su salida'; end if;
  if not public.update_bus_run(v, -27.37, -55.90, 90) then raise exception 'FALLO: no actualizó la ubicación'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ declare r record; begin
  select * into r from public.bus_live_routes() where group_id = '20000000-0000-0000-0000-000000000001';
  if r.run_id is null or r.lat <> -27.37 then raise exception 'FALLO: Lucía no ve el colectivo'; end if;
  if r.can_drive then raise exception 'FALLO: Lucía figura como chofer'; end if;
  if public.update_bus_run(r.run_id, 0, 0) then raise exception 'FALLO: Lucía movió el colectivo'; end if;
  begin
    perform * from public.bus_runs;
    raise exception 'FALLO: lee la tabla directo';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if exists (select 1 from public.bus_live_routes() where group_id = '20000000-0000-0000-0000-000000000001') then raise exception 'FALLO: Nico ve la ruta 1'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.notifications where kind = 'bus' and user_id = '00000000-0000-0000-0000-000000000002') then raise exception 'FALLO: no le avisó a Lucía'; end if;
  if exists (select 1 from public.notifications where kind = 'bus' and user_id = '00000000-0000-0000-0000-000000000003') then raise exception 'FALLO: le avisó a Nico'; end if;
end $$;
-- El pastor elige a Nico como chofer de la ruta 1.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.set_bus_drivers('20000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-000000000003']::uuid[]);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if not public.can_drive_bus('20000000-0000-0000-0000-000000000001') then raise exception 'FALLO: Nico no quedó de chofer'; end if;
  perform public.end_bus_run((select run_id from public.bus_live_routes() where group_id = '20000000-0000-0000-0000-000000000001'));
  if exists (select 1 from public.bus_live_routes() where run_id is not null) then raise exception 'FALLO: no terminó la salida'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  begin
    perform public.set_bus_drivers('20000000-0000-0000-0000-000000000001', '{}');
    raise exception 'FALLO: Lucía cambió los choferes';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
-- Salidas viejas se cierran solas.
update public.bus_runs set ended_at = null, updated_at = now() - interval '2 hours';
select public.run_bus_cleanup();
do $$ begin
  if exists (select 1 from public.bus_runs where ended_at is null) then raise exception 'FALLO: la salida vieja sigue abierta'; end if;
end $$;
delete from public.bus_route_drivers;

-- 3. Cumpleaños del día.
select set_config('request.jwt.claim.sub', '', false);
insert into public.contacts (id, church_id, created_by, name, status, profile_id, birthdate) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Cumpleañera', 'member', null,
   (public.church_today() - interval '30 years')::date);
update public.contacts set status = 'member' where id = '20000000-0000-0000-0000-0000000000e1';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ declare r record; begin
  select * into r from public.today_birthdays() where name = 'Cumpleañera';
  if r.contact_id is null then raise exception 'FALLO: no aparece la cumpleañera'; end if;
  if r.turns is not null then raise exception 'FALLO: un miembro ve la edad'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select turns from public.today_birthdays() where name = 'Cumpleañera') <> 30 then raise exception 'FALLO: el pastor no ve la edad'; end if;
  begin
    perform public.set_my_birthdate(current_date + 3);
    raise exception 'FALLO: aceptó una fecha futura';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
delete from public.notifications where kind = 'birthday';
select public.run_birthday_today('10000000-0000-0000-0000-000000000001', (public.church_today() + time '08:15')::timestamp);
do $$ begin
  if not exists (select 1 from public.notifications where kind = 'birthday' and user_id = '00000000-0000-0000-0000-00000000000a' and title = 'Hoy cumplen años') then raise exception 'FALLO: no le avisó al pastor'; end if;
  if not exists (select 1 from public.notifications where kind = 'birthday' and user_id = '00000000-0000-0000-0000-000000000002' and title like 'Hoy cumple años%') then raise exception 'FALLO: no le avisó a la iglesia'; end if;
  if public.run_birthday_today('10000000-0000-0000-0000-000000000001', (public.church_today() + time '08:40')::timestamp) <> 0 then raise exception 'FALLO: avisó dos veces'; end if;
end $$;
delete from public.contacts where id = '20000000-0000-0000-0000-0000000000e1';
delete from public.notifications where kind in ('birthday', 'bus', 'outing_chat');
