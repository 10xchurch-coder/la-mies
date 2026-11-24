-- 0086 · La iglesia de ejemplo se muda al centro de Posadas (calles reales, para que el mapa se vea sobre una ciudad de verdad).
--
-- Las calles son las de OpenStreetMap que ya están en la tabla roads (son de todas las iglesias: no se copia nada).
-- Las personas siguen siendo inventadas: se las ubica al azar (fijo) sobre esas calles, nunca a menos de 15 metros
-- del punto de una persona de una iglesia real.
-- Todo se agrega o se actualiza; no se borra nada.

-- Los tramos de calle de la zona de ejemplo: unas 12 x 11 cuadras entre Av. Corrientes y 25 de Mayo, y entre Tucumán y Av. Roque Pérez.
-- u = metros hacia el este a lo largo de las calles, v = metros hacia el norte (la cuadrícula del centro está girada unos 7 grados).
create table if not exists public.demo_segs (
  road_id bigint not null, seg integer not null, name text not null, ew boolean not null,
  lat1 double precision not null, lng1 double precision not null, lat2 double precision not null, lng2 double precision not null,
  u double precision not null, v double precision not null, len double precision not null, zone integer not null,
  primary key (road_id, seg)
);
alter table public.demo_segs enable row level security;
revoke all on public.demo_segs from anon, authenticated;

-- Las esquinas (donde se cruzan dos de esas calles), para las paradas del colectivo y el borde de las zonas.
create table if not exists public.demo_corners (
  lat double precision not null, lng double precision not null, a text not null, b text not null,
  u double precision not null, v double precision not null, primary key (lat, lng)
);
alter table public.demo_corners enable row level security;
revoke all on public.demo_corners from anon, authenticated;

create or replace function public.demo_u(p_lat double precision, p_lng double precision)
returns double precision language sql immutable as $$ select (p_lng + 55.9022) * 98860 * 0.9925 - (p_lat + 27.3720) * 110800 * 0.1219 $$;
create or replace function public.demo_v(p_lat double precision, p_lng double precision)
returns double precision language sql immutable as $$ select (p_lng + 55.9022) * 98860 * 0.1219 + (p_lat + 27.3720) * 110800 * 0.9925 $$;
revoke all on function public.demo_u(double precision, double precision) from public, anon, authenticated;
revoke all on function public.demo_v(double precision, double precision) from public, anon, authenticated;

-- Arma (o completa) la lista de tramos y esquinas a partir de las calles reales que haya cargadas. Devuelve cuántos tramos hay.
create or replace function public.demo_build_area()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is not null then raise exception 'Solo el dueño de la base'; end if;
  insert into public.demo_segs (road_id, seg, name, ew, lat1, lng1, lat2, lng2, u, v, len, zone)
  select x.id, x.seg, x.name, x.ew, x.lat1, x.lng1, x.lat2, x.lng2, x.u, x.v, x.len,
         least(3, floor(greatest(x.u - 26, 0) / 312))::int + 4 * least(3, floor(greatest(x.v - 26, 0) / 312))::int
  from (
    select r.id, r.name, nm.ew, (t.ord - 1)::int as seg,
           (t.pt ->> 0)::float8 as lat1, (t.pt ->> 1)::float8 as lng1, (nx.pt ->> 0)::float8 as lat2, (nx.pt ->> 1)::float8 as lng2,
           public.demo_u(((t.pt ->> 0)::float8 + (nx.pt ->> 0)::float8) / 2, ((t.pt ->> 1)::float8 + (nx.pt ->> 1)::float8) / 2) as u,
           public.demo_v(((t.pt ->> 0)::float8 + (nx.pt ->> 0)::float8) / 2, ((t.pt ->> 1)::float8 + (nx.pt ->> 1)::float8) / 2) as v,
           sqrt(power(((nx.pt ->> 1)::float8 - (t.pt ->> 1)::float8) * 98860, 2) + power(((nx.pt ->> 0)::float8 - (t.pt ->> 0)::float8) * 110800, 2)) as len
    from public.roads r
    join (values ('Avenida Roque Pérez', true), ('Alvear', true), ('Belgrano', true), ('Santa Fe', true), ('Sarmiento', true), ('San Martín', true), ('Bolívar', true),
                 ('Córdoba', true), ('La Rioja', true), ('Entre Ríos', true), ('Catamarca', true), ('Salta', true), ('Tucumán', true),
                 ('Avenida Corrientes', false), ('Jujuy', false), ('Junín', false), ('Ayacucho', false), ('San Lorenzo', false), ('Colón', false), ('Félix de Azara', false),
                 ('Buenos Aires', false), ('Rivadavia', false), ('3 de Febrero', false), ('25 de Mayo', false)) nm(name, ew) on nm.name = r.name
    cross join lateral jsonb_array_elements(r.coords) with ordinality t(pt, ord)
    join lateral (select r.coords -> (t.ord)::int as pt) nx on nx.pt is not null
    where r.max_lat >= -27.3745 and r.min_lat <= -27.3600 and r.max_lng >= -55.9030 and r.min_lng <= -55.8865
      and r.city is distinct from 'Iglesia de ejemplo' and r.highway <> 'service'
  ) x
  where x.u between -30 and 1225 and x.v between -30 and 1300 and x.len >= 4
  on conflict (road_id, seg) do nothing;

  insert into public.demo_corners (lat, lng, a, b, u, v)
  select p.lat, p.lng, min(p.name) filter (where p.ew), min(p.name) filter (where not p.ew), public.demo_u(p.lat, p.lng), public.demo_v(p.lat, p.lng)
  from (select lat1 as lat, lng1 as lng, name, ew from public.demo_segs union all select lat2, lng2, name, ew from public.demo_segs) p
  group by p.lat, p.lng
  having count(*) filter (where p.ew) > 0 and count(*) filter (where not p.ew) > 0
  on conflict (lat, lng) do nothing;

  select count(*) into n from public.demo_segs;
  return n;
