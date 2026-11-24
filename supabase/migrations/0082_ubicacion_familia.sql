-- ============================================================================
-- 0082 · Ubicación en familia (compartir dónde estoy, como un "círculo")
--
-- Cada miembro decide si comparte su ubicación y con quién. Viene APAGADO.
--  · Solo la persona prende, pausa o apaga lo suyo. Nadie (ni el pastor ni un administrador)
--    lo puede prender por otro ni leer una posición sin que esa persona lo haya elegido.
--  · La lista de quién me ve es explícita (loc_viewers): "Mi familia" y "Los pastores" copian
--    a las personas de ESE momento. Si después alguien suma a otro a mi familia, o nombran
--    a otro pastor, esa persona NO me ve hasta que yo la agregue.
--  · Las tablas no se leen ni se escriben directo: todo pasa por las funciones de abajo.
--  · Se guarda solo la última posición y un camino corto (24 horas, 288 puntos como mucho).
--    Al apagar se borra la posición y el camino.
--  · Los chicos sin cuenta son fichas, no cuentas: no se los sigue. Cada uno comparte su propio teléfono.
--
-- Se puede correr más de una vez. No borra nada de lo que ya existe.
-- ============================================================================

create table if not exists public.loc_shares (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  church_id     uuid not null references public.churches(id) on delete cascade,
  enabled       boolean not null default false,
  share_family  boolean not null default false,
  share_pastors boolean not null default false,
  paused_until  timestamptz,
  lat           double precision,
  lng           double precision,
  accuracy      real,
  speed         real,
  heading       real,
  battery       smallint,
  moving        boolean not null default false,
  located_at    timestamptz,
  trail         jsonb not null default '[]'::jsonb,     -- [[segundos, lat, lng], ...] de las últimas 24 horas
  inside        uuid[] not null default '{}',           -- mis lugares donde estoy ahora
  help_at       timestamptz,
  enabled_at    timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists public.loc_viewers (
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  via        text not null default 'persona' check (via in ('familia', 'pastor', 'persona')),
  -- on: me ve · off: apagué "Mi familia" o "Los pastores" · removed: la saqué yo a mano
  status     text not null default 'on' check (status in ('on', 'off', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);
create index if not exists loc_viewers_viewer_idx on public.loc_viewers (viewer_id) where status = 'on';

create table if not exists public.loc_places (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  church_id     uuid not null references public.churches(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 40),
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  radius_m      integer not null default 150 check (radius_m between 50 and 2000),
  last_event_at timestamptz,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists loc_places_owner_idx on public.loc_places (owner_id) where archived_at is null;

-- Cerradas del todo: sin permisos y sin políticas, nadie las lee ni las escribe directo.
alter table public.loc_shares enable row level security;
alter table public.loc_viewers enable row level security;
alter table public.loc_places enable row level security;
revoke all on public.loc_shares from public, anon, authenticated;
revoke all on public.loc_viewers from public, anon, authenticated;
revoke all on public.loc_places from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ayudas internas (no se pueden llamar desde la app)
-- ---------------------------------------------------------------------------

-- Mi iglesia, si mi cuenta está activa y la iglesia no apagó esta función. Si no, null.
create or replace function public.loc_my_church() returns uuid
language sql stable security definer set search_path = public as $$
  select p.church_id from public.profiles p join public.churches c on c.id = p.church_id
  where p.id = auth.uid() and p.disabled_at is null
    and not ('ubicacion_familia' = any(coalesce(c.disabled_features, '{}')))
$$;
revoke all on function public.loc_my_church() from public, anon, authenticated;

-- ¿Puedo ver ahora la ubicación de esta persona? Es la única regla de lectura.
create or replace function public.loc_can_see(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid() is not null and p_owner is not null and exists (
    select 1
    from public.loc_shares s
    join public.loc_viewers v on v.owner_id = s.profile_id
    join public.profiles o on o.id = s.profile_id
    where s.profile_id = p_owner
      and s.enabled
      and (s.paused_until is null or s.paused_until <= now())
      and v.viewer_id = auth.uid() and v.status = 'on'
      and o.disabled_at is null
      and o.church_id = public.loc_my_church()
      and s.church_id = o.church_id), false)
$$;
revoke all on function public.loc_can_see(uuid) from public, anon;
grant execute on function public.loc_can_see(uuid) to authenticated;

-- Las cuentas de mi familia (las fichas con cuenta de mis familias), sin contarme a mí.
create or replace function public.loc_family_ids(p_me uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct p.id
  from public.contacts mine
  join public.household_members hm on hm.contact_id = mine.id
  join public.household_members m on m.household_id = hm.household_id
  join public.contacts c on c.id = m.contact_id
  join public.profiles p on p.id = c.profile_id
  join public.profiles me on me.id = p_me
  where mine.profile_id = p_me and not mine.archived and not c.archived
    and p.id <> p_me and p.disabled_at is null and p.church_id = me.church_id
$$;
revoke all on function public.loc_family_ids(uuid) from public, anon, authenticated;

-- Los pastores de mi iglesia (pastor y pastor asistente), sin contarme a mí.
create or replace function public.loc_pastor_ids(p_me uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p join public.profiles me on me.id = p_me
  where p.church_id = me.church_id and p.id <> p_me and p.disabled_at is null
    and (p.role::text = 'admin' or p.role::text = 'assistant_pastor' or 'assistant_pastor' = any(coalesce(p.extra_roles, '{}')))
$$;
revoke all on function public.loc_pastor_ids(uuid) from public, anon, authenticated;

-- Las personas que me ven ahora (lista explícita, con cuenta activa en mi iglesia).
create or replace function public.loc_active_viewers(p_owner uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select v.viewer_id from public.loc_viewers v
  join public.profiles p on p.id = v.viewer_id
  join public.profiles o on o.id = v.owner_id
  where v.owner_id = p_owner and v.status = 'on' and p.disabled_at is null and p.church_id = o.church_id
$$;
revoke all on function public.loc_active_viewers(uuid) from public, anon, authenticated;

create or replace function public.loc_first_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(btrim(display_name), ' ', 1), ''), 'Alguien') from public.profiles where id = p_user
$$;
revoke all on function public.loc_first_name(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Prender, apagar y elegir con quién
-- ---------------------------------------------------------------------------

-- Solo cambia LO MÍO (auth.uid()). No recibe de quién: no hay forma de prenderlo por otro.
create or replace function public.loc_set(p_on boolean, p_family boolean default false, p_pastors boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_church uuid := public.loc_my_church(); r record;
begin
  if v_me is null then raise exception 'Tenés que entrar a la app'; end if;
  if v_church is null then raise exception 'Tu iglesia no usa esta función'; end if;

  insert into public.loc_shares (profile_id, church_id, enabled, share_family, share_pastors, enabled_at)
  values (v_me, v_church, coalesce(p_on, false), coalesce(p_family, false), coalesce(p_pastors, false), case when p_on then now() end)
  on conflict (profile_id) do update set
    church_id = excluded.church_id, enabled = excluded.enabled,
    share_family = excluded.share_family, share_pastors = excluded.share_pastors,
    enabled_at = case when excluded.enabled and not public.loc_shares.enabled then now() else public.loc_shares.enabled_at end,
    updated_at = now();

  if p_on is not true then
    -- Apagado: no queda guardado dónde estuve.
    update public.loc_shares set lat = null, lng = null, accuracy = null, speed = null, heading = null, battery = null,
           moving = false, located_at = null, trail = '[]'::jsonb, inside = '{}', help_at = null, paused_until = null
     where profile_id = v_me;
    return;
  end if;

  -- Primero se apaga lo que se destildó; después se prende lo elegido (así alguien que es familiar Y pastor queda bien).
  if p_family is not true then
    update public.loc_viewers set status = 'off', updated_at = now() where owner_id = v_me and via = 'familia' and status = 'on';
  end if;
  if p_pastors is not true then
    update public.loc_viewers set status = 'off', updated_at = now() where owner_id = v_me and via = 'pastor' and status = 'on';
  end if;
  -- "Mi familia": se copian los familiares con cuenta que hay hoy. A quien saqué a mano no se lo vuelve a sumar.
  if p_family then
    for r in select f as id from public.loc_family_ids(v_me) f loop
      insert into public.loc_viewers (owner_id, viewer_id, via) values (v_me, r.id, 'familia')
      on conflict (owner_id, viewer_id) do update set status = 'on', updated_at = now()
        where public.loc_viewers.status = 'off';
    end loop;
  end if;
  -- "Los pastores": igual, los de hoy.
  if p_pastors then
    for r in select f as id from public.loc_pastor_ids(v_me) f loop
      insert into public.loc_viewers (owner_id, viewer_id, via) values (v_me, r.id, 'pastor')
      on conflict (owner_id, viewer_id) do update set status = 'on', updated_at = now()
        where public.loc_viewers.status = 'off';
    end loop;
  end if;
end $$;
revoke all on function public.loc_set(boolean, boolean, boolean) from public, anon;
grant execute on function public.loc_set(boolean, boolean, boolean) to authenticated;

-- Sumar a una persona de la iglesia a los que me ven (por nombre, o un familiar o pastor nuevo).
create or replace function public.loc_viewer_add(p_viewer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_church uuid := public.loc_my_church(); v_new boolean; v_on boolean;
begin
  if v_me is null or v_church is null then raise exception 'Tu iglesia no usa esta función'; end if;
  if p_viewer is null or p_viewer = v_me then raise exception 'Elegí a otra persona'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_viewer and p.church_id = v_church and p.disabled_at is null) then
    raise exception 'Esa persona no tiene cuenta en tu iglesia';
  end if;
  if (select count(*) from public.loc_viewers where owner_id = v_me and status = 'on') >= 40 then
    raise exception 'Ya compartís con muchas personas. Sacá a alguien primero.';
  end if;
  select status <> 'on' into v_new from public.loc_viewers where owner_id = v_me and viewer_id = p_viewer;
  insert into public.loc_shares (profile_id, church_id) values (v_me, v_church) on conflict (profile_id) do nothing;
  insert into public.loc_viewers (owner_id, viewer_id, via) values (v_me, p_viewer, 'persona')
  on conflict (owner_id, viewer_id) do update set status = 'on', updated_at = now();
  select enabled into v_on from public.loc_shares where profile_id = v_me;
  if coalesce(v_new, true) and v_on then
    perform public.notify(p_viewer, 'location', public.loc_first_name(v_me) || ' comparte su ubicación con vos',
                          'Tocá para ver dónde está en el mapa.', '/familia-ubicacion');
  end if;
end $$;
revoke all on function public.loc_viewer_add(uuid) from public, anon;
grant execute on function public.loc_viewer_add(uuid) to authenticated;

-- Sacar a una persona: deja de verme en el momento, aunque sea de mi familia o pastor.
create or replace function public.loc_viewer_remove(p_viewer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tenés que entrar a la app'; end if;
  update public.loc_viewers set status = 'removed', updated_at = now() where owner_id = auth.uid() and viewer_id = p_viewer;
end $$;
revoke all on function public.loc_viewer_remove(uuid) from public, anon;
grant execute on function public.loc_viewer_remove(uuid) to authenticated;

-- Pausar hasta una hora (36 horas como mucho). Con null se vuelve a compartir.
create or replace function public.loc_pause(p_until timestamptz default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'Tenés que entrar a la app'; end if;
  v_until := case when p_until is null or p_until <= now() then null else least(p_until, now() + interval '36 hours') end;
  update public.loc_shares set paused_until = v_until, help_at = case when v_until is null then help_at else null end, updated_at = now()
   where profile_id = auth.uid();
  return v_until;
end $$;
revoke all on function public.loc_pause(timestamptz) from public, anon;
grant execute on function public.loc_pause(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Mandar mi posición (la manda mi propio teléfono)
-- ---------------------------------------------------------------------------
-- Devuelve 'ok', 'paused' (en pausa: no se guarda nada) u 'off' (apagado: el teléfono deja de mandar).
create or replace function public.loc_push(
  p_lat double precision, p_lng double precision, p_accuracy real default null, p_speed real default null,
  p_heading real default null, p_battery integer default null, p_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); s public.loc_shares; v_at timestamptz; v_moving boolean; v_trail jsonb; v_last jsonb;
  v_inside uuid[]; pl record; d double precision; v_was boolean; v_first boolean; v_name text; v_to uuid; v_quiet boolean;
begin
  if v_me is null then return 'off'; end if;
  select * into s from public.loc_shares where profile_id = v_me for update;
  if s.profile_id is null or not s.enabled or public.loc_my_church() is null then return 'off'; end if;
  if s.paused_until is not null and s.paused_until > now() then return 'paused'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return 'ok'; end if;

  v_at := least(coalesce(p_at, now()), now());
  if s.located_at is not null and v_at <= s.located_at then return 'ok'; end if;          -- llegó tarde: ya hay una más nueva
  if s.located_at is not null and now() - s.updated_at < interval '10 seconds' then return 'ok'; end if;  -- demasiado seguido

  v_first := s.lat is null;
  v_moving := coalesce(p_speed, 0) > 1.2
              or (not v_first and extract(epoch from v_at - s.located_at) between 1 and 900
                  and public.haversine_m(s.lat, s.lng, p_lat, p_lng) / extract(epoch from v_at - s.located_at) > 1.2
                  and public.haversine_m(s.lat, s.lng, p_lat, p_lng) > 60);

  -- El camino: un punto nuevo solo si me moví 50 m o pasaron 10 minutos. Quedan 24 horas y 288 puntos como mucho.
  v_trail := s.trail;
  v_last := v_trail -> (jsonb_array_length(v_trail) - 1);
  if v_last is null
     or public.haversine_m((v_last ->> 1)::double precision, (v_last ->> 2)::double precision, p_lat, p_lng) > 50
     or extract(epoch from v_at) - (v_last ->> 0)::bigint > 600 then
    v_trail := v_trail || jsonb_build_array(jsonb_build_array(extract(epoch from v_at)::bigint, round(p_lat::numeric, 5), round(p_lng::numeric, 5)));
  end if;
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_trail
  from (select e, ord from jsonb_array_elements(v_trail) with ordinality t(e, ord)
        where (e ->> 0)::bigint > extract(epoch from now())::bigint - 86400
        order by ord desc limit 288) x;

  -- Mis lugares: ¿llegué o salí? (con margen para que no avise de más cuando el GPS baila)
  v_inside := s.inside;
  v_quiet := v_first or coalesce(p_accuracy, 0) > 200;
  if not (coalesce(p_accuracy, 0) > 200) then
    v_name := public.loc_first_name(v_me);
    for pl in select * from public.loc_places where owner_id = v_me and archived_at is null loop
      d := public.haversine_m(pl.lat, pl.lng, p_lat, p_lng);
      v_was := pl.id = any(v_inside);
      if not v_was and d <= pl.radius_m then
        v_inside := array_append(v_inside, pl.id);
        if not v_quiet and (pl.last_event_at is null or now() - pl.last_event_at > interval '3 minutes') then
          for v_to in select public.loc_active_viewers(v_me) loop
            perform public.notify(v_to, 'location', v_name || ' llegó a ' || pl.name, 'Tocá para ver el mapa.', '/familia-ubicacion');
          end loop;
          update public.loc_places set last_event_at = now() where id = pl.id;
        end if;
      elsif v_was and d > pl.radius_m * 1.25 + 30 then
        v_inside := array_remove(v_inside, pl.id);
        if not v_quiet and (pl.last_event_at is null or now() - pl.last_event_at > interval '3 minutes') then
          for v_to in select public.loc_active_viewers(v_me) loop
            perform public.notify(v_to, 'location', v_name || ' salió de ' || pl.name, 'Tocá para ver el mapa.', '/familia-ubicacion');
          end loop;
          update public.loc_places set last_event_at = now() where id = pl.id;
        end if;
      end if;
    end loop;
  end if;

  update public.loc_shares set
    lat = p_lat, lng = p_lng, accuracy = p_accuracy,
    speed = case when p_speed >= 0 then p_speed end, heading = case when p_heading >= 0 then p_heading end,
    battery = case when p_battery between 0 and 100 then p_battery end,
    moving = v_moving, located_at = v_at, trail = v_trail, inside = v_inside, updated_at = now()
  where profile_id = v_me;
  return 'ok';
end $$;
revoke all on function public.loc_push(double precision, double precision, real, real, real, integer, timestamptz) from public, anon;
grant execute on function public.loc_push(double precision, double precision, real, real, real, integer, timestamptz) to authenticated;

-- "Pedir ayuda": avisa a todos los que me ven, con mi posición de ahora. Saca la pausa. Devuelve a cuántos avisó.
create or replace function public.loc_help(p_lat double precision default null, p_lng double precision default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); s public.loc_shares; v_to uuid; n integer := 0; v_name text;
begin
  if v_me is null or public.loc_my_church() is null then raise exception 'Tu iglesia no usa esta función'; end if;
  select * into s from public.loc_shares where profile_id = v_me for update;
  if s.profile_id is null or not s.enabled then raise exception 'Primero prendé "Compartir mi ubicación"'; end if;
  if not exists (select 1 from public.loc_active_viewers(v_me)) then raise exception 'Todavía no elegiste con quién compartir'; end if;
  if s.help_at is not null and now() - s.help_at < interval '1 minute' then raise exception 'Ya avisamos recién. Esperá un minuto.'; end if;
  update public.loc_shares set
    paused_until = null, help_at = now(), updated_at = now(),
    lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
    located_at = case when p_lat is not null and p_lng is not null then now() else located_at end
  where profile_id = v_me;
  v_name := public.loc_first_name(v_me);
  for v_to in select public.loc_active_viewers(v_me) loop
    perform public.notify(v_to, 'location_help', v_name || ' pide ayuda', 'Tocá para ver dónde está ahora.', '/familia-ubicacion?ayuda=' || v_me);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.loc_help(double precision, double precision) from public, anon;
grant execute on function public.loc_help(double precision, double precision) to authenticated;

create or replace function public.loc_help_clear() returns void
language sql security definer set search_path = public as $$
  update public.loc_shares set help_at = null, updated_at = now() where profile_id = auth.uid()
$$;
revoke all on function public.loc_help_clear() from public, anon;
grant execute on function public.loc_help_clear() to authenticated;

-- ---------------------------------------------------------------------------
-- Leer
-- ---------------------------------------------------------------------------

-- Las personas que comparten conmigo ahora.
create or replace function public.loc_visible()
returns table (profile_id uuid, name text, photo_path text, lat double precision, lng double precision, accuracy real,
               battery smallint, moving boolean, located_at timestamptz, help_at timestamptz, place text, via text)
language sql stable security definer set search_path = public as $$
  select s.profile_id, o.display_name,
         (select c.photo_path from public.contacts c where c.profile_id = o.id and not c.archived order by c.created_at limit 1),
         s.lat, s.lng, s.accuracy, s.battery, s.moving, s.located_at,
         case when s.help_at > now() - interval '2 hours' then s.help_at end,
         (select pl.name from public.loc_places pl where pl.id = any(s.inside) and pl.archived_at is null order by pl.radius_m limit 1),
         v.via
  from public.loc_viewers v
  join public.loc_shares s on s.profile_id = v.owner_id
  join public.profiles o on o.id = s.profile_id
  where v.viewer_id = auth.uid() and public.loc_can_see(s.profile_id)
  order by o.display_name
$$;
revoke all on function public.loc_visible() from public, anon;
grant execute on function public.loc_visible() to authenticated;

-- El camino de las últimas 24 horas de alguien que comparte conmigo (o el mío).
create or replace function public.loc_trail(p_owner uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(e order by ord)
    from public.loc_shares s, jsonb_array_elements(s.trail) with ordinality t(e, ord)
    where s.profile_id = p_owner and (p_owner = auth.uid() or public.loc_can_see(p_owner))
      and (e ->> 0)::bigint > extract(epoch from now())::bigint - 86400), '[]'::jsonb)
$$;
revoke all on function public.loc_trail(uuid) from public, anon;
grant execute on function public.loc_trail(uuid) to authenticated;

-- Todo lo mío: si comparto, con quién, mis lugares y a quién podría sumar.
create or replace function public.loc_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'available', public.loc_my_church() is not null,
    'enabled', coalesce(s.enabled, false),
    'share_family', coalesce(s.share_family, false),
    'share_pastors', coalesce(s.share_pastors, false),
    'paused_until', case when s.paused_until > now() then s.paused_until end,
    'located_at', s.located_at,
    'help_at', case when s.help_at > now() - interval '2 hours' then s.help_at end,
    'lat', s.lat, 'lng', s.lng,
    'viewers', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'via', v.via,
               'photo_path', (select c.photo_path from public.contacts c where c.profile_id = p.id and not c.archived order by c.created_at limit 1))
             order by p.display_name)
      from public.loc_viewers v join public.profiles p on p.id = v.viewer_id
      where v.owner_id = me.id and v.viewer_id in (select public.loc_active_viewers(me.id))), '[]'::jsonb),
    -- Familiares y pastores con cuenta que hoy NO me ven (nuevos, o que saqué): se pueden sumar a mano.
    'family_left', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) order by p.display_name)
      from public.profiles p where p.id in (select public.loc_family_ids(me.id))
        and p.id not in (select public.loc_active_viewers(me.id))), '[]'::jsonb),
    'family_count', (select count(*) from public.loc_family_ids(me.id)),
    'pastor_count', (select count(*) from public.loc_pastor_ids(me.id)),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object('id', pl.id, 'name', pl.name, 'lat', pl.lat, 'lng', pl.lng, 'radius_m', pl.radius_m,
               'inside', pl.id = any(coalesce(s.inside, '{}'))) order by pl.created_at)
      from public.loc_places pl where pl.owner_id = me.id and pl.archived_at is null), '[]'::jsonb),
    'home', case when me.home_lat is not null and me.home_lng is not null then jsonb_build_object('lat', me.home_lat, 'lng', me.home_lng) end)
  from public.profiles me left join public.loc_shares s on s.profile_id = me.id
  where me.id = auth.uid()
