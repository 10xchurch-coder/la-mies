\set ON_ERROR_STOP on
-- v0.7: arreglar salidas de otros, oración con destinatarios, sugerencias, faltas por semanas, zonas.
reset role;
insert into public.sessions (id, church_id, user_id, started_at) values
  ('c0000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', now() - interval '50 minutes');
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng)
select 'c0000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2',
       now() - interval '50 minutes' + make_interval(mins => i), -27.40 - i * 0.0003, -55.90
from generate_series(0, 40) i;

set role authenticated;
-- un miembro no puede arreglar la salida de otro
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  begin perform public.finish_outing('c0000000-0000-0000-0000-00000000000c', null); raise exception 'FALLO: un miembro terminó la salida de otro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
-- la secretaría sí: quitar un tramo y terminarla
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select public.cut_outing_range('c0000000-0000-0000-0000-00000000000c', now() - interval '40 minutes', now() - interval '30 minutes');
select public.finish_outing('c0000000-0000-0000-0000-00000000000c', now() - interval '15 minutes');
reset role;
do $$ declare s record; begin
  select * into s from public.sessions where id = 'c0000000-0000-0000-0000-00000000000c';
  if s.ended_at is null then raise exception 'FALLO: no se terminó'; end if;
  if (select count(*) from public.track_points where session_id = s.id and recorded_at between now() - interval '40 minutes' and now() - interval '30 minutes') > 0 then
    raise exception 'FALLO: quedó el tramo quitado'; end if;
  if (select count(*) from public.track_points where session_id = s.id and recorded_at > now() - interval '15 minutes') > 0 then
    raise exception 'FALLO: quedaron puntos después del corte'; end if;
  if not exists (select 1 from public.notifications where user_id = s.user_id and title = 'Tu salida fue corregida') then
    raise exception 'FALLO: no avisó al dueño'; end if;
end $$;

-- oración: solo para el pastor
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
insert into public.prayer_requests (body, visibility) values ('Por mi trabajo', 'pastor');
insert into public.prayer_requests (body, visibility) values ('Por mi familia', 'church');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if exists (select 1 from public.prayer_list() where body = 'Por mi trabajo') then raise exception 'FALLO: otro miembro ve un pedido solo para el pastor'; end if;
  if not exists (select 1 from public.prayer_list() where body = 'Por mi familia') then raise exception 'FALLO: no ve el pedido público'; end if;
end $$;
insert into public.prayer_prayed (request_id) select id from public.prayer_requests where body = 'Por mi familia';

-- sugerencias: el miembro ve solo la suya
insert into public.suggestions (body) values ('Hacer un retiro de jóvenes');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  if exists (select 1 from public.suggestions_list() where body = 'Hacer un retiro de jóvenes') then raise exception 'FALLO: ve sugerencias de otros'; end if;
end $$;
select public.weekend_absences(current_date - ((extract(dow from current_date)::int + 1) % 7));
reset role;