end $$;
revoke all on function public.demo_build_area() from public, anon, authenticated;

-- Las zonas que el equipo "trabaja": cada sábado le toca una (van rotando). Las demás quedan sin recorrer.
-- Las de la segunda lista se recorren a medias (algo más de la mitad de las veredas).
create or replace function public.demo_zone_of_week(p_w integer)
returns integer language sql immutable as $$ select (array[0, 5, 2, 10, 7, 1, 13, 4, 15, 6, 8, 11, 14])[1 + (((p_w % 13) + 13) % 13)] $$;
create or replace function public.demo_zone_partial(p_zone integer)
returns boolean language sql immutable as $$ select p_zone in (1, 6, 11, 14) $$;
revoke all on function public.demo_zone_of_week(integer) from public, anon, authenticated;
revoke all on function public.demo_zone_partial(integer) from public, anon, authenticated;

-- Un lugar sobre una vereda de la zona de ejemplo. Con p_worked, solo en zonas que el equipo recorre.
-- Nunca cae a menos de 15 metros del punto de una persona de otra iglesia (prueba hasta 6 lugares distintos).
-- (Cambia lo que devuelve, así que la función vieja se reemplaza con otro nombre de argumentos: se crea aparte y la vieja queda apuntando acá.)
create or replace function public.demo_place(p_key text, p_worked boolean default false)
returns table (road_id bigint, road text, lat double precision, lng double precision, side smallint, num integer, u double precision, v double precision)
language plpgsql stable security definer set search_path = public as $$
declare k text; i integer; s public.demo_segs; t double precision; sd integer; dx double precision; dy double precision; la double precision; ln double precision;
begin
  for i in 0..5 loop
    k := p_key || case when i = 0 then '' else '~' || i::text end;
    select g.* into s from public.demo_segs g
      where g.len >= 25 and (not p_worked or g.zone in (0, 5, 2, 10, 7, 13, 4, 15, 8))
      order by public.demo_h(k || g.road_id::text || g.seg::text), g.road_id, g.seg limit 1;
    if s.road_id is null then return; end if;
    t := (15 + public.demo_h(k || 't') % 70) / 100.0;
    sd := case when public.demo_h(k || 's') < 500 then 1 else -1 end;
    dx := (s.lng2 - s.lng1) * 98860; dy := (s.lat2 - s.lat1) * 110800;
    la := s.lat1 + (s.lat2 - s.lat1) * t + sd * 13 * (-dx / s.len) / 110800;
    ln := s.lng1 + (s.lng2 - s.lng1) * t + sd * 13 * (dy / s.len) / 98860;
    if i < 5 and exists (select 1 from public.contacts c where not public.is_demo_church(c.church_id) and c.lat is not null
                         and abs(c.lat - la) * 110800 < 15 and abs(c.lng - ln) * 98860 < 15) then
      continue;
    end if;
    road_id := s.road_id; road := s.name; lat := round(la::numeric, 6); lng := round(ln::numeric, 6); side := sd::smallint;
    u := public.demo_u(la, ln); v := public.demo_v(la, ln);
    num := 1200 + (floor(greatest(case when s.ew then u else v end, 0) / 104))::int * 100 + (10 + public.demo_h(k || 'n') % 40) * 2 + case when sd > 0 then 0 else 1 end;
    return next;
    return;
  end loop;
