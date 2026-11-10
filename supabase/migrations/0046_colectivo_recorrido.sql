-- 0046: el colectivo en vivo deja una línea con todo el recorrido que ya hizo.
create table if not exists public.bus_run_points (
  id     bigint generated always as identity primary key,
  run_id uuid not null references public.bus_runs(id) on delete cascade,
  lat    double precision not null,
  lng    double precision not null,
  at     timestamptz not null default now()
);
create index if not exists bus_run_points_run_idx on public.bus_run_points (run_id, id);
alter table public.bus_run_points enable row level security;
revoke all on public.bus_run_points from anon, authenticated;

-- Se anota un punto cuando el colectivo se movió más de 20 metros (o pasó un minuto), así la línea no se llena de puntos.
create or replace function public.bus_add_point(p_run uuid, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  select lat, lng, at into l from public.bus_run_points where run_id = p_run order by id desc limit 1;
  if l.lat is null or public.haversine_m(l.lat, l.lng, p_lat, p_lng) > 20 or l.at < now() - interval '1 minute' then
    insert into public.bus_run_points (run_id, lat, lng) values (p_run, p_lat, p_lng);
  end if;
end $$;
revoke all on function public.bus_add_point(uuid, double precision, double precision) from public, anon, authenticated;

create or replace function public.update_bus_run(p_run uuid, p_lat double precision, p_lng double precision, p_heading double precision default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return false; end if;
  update public.bus_runs set lat = p_lat, lng = p_lng, heading = p_heading, updated_at = now()
  where id = p_run and driver_id = auth.uid() and ended_at is null and started_at > now() - interval '8 hours';
  if not found then return false; end if;
  perform public.bus_add_point(p_run, p_lat, p_lng);
  return true;
end $$;
grant execute on function public.update_bus_run(uuid, double precision, double precision, double precision) to authenticated;

-- El primer punto es donde salió.
create or replace function public.start_bus_run(p_group uuid, p_lat double precision default null, p_lng double precision default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_church uuid; v_route text; u uuid;
begin
  if not public.can_drive_bus(p_group) then raise exception 'Solo el jefe de la ruta o quien eligió el pastor'; end if;
  select church_id, name into v_church, v_route from public.groups where id = p_group;
  update public.bus_runs set ended_at = now() where group_id = p_group and ended_at is null;
  insert into public.bus_runs (church_id, group_id, driver_id, lat, lng) values (v_church, p_group, auth.uid(), p_lat, p_lng) returning id into v_id;
  if p_lat is not null and p_lng is not null then perform public.bus_add_point(v_id, p_lat, p_lng); end if;
  for u in select public.bus_riders(p_group) loop
    if u <> auth.uid() then
      perform public.notify(u, 'bus', 'El colectivo salió', 'El colectivo de ' || v_route || ' salió de la iglesia. Tocá para verlo en el mapa.', '/colectivo-vivo');
    end if;
  end loop;
  return v_id;
end $$;
grant execute on function public.start_bus_run(uuid, double precision, double precision) to authenticated;

-- La línea de un viaje: la ven los de la ruta, igual que el colectivo.
create or replace function public.bus_run_trail(p_run uuid)
returns table (lat double precision, lng double precision, at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.lat, p.lng, p.at from public.bus_run_points p
  where p.run_id = p_run
    and exists (select 1 from public.bus_runs r where r.id = p_run and r.church_id = public.current_church_id() and public.can_see_bus(r.group_id))
  order by p.id
  limit 3000
$$;
grant execute on function public.bus_run_trail(uuid) to authenticated;
