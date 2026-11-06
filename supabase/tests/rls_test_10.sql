\set ON_ERROR_STOP on
-- Salidas olvidadas: se cierran solas.
reset role;
-- A: caminó y después quedó quieta 2 horas en el mismo lugar (cerró la app sin terminar).
insert into public.sessions (id, church_id, user_id, started_at) values
  ('a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', now() - interval '3 hours'),
  ('b0000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', now() - interval '20 minutes');
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng)
select 'a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
       now() - interval '3 hours' + make_interval(mins => i), -27.40 - i * 0.0005, -55.90
from generate_series(0, 50) i;
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng)
select 'a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
       now() - interval '2 hours' + make_interval(mins => i), -27.4250 + (i % 3) * 0.0001, -55.90
from generate_series(0, 119) i;
-- B: salida de hace 20 minutos, caminando: no se toca.
insert into public.track_points (session_id, church_id, user_id, recorded_at, lat, lng)
select 'b0000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2',
       now() - interval '20 minutes' + make_interval(mins => i), -27.40 - i * 0.0005, -55.91
from generate_series(0, 19) i;

select public.close_idle_sessions();
do $$ declare a record; b record; begin
  select * into a from public.sessions where id = 'a0000000-0000-0000-0000-00000000000a';
  select * into b from public.sessions where id = 'b0000000-0000-0000-0000-00000000000b';
  if a.ended_at is null or not a.auto_stopped then raise exception 'FALLO: la salida olvidada no se cerró'; end if;
  if a.ended_at > now() - interval '110 minutes' then raise exception 'FALLO: se cerró tarde (%), debía cortarse al llegar al lugar', a.ended_at; end if;
  if b.ended_at is not null then raise exception 'FALLO: cerró una salida activa'; end if;
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'outing') then
    raise exception 'FALLO: no avisó'; end if;
end $$;
