-- 0035: el mapa en equipo.
--  1. Si dos o más hermanos recorren juntos la misma vereda, se ve una sola línea con los nombres
--     de todos ("Isaac + Benjamín"). A cada uno le cuenta para lo suyo; para la iglesia es una sola vez.
--  2. Marcar calles a mano a nombre de alguien (se olvidó el teléfono, se cortó el GPS): queda una
--     salida "cargada a mano" con su fecha, sus cuadras y sus metros. Cada uno puede cargar lo suyo
--     de los últimos 7 días; el pastor, la secretaría o el coordinador de evangelismo, lo de cualquiera.
--  3. Punto de encuentro: cualquiera en una salida marca un lugar y una hora; les llega a todos los que
--     están afuera.

-- 1. Los que pasaron juntos (en la misma hora) por la última vez de cada vereda.
drop function if exists public.coverage_in_bbox(double precision, double precision, double precision, double precision);
create function public.coverage_in_bbox(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision)
returns table (road_id bigint, seg integer, side smallint, kind text, last_covered_at timestamptz, last_user_name text, times integer,
               last_session_id uuid, last_user_id uuid, team_names text)
language sql stable security definer set search_path = public as $$
  select c.road_id, c.seg, c.side, c.kind, c.last_covered_at, p.display_name, c.times, c.last_session_id, c.last_user_id,
         (select string_agg(distinct pp.display_name, ' + ')
            from public.coverage_events e join public.profiles pp on pp.id = e.user_id
           where e.church_id = c.church_id and e.road_id = c.road_id and e.seg = c.seg and e.side = c.side and e.kind = c.kind
             and e.covered_at between c.last_covered_at - interval '45 minutes' and c.last_covered_at + interval '45 minutes')
  from public.coverage c
  join public.roads r on r.id = c.road_id
  left join public.profiles p on p.id = c.last_user_id
  where c.church_id = public.current_church_id()
    and (p_max_lat - p_min_lat) <= 0.2 and (p_max_lng - p_min_lng) <= 0.2
    and r.max_lat >= p_min_lat and r.min_lat <= p_max_lat
    and r.max_lng >= p_min_lng and r.min_lng <= p_max_lng
  limit 20000
$$;
grant execute on function public.coverage_in_bbox(double precision, double precision, double precision, double precision) to authenticated;