$$;
revoke all on function public.loc_me() from public, anon;
grant execute on function public.loc_me() to authenticated;

-- ---------------------------------------------------------------------------
-- Mis lugares (Casa, Iglesia, Trabajo...)
-- ---------------------------------------------------------------------------
create or replace function public.loc_place_save(p_id uuid, p_name text, p_lat double precision, p_lng double precision, p_radius integer default 150)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_church uuid := public.loc_my_church(); v_id uuid; v_r integer := greatest(50, least(2000, coalesce(p_radius, 150)));
begin
  if v_me is null or v_church is null then raise exception 'Tu iglesia no usa esta función'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Poné el nombre del lugar'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Marcá el lugar en el mapa'; end if;
  if p_id is not null then
    update public.loc_places set name = left(btrim(p_name), 40), lat = p_lat, lng = p_lng, radius_m = v_r
     where id = p_id and owner_id = v_me and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Ese lugar no es tuyo'; end if;
  else
    if (select count(*) from public.loc_places where owner_id = v_me and archived_at is null) >= 12 then
      raise exception 'Podés guardar hasta 12 lugares. Sacá uno primero.';
    end if;
    insert into public.loc_places (owner_id, church_id, name, lat, lng, radius_m)
    values (v_me, v_church, left(btrim(p_name), 40), p_lat, p_lng, v_r) returning id into v_id;
  end if;
  -- Si ya estoy adentro, queda anotado sin avisar a nadie.
  update public.loc_shares s set inside = case
      when s.lat is not null and public.haversine_m(p_lat, p_lng, s.lat, s.lng) <= v_r then array_append(array_remove(s.inside, v_id), v_id)
      else array_remove(s.inside, v_id) end
   where s.profile_id = v_me;
  return v_id;
