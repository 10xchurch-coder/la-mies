-- 0018: el informe semanal suma cada clase y cada reunión, y el progreso de la iglesia mes a mes.

-- Informe semanal: igual que antes + 'services' (asistencia por reunión) y 'classes' (por clase).
create or replace function public.weekly_report(p_church uuid default null, p_monday date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := coalesce(p_church, public.current_church_id()); v_mon date; v_from timestamptz; v_to timestamptz; v_tz text; ss uuid[];
begin
  if p_church is null and not public.is_staff() then raise exception 'Solo la secretaría o el pastor'; end if;
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = v_church;
  v_mon := coalesce(p_monday, date_trunc('week', (now() at time zone v_tz))::date);
  v_from := (v_mon - 7)::timestamp at time zone v_tz;
  v_to := v_mon::timestamp at time zone v_tz;
  select coalesce(array_agg(id), '{}') into ss from public.sessions where church_id = v_church and started_at >= v_from and started_at < v_to;
  return jsonb_build_object(
    'from', v_mon - 7, 'to', v_mon - 1,
    'outings', coalesce(array_length(ss, 1), 0),
    'people_out', (select count(distinct user_id) from public.sessions where id = any(ss)),
    'minutes', (select coalesce(sum(extract(epoch from (coalesce(ended_at, started_at) - started_at)) / 60), 0)::int from public.sessions where id = any(ss)),
    'km', (select round((coalesce(sum(distance_m), 0) / 1000)::numeric, 1) from public.sessions where id = any(ss)),
    'houses', public.houses_for_sessions(ss),
    'contacts', (select count(*) from public.contacts where church_id = v_church and created_at >= v_from and created_at < v_to),
    'gospel', (select count(*) from public.contact_visits where church_id = v_church and gospel_presented and visited_at >= v_from and visited_at < v_to),
    'promises', (select count(*) from public.contact_visits where church_id = v_church and promise_day is not null and visited_at >= v_from and visited_at < v_to),
    'visits', (select count(*) from public.contact_visits where church_id = v_church and session_id is null and visited_at >= v_from and visited_at < v_to),
    'attendance', (select count(distinct (contact_id, attended_on)) from public.attendances where church_id = v_church and attended_on >= v_mon - 7 and attended_on < v_mon),
    'first_time', (select count(*) from (select contact_id, min(attended_on) f from public.attendances where church_id = v_church group by contact_id) x where x.f >= v_mon - 7 and x.f < v_mon),
    'saved', (select count(*) from public.contacts where church_id = v_church and saved_on >= v_mon - 7 and saved_on < v_mon),
    'baptisms', (select count(*) from public.contacts where church_id = v_church and baptized_on >= v_mon - 7 and baptized_on < v_mon),
    'new_members', (select count(*) from public.contacts where church_id = v_church and member_since >= v_mon - 7 and member_since < v_mon),
    'absent', (select count(*) from public.contacts c where c.church_id = v_church and not c.archived and c.status = 'member'
               and not exists (select 1 from public.attendances a where a.contact_id = c.id and a.attended_on >= v_mon - 2 and a.attended_on < v_mon)),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'dow', s.dow, 'count', x.n, 'visitors', x.v) order by s.dow, s.sort_order, s.time)
      from public.church_services s
      cross join lateral (
        select count(*)::int n, count(*) filter (where c.status <> 'member')::int v
        from public.attendances a join public.contacts c on c.id = a.contact_id
        where a.service_id = s.id and a.attended_on >= v_mon - 7 and a.attended_on < v_mon
      ) x
      where s.church_id = v_church and (s.active or x.n > 0)), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('name', k.name, 'present', x.p, 'absent', x.a, 'enrolled', x.e, 'days', x.d) order by k.sort_order, k.name)
      from public.classes k
      cross join lateral (
        select count(*) filter (where ca.present)::int p, count(*) filter (where not ca.present)::int a, count(distinct ca.on_date)::int d,
               (select count(*)::int from public.class_students cs where cs.class_id = k.id) e
        from public.class_attendance ca
        where ca.class_id = k.id and ca.on_date >= v_mon - 7 and ca.on_date < v_mon
      ) x
      where k.church_id = v_church and (k.active or x.p > 0)), '[]'::jsonb)
  );
end $$;
grant execute on function public.weekly_report(uuid, date) to authenticated;