-- "Veces": las visitas en días distintos (un equipo que pasa junto cuenta una vez).
create or replace function public.refresh_coverage_keys(p_church uuid, p_keys jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  for k in select distinct (x->>'road_id')::bigint road_id, (x->>'seg')::int seg, (x->>'side')::smallint side, x->>'kind' kind
           from jsonb_array_elements(p_keys) x loop
    if exists (select 1 from public.coverage_events e where e.church_id = p_church and e.road_id = k.road_id and e.seg = k.seg and e.side = k.side and e.kind = k.kind) then
      insert into public.coverage (church_id, road_id, seg, side, kind, last_covered_at, last_user_id, last_session_id, times)
      select p_church, k.road_id, k.seg, k.side, k.kind, x.covered_at, x.user_id, x.session_id, x.times
      from (
        select e.covered_at, e.user_id, e.session_id,
               (select count(distinct (e2.covered_at at time zone 'America/Argentina/Buenos_Aires')::date) from public.coverage_events e2
                 where e2.church_id = p_church and e2.road_id = k.road_id and e2.seg = k.seg and e2.side = k.side and e2.kind = k.kind)::integer as times
        from public.coverage_events e
        where e.church_id = p_church and e.road_id = k.road_id and e.seg = k.seg and e.side = k.side and e.kind = k.kind
        order by e.covered_at desc limit 1
      ) x
      on conflict (church_id, road_id, seg, side, kind) do update set
        last_covered_at = excluded.last_covered_at, last_user_id = excluded.last_user_id, last_session_id = excluded.last_session_id, times = excluded.times;
    else
      delete from public.coverage c where c.church_id = p_church and c.road_id = k.road_id and c.seg = k.seg and c.side = k.side and c.kind = k.kind;
    end if;
  end loop;
end $$;

-- 2. Salidas cargadas a mano.
alter table public.sessions add column if not exists manual boolean not null default false;

create or replace function public.seg_length_m(p_road bigint, p_seg integer) returns double precision
language sql stable security definer set search_path = public as $$
  select public.haversine_m((r.coords->p_seg->>0)::float8, (r.coords->p_seg->>1)::float8, (r.coords->(p_seg + 1)->>0)::float8, (r.coords->(p_seg + 1)->>1)::float8)
  from public.roads r where r.id = p_road and jsonb_array_length(r.coords) > p_seg + 1
$$;

create or replace function public.recount_session(p_session uuid) returns void
language sql security definer set search_path = public as $$
  update public.sessions s set
    distance_m = case when s.manual then coalesce((
        select sum(public.seg_length_m(k.road_id, k.seg)) from (select distinct road_id, seg from public.coverage_events e where e.session_id = p_session) k), 0)
      else coalesce((
      select sum(public.haversine_m(prev_lat, prev_lng, lat, lng))
      from (select lat, lng, lag(lat) over (order by recorded_at) prev_lat, lag(lng) over (order by recorded_at) prev_lng
            from public.track_points t where t.session_id = p_session) q
      where prev_lat is not null), 0) end,
    blocks = (select count(distinct (road_id, seg)) from public.coverage_events e where e.session_id = p_session),
    contacts = (select count(*) from public.contacts c where c.session_id = p_session),
    presentations = (select count(*) from public.contact_visits v where v.session_id = p_session and v.gospel_presented),
    promises = (select count(*) from public.contact_visits v where v.session_id = p_session and v.promise_day is not null)
  where s.id = p_session
$$;

-- p_sides: [{road_id, seg, side}]. Devuelve la salida donde quedaron.
create or replace function public.mark_sides_for(p_user uuid, p_date date, p_kind text, p_sides jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_session uuid; v_at timestamptz; x jsonb; n int := 0;
begin
  if v_church is null then raise exception 'Sin iglesia'; end if;
  if p_kind not in ('soulwinning', 'flyers') then raise exception 'Tipo inválido'; end if;
  if not exists (select 1 from public.profiles where id = p_user and church_id = v_church) then raise exception 'Esa persona no es de tu iglesia'; end if;
  if p_user <> auth.uid() and not public.has_perm('evang.marcar_otros') then
    raise exception 'Solo el pastor, la secretaría o el coordinador de evangelismo marcan calles a nombre de otro';
  end if;
  if p_date > public.church_today() then raise exception 'La fecha no puede ser futura'; end if;
  if p_user = auth.uid() and not public.has_perm('evang.marcar_otros') and p_date < public.church_today() - 7 then
    raise exception 'Podés cargar tus salidas de los últimos 7 días';
  end if;
  v_at := (p_date + time '16:00') at time zone 'America/Argentina/Buenos_Aires';
  select id into v_session from public.sessions
   where church_id = v_church and user_id = p_user and manual and kind = p_kind and started_at = v_at;
  if v_session is null then
    insert into public.sessions (church_id, user_id, started_at, ended_at, kind, manual, note, distance_m, blocks)
    values (v_church, p_user, v_at, v_at, p_kind, true,
            'Cargada a mano' || case when p_user <> auth.uid() then ' por ' || coalesce((select display_name from public.profiles where id = auth.uid()), 'otro') else '' end,
            0, 0)
    returning id into v_session;
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_sides, '[]'::jsonb)) loop
    if (x->>'side')::smallint not in (-1, 1) then continue; end if;
    if exists (select 1 from public.coverage_events e where e.session_id = v_session and e.road_id = (x->>'road_id')::bigint
               and e.seg = (x->>'seg')::int and e.side = (x->>'side')::smallint) then continue; end if;
    insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at, kind, manual)
    values (v_church, (x->>'road_id')::bigint, (x->>'seg')::int, (x->>'side')::smallint, p_user, v_session, v_at, p_kind, true);
    n := n + 1;
  end loop;
  perform public.recount_session(v_session);
  perform public.refresh_coverage_keys(v_church, (select jsonb_agg(el || jsonb_build_object('kind', p_kind)) from jsonb_array_elements(coalesce(p_sides, '[]'::jsonb)) el));
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (v_church, auth.uid(), 'mark_sides_for', p_user::text, jsonb_build_object('date', p_date, 'kind', p_kind, 'sides', n));
  return v_session;
end $$;
revoke all on function public.mark_sides_for(uuid, date, text, jsonb) from public, anon;
grant execute on function public.mark_sides_for(uuid, date, text, jsonb) to authenticated;

-- 3. Punto de encuentro.
create table if not exists public.meeting_points (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade default public.current_church_id(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  lat        double precision not null,
  lng        double precision not null,
  meet_at    timestamptz not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists meeting_points_church_idx on public.meeting_points (church_id, meet_at desc);
alter table public.meeting_points enable row level security;
grant select, insert, delete on public.meeting_points to authenticated;
drop policy if exists meeting_points_select on public.meeting_points;
create policy meeting_points_select on public.meeting_points for select to authenticated using (church_id = public.current_church_id());
drop policy if exists meeting_points_insert on public.meeting_points;
create policy meeting_points_insert on public.meeting_points for insert to authenticated
  with check (church_id = public.current_church_id() and created_by = auth.uid());
drop policy if exists meeting_points_delete on public.meeting_points;
create policy meeting_points_delete on public.meeting_points for delete to authenticated
  using (church_id = public.current_church_id() and (created_by = auth.uid() or public.has_perm('evang.ver_salidas')));

create or replace function public.meeting_point_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; v_by text;
begin
  select display_name into v_by from public.profiles where id = new.created_by;
  for u in select distinct s.user_id from public.sessions s
           where s.church_id = new.church_id and s.ended_at is null and s.started_at > now() - interval '12 hours' and s.user_id <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000')
  loop
    perform public.notify(u, 'meetup',
      'Punto de encuentro a las ' || to_char(new.meet_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
      coalesce(v_by, 'Alguien') || ' marcó dónde se juntan.' || coalesce(' ' || new.note, '') || ' Tocá para verlo en el mapa.', '/mapa');
  end loop;
  return new;
end $$;
drop trigger if exists meeting_point_notify on public.meeting_points;
create trigger meeting_point_notify after insert on public.meeting_points for each row execute function public.meeting_point_notify();
revoke all on function public.meeting_point_notify() from public, anon, authenticated;