end $$;
revoke all on function public.loc_place_save(uuid, text, double precision, double precision, integer) from public, anon;
grant execute on function public.loc_place_save(uuid, text, double precision, double precision, integer) to authenticated;

create or replace function public.loc_place_archive(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.loc_places set archived_at = now() where id = p_id and owner_id = auth.uid() and archived_at is null;
  update public.loc_shares set inside = array_remove(inside, p_id) where profile_id = auth.uid();
end $$;
revoke all on function public.loc_place_archive(uuid) from public, anon;
grant execute on function public.loc_place_archive(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Limpieza de cada hora: el camino de más de 24 horas se vacía aunque el teléfono ya no mande nada,
-- las pausas vencidas se quitan, y lo que quedó de una cuenta desactivada se apaga.
-- ---------------------------------------------------------------------------
create or replace function public.loc_sweep() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.loc_shares s set trail = coalesce((
      select jsonb_agg(e order by ord) from jsonb_array_elements(s.trail) with ordinality t(e, ord)
      where (e ->> 0)::bigint > extract(epoch from now())::bigint - 86400), '[]'::jsonb)
   where jsonb_array_length(s.trail) > 0 and (s.trail -> 0 ->> 0)::bigint <= extract(epoch from now())::bigint - 86400;
  update public.loc_shares set paused_until = null where paused_until is not null and paused_until <= now();
  update public.loc_shares set help_at = null where help_at is not null and help_at < now() - interval '2 hours';
  -- Sin noticias hace 30 días: se borra la última posición (sigue prendido, pero sin dato viejo guardado).
  update public.loc_shares set lat = null, lng = null, accuracy = null, speed = null, heading = null, battery = null, moving = false, inside = '{}'
   where lat is not null and located_at < now() - interval '30 days';
  update public.loc_shares s set enabled = false, lat = null, lng = null, located_at = null, trail = '[]'::jsonb, inside = '{}', help_at = null
   from public.profiles p where p.id = s.profile_id and s.enabled and (p.disabled_at is not null or p.church_id is distinct from s.church_id);
end $$;
revoke all on function public.loc_sweep() from public, anon, authenticated;

do $c$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and not exists (select 1 from cron.job where jobname = 'lamies-ubicacion') then
    perform cron.schedule('lamies-ubicacion', '17 * * * *', 'select public.loc_sweep()');
  end if;
end $c$;
