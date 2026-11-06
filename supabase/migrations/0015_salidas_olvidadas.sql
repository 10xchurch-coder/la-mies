-- ============================================================================
-- La Mies · Salidas que quedaron abiertas.
--
-- Si alguien cierra la app sin tocar "Terminar", el teléfono sigue mandando la ubicación y aparece "en vivo"
-- en el mapa (por ejemplo, quieto en la iglesia). Cada 5 minutos la base cierra sola las salidas:
--   - sin ningún punto nuevo hace más de 60 minutos  → se cierra en el último punto;
--   - quieta en el mismo lugar (menos de 75 m) desde hace más de 60 minutos → se cierra cuando llegó a ese lugar.
-- Al cerrarse, el teléfono deja de marcar solo (la próxima vez que intenta subir puntos) y la persona recibe un aviso.
-- Se puede correr más de una vez.
-- ============================================================================

create or replace function public.close_idle_sessions(p_minutes integer default 60)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_last record;
  v_since timestamptz;
  v_cutoff timestamptz;
  v_n integer := 0;
  v_tz text;
begin
  for s in select * from public.sessions where ended_at is null loop
    v_cutoff := null;
    select recorded_at, lat, lng into v_last from public.track_points where session_id = s.id order by recorded_at desc limit 1;
    if v_last.recorded_at is null then
      if s.started_at < now() - make_interval(mins => p_minutes) then v_cutoff := s.started_at; end if;
    elsif v_last.recorded_at < now() - make_interval(mins => p_minutes) then
      v_cutoff := v_last.recorded_at;
    else
      -- ¿Desde cuándo está en el mismo lugar? (el primer punto de la racha final a menos de 75 m del último)
      select min(t.recorded_at) into v_since
      from public.track_points t
      where t.session_id = s.id
        and t.recorded_at > coalesce((
          select max(f.recorded_at) from public.track_points f
          where f.session_id = s.id and public.haversine_m(f.lat, f.lng, v_last.lat, v_last.lng) > 75), s.started_at - interval '1 second');
      if v_since is not null and v_since < now() - make_interval(mins => p_minutes) then v_cutoff := v_since; end if;
    end if;
    continue when v_cutoff is null;

    delete from public.track_points where session_id = s.id and recorded_at > v_cutoff;
    delete from public.coverage_events where session_id = s.id and covered_at > v_cutoff;
    update public.sessions x set
      ended_at = greatest(v_cutoff, x.started_at),
      trimmed_at = now(),
      auto_stopped = true,
      distance_m = coalesce((
        select sum(public.haversine_m(prev_lat, prev_lng, lat, lng))
        from (select lat, lng, lag(lat) over (order by recorded_at) prev_lat, lag(lng) over (order by recorded_at) prev_lng
              from public.track_points t where t.session_id = s.id) q
        where prev_lat is not null), 0),
      blocks = (select count(distinct (road_id, seg)) from public.coverage_events e where e.session_id = s.id),
      contacts = (select count(*) from public.contacts c where c.session_id = s.id),
      presentations = (select count(*) from public.contact_visits v where v.session_id = s.id and v.gospel_presented),
      promises = (select count(*) from public.contact_visits v where v.session_id = s.id and v.promise_day is not null)
    where x.id = s.id;
    delete from public.live_positions where session_id = s.id;

    select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = s.church_id;
    insert into public.notifications (church_id, user_id, kind, title, body, link)
    values (s.church_id, s.user_id, 'outing', 'Tu salida se cerró sola',
            'Quedó abierta y no hubo movimiento por más de una hora, así que la cerramos a las '
              || to_char(greatest(v_cutoff, s.started_at) at time zone v_tz, 'HH24:MI')
              || '. Lo que recorriste quedó guardado. La próxima vez tocá "Terminar" al volver.',
            '/salidas');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.close_idle_sessions(integer) from public, anon, authenticated;
grant execute on function public.close_idle_sessions(integer) to service_role;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'lamies-salidas-olvidadas';
    perform cron.schedule('lamies-salidas-olvidadas', '*/5 * * * *', 'select public.close_idle_sessions()');
  end if;
end $$;