-- El aviso de los lunes también menciona las clases.
create or replace function public.run_weekly_report(p_church uuid, p_local timestamp) returns integer
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_to uuid; n integer := 0; v_cls text;
begin
  if extract(dow from p_local)::int <> 1 or extract(hour from p_local)::int <> 8 or not public.job_once(p_church, 'weekly_report', p_local::date::text) then return 0; end if;
  r := public.weekly_report(p_church, p_local::date);
  select string_agg((x->>'name') || ' ' || (x->>'present'), ', ') into v_cls from jsonb_array_elements(r->'classes') x where (x->>'days')::int > 0;
  for v_to in select unnest(coalesce((select report_recipients from public.churches where id = p_church), array(select public.staff_ids(p_church)))) loop
    perform public.notify(v_to, 'report', 'Informe de la semana',
      (r->>'outings') || ' salidas · ' || (r->>'houses') || ' casas · ' || (r->>'contacts') || ' contactos · ' || (r->>'gospel') || ' con el evangelio · '
        || (r->>'attendance') || ' asistencias · ' || (r->>'first_time') || ' vinieron por primera vez'
        || coalesce(' · Clases: ' || v_cls, ''),
      '/reporte');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_weekly_report(uuid, timestamp) from public, anon, authenticated;

-- Progreso de la iglesia: una fila por mes, desde el primer dato (o los últimos p_months meses).
create or replace function public.church_progress(p_months integer default null) returns table (
  month date,
  avg_attendance numeric,    -- promedio de personas por reunión principal
  people int,                -- personas distintas que vinieron en el mes
  first_time int,
  members int,               -- miembros al final del mes
  new_members int,
  saved int,
  baptisms int,
  class_present int,         -- asistencias a clases
  contacts int,
  gospel int,
  promises int,
  outings int,
  people_out int,
  hours numeric,
  km numeric,
  houses int
)
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_tz text; v_start date; v_end date;
begin
  if not public.is_captain_or_admin() then raise exception 'Solo líderes, secretaría y pastor'; end if;
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = v_church;
  v_end := date_trunc('month', now() at time zone v_tz)::date;
  select least(
    coalesce((select min(attended_on) from public.attendances where church_id = v_church), v_end),
    coalesce((select min(started_at at time zone v_tz)::date from public.sessions where church_id = v_church), v_end),
    coalesce((select min(created_at at time zone v_tz)::date from public.contacts where church_id = v_church), v_end),
    coalesce((select min(member_since) from public.contacts where church_id = v_church), v_end))
  into v_start;
  v_start := date_trunc('month', v_start)::date;
  if p_months is not null then v_start := greatest(v_start, (v_end - make_interval(months => p_months - 1))::date); end if;

  return query
  with m as (select g::date m0, (g + interval '1 month')::date m1 from generate_series(v_start, v_end, interval '1 month') g),
  firsts as (select contact_id, min(attended_on) f from public.attendances where church_id = v_church group by contact_id)
  select m.m0,
    coalesce((select round(avg(n), 1) from (
      select count(*) n from public.attendances a join public.church_services s on s.id = a.service_id and s.main
      where a.church_id = v_church and a.attended_on >= m.m0 and a.attended_on < m.m1 group by a.attended_on, a.service_id) q), 0),
    (select count(distinct contact_id)::int from public.attendances where church_id = v_church and attended_on >= m.m0 and attended_on < m.m1),
    (select count(*)::int from firsts where f >= m.m0 and f < m.m1),
    (select count(*)::int from public.contacts c where c.church_id = v_church and c.status = 'member' and not c.archived
       and coalesce(c.member_since, (c.created_at at time zone v_tz)::date) < m.m1),
    (select count(*)::int from public.contacts where church_id = v_church and member_since >= m.m0 and member_since < m.m1),
    (select count(*)::int from public.contacts where church_id = v_church and saved_on >= m.m0 and saved_on < m.m1),
    (select count(*)::int from public.contacts where church_id = v_church and baptized_on >= m.m0 and baptized_on < m.m1),
    (select count(*)::int from public.class_attendance where church_id = v_church and present and on_date >= m.m0 and on_date < m.m1),
    (select count(*)::int from public.contacts where church_id = v_church and (created_at at time zone v_tz)::date >= m.m0 and (created_at at time zone v_tz)::date < m.m1),
    (select count(*)::int from public.contact_visits where church_id = v_church and gospel_presented and (visited_at at time zone v_tz)::date >= m.m0 and (visited_at at time zone v_tz)::date < m.m1),
    (select count(*)::int from public.contact_visits where church_id = v_church and promise_day is not null and (visited_at at time zone v_tz)::date >= m.m0 and (visited_at at time zone v_tz)::date < m.m1),
    x.n, x.p, x.h, x.k,
    public.houses_for_sessions(x.ids)
  from m
  cross join lateral (
    select count(*)::int n, count(distinct user_id)::int p,
           round((coalesce(sum(extract(epoch from (coalesce(ended_at, started_at) - started_at))), 0) / 3600)::numeric, 1) h,
           round((coalesce(sum(distance_m), 0) / 1000)::numeric, 1) k,
           coalesce(array_agg(id), '{}') ids
    from public.sessions where church_id = v_church and (started_at at time zone v_tz)::date >= m.m0 and (started_at at time zone v_tz)::date < m.m1
  ) x
  order by m.m0;
end $$;
grant execute on function public.church_progress(integer) to authenticated;
