\set ON_ERROR_STOP on
-- 0052: solo cuentan las salidas de verdad.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare u uuid := '00000000-0000-0000-0000-0000000000c1'; ch uuid;
begin
  select church_id into ch from public.profiles where id = u;
  delete from public.sessions where user_id = u;
  -- 3 salidas de prueba (segundos, sin recorrido) y 1 de verdad (45 min)
  insert into public.sessions (church_id, user_id, started_at, ended_at, distance_m) values
    (ch, u, now() - interval '3 days', now() - interval '3 days' + interval '20 seconds', 0),
    (ch, u, now() - interval '2 days', now() - interval '2 days' + interval '1 minute', 11),
    (ch, u, now() - interval '1 day', now() - interval '1 day' + interval '30 seconds', 0),
    (ch, u, now() - interval '1 day', now() - interval '1 day' + interval '45 minutes', 675),
    -- corta pero con recorrido largo (cuenta) y corta pero con un contacto (cuenta)
    (ch, u, now() - interval '5 hours', now() - interval '5 hours' + interval '6 minutes', 420);
  insert into public.sessions (church_id, user_id, started_at, ended_at, distance_m, contacts) values
    (ch, u, now() - interval '4 hours', now() - interval '4 hours' + interval '3 minutes', 20, 1);
  -- una en curso no cuenta para "mis números" todavía
  insert into public.sessions (church_id, user_id, started_at) values (ch, u, now() - interval '2 minutes');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$
declare p jsonb := public.my_progress(); n int;
begin
  if (p->>'sessions')::int <> 3 then raise exception 'FALLO: my_progress cuenta % salidas (debían ser 3)', p->>'sessions'; end if;
  select count(*) into n from public.list_outings(30, null) where not counts and ended_at is not null;
  if n <> 3 then raise exception 'FALLO: list_outings marca % que no cuentan (debían ser 3)', n; end if;
end $$;
reset role;