end $$;
revoke all on function public.demo_place(text, boolean) from public, anon, authenticated;

create or replace function public.demo_spot(p_key text)
returns table (road_id bigint, road text, lat double precision, lng double precision, side smallint, num integer)
language sql stable security definer set search_path = public as $$
  select p.road_id, p.road, p.lat, p.lng, p.side, p.num from public.demo_place(p_key, false) p
$$;

-- Las veredas que se recorren en una salida: toda la zona que toca esa semana (o un poco más de la mitad, si es de las "a medias").
create or replace function public.demo_cover(p_church uuid, p_day date, p_w integer, p_session uuid, p_user uuid, p_kind text, p_only_events boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare z integer := public.demo_zone_of_week(p_w);
begin
  if auth.uid() is not null then raise exception 'Solo el dueño de la base'; end if;
  insert into public.coverage_events (church_id, road_id, seg, side, user_id, session_id, covered_at, kind)
  select p_church, g.road_id, g.seg, sd.side, p_user, p_session, (p_day + time '10:15') at time zone 'America/Argentina/Buenos_Aires', p_kind
  from public.demo_segs g cross join (values (-1), (1)) sd(side)
  where g.zone = z and (not public.demo_zone_partial(z) or public.demo_h('pz' || g.road_id::text || (g.seg / 2)::text || sd.side::text) < 560)
  on conflict (session_id, road_id, seg, side) do nothing;
  if p_only_events then return; end if;
  insert into public.coverage (church_id, road_id, seg, side, last_covered_at, last_user_id, last_session_id, times, kind)
  select e.church_id, e.road_id, e.seg, e.side, e.covered_at, e.user_id, e.session_id, 1, e.kind
  from public.coverage_events e where e.session_id = p_session
  on conflict (church_id, road_id, seg, side, kind) do update
    set last_covered_at = excluded.last_covered_at, last_user_id = excluded.last_user_id, last_session_id = excluded.last_session_id, times = public.coverage.times + 1
    where public.coverage.last_covered_at < excluded.last_covered_at;
end $$;
revoke all on function public.demo_cover(uuid, date, integer, uuid, uuid, text, boolean) from public, anon, authenticated;

-- Pone (o vuelve a poner) en su lugar todo lo que tiene coordenadas en la iglesia de ejemplo. Siempre da lo mismo: se puede repetir.
create or replace function public.demo_place_all(p_church uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n1 integer; n2 integer; n3 integer; g1 constant uuid := public.demo_id('g1'); g2 constant uuid := public.demo_id('g2');
begin
  if public.is_demo_church(p_church) is not true then raise exception 'No es una iglesia de ejemplo'; end if;
  if auth.uid() is not null then raise exception 'Solo el dueño de la base'; end if;
  set local session_replication_role = replica;
  -- Familias (todos los de una casa en el mismo lugar) y visitas nuevas
  update public.contacts c set lat = p.lat, lng = p.lng, address = p.road || ' ' || p.num, group_id = case when p.v >= 640 then g1 else g2 end
  from public.demo_plan pl cross join lateral public.demo_place(pl.hk, false) p
  where pl.church_id = p_church and c.id = pl.contact_id
    and (c.lat is distinct from p.lat or c.lng is distinct from p.lng or c.address is distinct from p.road || ' ' || p.num);
  get diagnostics n1 = row_count;
  update public.profiles pr set home_lat = c.lat, home_lng = c.lng, home_address = c.address
  from public.contacts c where c.profile_id = pr.id and c.church_id = p_church and (pr.home_lat is distinct from c.lat or pr.home_address is distinct from c.address);
  -- Contactos de las salidas de los sábados
  update public.contacts c set lat = p.lat, lng = p.lng, address_hint = p.road || ' al ' || p.num, road_id = p.road_id, side = p.side
  from (select (s.started_at at time zone 'America/Argentina/Buenos_Aires')::date::text || i::text as key
        from public.sessions s cross join generate_series(1, 2) i where s.church_id = p_church) k
  cross join lateral public.demo_place(k.key, true) p
  where c.id = public.demo_id('ec' || k.key) and c.church_id = p_church and (c.lat is distinct from p.lat or c.road_id is distinct from p.road_id);
  get diagnostics n2 = row_count;
  -- Paradas del colectivo: en la esquina más cercana a la casa, ordenadas como un recorrido
  update public.bus_stops b set lat = k.lat, lng = k.lng, address = k.a || ' y ' || k.b, group_id = x.group_id
  from (select distinct on (hm.household_id) hm.household_id, c.lat, c.lng, c.group_id from public.household_members hm join public.contacts c on c.id = hm.contact_id
        where c.church_id = p_church and c.lat is not null order by hm.household_id, c.id) x
  cross join lateral (select * from public.demo_corners dc order by power((dc.lat - x.lat) * 110800, 2) + power((dc.lng - x.lng) * 98860, 2) limit 1) k
  where b.church_id = p_church and b.household_id = x.household_id and (b.lat is distinct from k.lat or b.lng is distinct from k.lng or b.group_id is distinct from x.group_id);
  get diagnostics n3 = row_count;
  update public.bus_stops b set sort_order = o.rn
  from (select id, row_number() over (partition by group_id order by round(public.demo_v(lat, lng) / 104), case when round(public.demo_v(lat, lng) / 104)::int % 2 = 0 then public.demo_u(lat, lng) else -public.demo_u(lat, lng) end) as rn from public.bus_stops where church_id = p_church and lat is not null) o
  where o.id = b.id and b.sort_order is distinct from o.rn;
  -- Zonas: dos rectángulos con las esquinas sobre calles reales
  update public.zones z set polygon = q.poly, note = q.note
  from (select t.id, t.note, (select jsonb_agg(jsonb_build_array(k.lat, k.lng) order by w.ord)
                       from unnest(t.us, t.vs) with ordinality w(u, v, ord)
                       cross join lateral (select * from public.demo_corners dc order by power(dc.u - w.u, 2) + power(dc.v - w.v, 2) limit 1) k) as poly
        from (values (public.demo_id('z1'), array[312, 936, 936, 312]::float8[], array[1248, 1248, 624, 624]::float8[], 'Empezar por Belgrano.'),
                     (public.demo_id('z2'), array[0, 624, 624, 0]::float8[], array[520, 520, 0, 0]::float8[], null)) t(id, us, vs, note)) q
  where z.id = q.id and z.church_id = p_church and q.poly is not null and z.polygon is distinct from q.poly;
  set local session_replication_role = origin;
  return jsonb_build_object('personas', n1, 'contactos_de_salidas', n2, 'paradas', n3);
end $$;
revoke all on function public.demo_place_all(uuid) from public, anon, authenticated;

select public.demo_guard_install();
select public.demo_build_area();

-- demo_fill y demo_tick: las veredas y los contactos nuevos salen de la zona nueva. Se cambia la definición que esté puesta.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.demo_fill(uuid,date,date)'::regprocedure);
  if position('demo_cover' in d) = 0 then
    n := regexp_replace(d, 'insert into public\.coverage_events.*?< excluded\.last_covered_at;', 'perform public.demo_cover(p_church, r.d, r.w::int, v_sid, v_uid, v_kind);');
    if n = d then raise exception 'No pude cambiar la cobertura en demo_fill'; end if;
    d := n;
    n := replace(d, 'cross join lateral public.demo_spot(k.key) sp', 'cross join lateral public.demo_place(k.key, true) sp');
    if n = d then raise exception 'No pude cambiar los contactos en demo_fill'; end if;
    execute n;
  end if;
  d := pg_get_functiondef('public.demo_tick()'::regprocedure);
  if position('demo_place' in d) = 0 then
    n := replace(d, 'cross join lateral public.demo_spot(v_key) sp', 'cross join lateral public.demo_place(v_key, false) sp');
    if n = d then raise exception 'No pude cambiar demo_tick'; end if;
    execute n;
  end if;
end $$;

-- La mudanza de los datos que ya estaban cargados (una sola vez; en una base nueva no hace nada porque todavía no hay datos).
-- Las veredas recorridas que apuntaban a las calles inventadas se pasan a tramos reales, y todo lo demás lo acomoda demo_place_all.
do $$
declare ch uuid;
begin
  for ch in select church_id from public.demo_churches where seeded_at is not null loop
    set local session_replication_role = replica;
    with old as (select e.id, e.session_id, row_number() over (partition by e.session_id order by e.id) as rn,
                        (((s.started_at at time zone 'America/Argentina/Buenos_Aires')::date - date '2024-01-06') / 7)::int as w
                 from public.coverage_events e join public.sessions s on s.id = e.session_id
                 where e.church_id = ch and e.road_id >= 8800000000000),
    tg as (select o.session_id, g.road_id, g.seg, sd.side,
                  row_number() over (partition by o.session_id order by (g.zone <> public.demo_zone_of_week(o.w)), power(g.u - z.u, 2) + power(g.v - z.v, 2), g.road_id, g.seg, sd.side) as rn
           from (select distinct session_id, w from old) o
           cross join lateral (select avg(u) as u, avg(v) as v from public.demo_segs where zone = public.demo_zone_of_week(o.w)) z
           join public.demo_segs g on true cross join (values (-1), (1)) sd(side))
    update public.coverage_events e set road_id = tg.road_id, seg = tg.seg, side = tg.side
    from old join tg on tg.session_id = old.session_id and tg.rn = old.rn where e.id = old.id;
    perform public.demo_cover(ch, (s.started_at at time zone 'America/Argentina/Buenos_Aires')::date,
              (((s.started_at at time zone 'America/Argentina/Buenos_Aires')::date - date '2024-01-06') / 7)::int, s.id, s.user_id, s.kind, true)
    from public.sessions s where s.church_id = ch and exists (select 1 from public.coverage_events e where e.session_id = s.id);
    set local session_replication_role = replica;
    with agg as (select road_id, seg, side, kind, max(covered_at) as last_at, count(*)::int as times,
                        (array_agg(session_id order by covered_at desc))[1] as sid, (array_agg(user_id order by covered_at desc))[1] as uid,
                        row_number() over (order by road_id, seg, side, kind) as rn
                 from public.coverage_events where church_id = ch and road_id < 8800000000000 group by road_id, seg, side, kind),
    old as (select road_id, seg, side, kind, row_number() over (order by road_id, seg, side, kind) as rn
            from public.coverage where church_id = ch and road_id >= 8800000000000)
    update public.coverage c set road_id = agg.road_id, seg = agg.seg, side = agg.side, kind = agg.kind, last_covered_at = agg.last_at,
           last_user_id = agg.uid, last_session_id = agg.sid, times = agg.times
    from old join agg using (rn)
    where c.church_id = ch and c.road_id = old.road_id and c.seg = old.seg and c.side = old.side and c.kind = old.kind;
    insert into public.coverage (church_id, road_id, seg, side, last_covered_at, last_user_id, last_session_id, times, kind)
    select ch, road_id, seg, side, max(covered_at), (array_agg(user_id order by covered_at desc))[1], (array_agg(session_id order by covered_at desc))[1], count(*)::int, kind
    from public.coverage_events where church_id = ch and road_id < 8800000000000 group by road_id, seg, side, kind
    on conflict (church_id, road_id, seg, side, kind) do nothing;
    perform public.demo_place_all(ch);
    update public.churches set city = 'Ciudad de ejemplo' where id = ch and city = 'Arroyo Manso';
    update public.zones set created_at = now() - interval '75 days' where church_id = ch and created_at > now() - interval '30 days';
  end loop;
end $$;
