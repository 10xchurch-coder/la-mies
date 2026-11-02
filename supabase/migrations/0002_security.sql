-- ============================================================================
-- La Mies · Fase 1 · Seguridad
-- Row Level Security (RLS) en TODAS las tablas. La app usa la clave "anon"
-- pública; lo que cada persona puede ver o cambiar lo decide esta capa,
-- no el código de la app.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Funciones de ayuda (security definer: leen profiles sin disparar RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_church_id() returns uuid
language sql stable security definer set search_path = public as $$
  select church_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_group_id() returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role_name() returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_captain_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('captain', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_network_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_network_admin from public.profiles where id = auth.uid()), false)
$$;

-- Un contacto se ve si: lo creé, me lo asignaron para seguimiento, soy admin,
-- está compartido con todo el grupo del que lo creó y yo estoy en ese grupo,
-- o me lo compartieron a mí puntualmente.
create or replace function public.can_see_contact(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select c.church_id = public.current_church_id() and (
    c.created_by = auth.uid()
    or c.follow_up_user_id = auth.uid()
    or public.is_admin()
    or (c.share_mode = 'group' and exists (
          select 1 from public.profiles p
          where p.id = c.created_by
            and p.group_id is not null
            and p.group_id = public.current_group_id()))
    or exists (select 1 from public.contact_shares s where s.contact_id = c.id and s.user_id = auth.uid())
  )
$$;

create or replace function public.can_edit_contact(c public.contacts) returns boolean
language sql stable security definer set search_path = public as $$
  select c.church_id = public.current_church_id() and (
    c.created_by = auth.uid()
    or c.follow_up_user_id = auth.uid()
    or public.is_admin()
    or (public.current_role_name() = 'captain' and exists (
          select 1 from public.profiles p
          where p.id = c.created_by and p.group_id = public.current_group_id()))
  )
$$;

-- ---------------------------------------------------------------------------
-- Guardas: nadie se cambia el rol, la iglesia o el grupo a sí mismo
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Llamadas internas (service role, SQL directo) o funciones marcadas pasan.
  if auth.uid() is null or current_setting('lamies.bypass_guard', true) = 'on' then
    return new;
  end if;
  if new.id <> old.id then
    raise exception 'No se puede cambiar el id';
  end if;
  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id
      or new.group_id is distinct from old.group_id
      or new.is_network_admin is distinct from old.is_network_admin)
     and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar rol, iglesia o grupo';
  end if;
  if new.is_network_admin is distinct from old.is_network_admin then
    raise exception 'El administrador de la red se asigna desde la base de datos';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Al crear un contacto, visita o asistencia, la iglesia y el autor se
-- completan solos con los datos de quien está logueado.
create or replace function public.stamp_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.church_id := public.current_church_id();
    if tg_table_name = 'contacts' then new.created_by := auth.uid(); end if;
    if tg_table_name = 'contact_visits' then new.user_id := auth.uid(); end if;
    if tg_table_name = 'attendances' then new.recorded_by := auth.uid(); end if;
  end if;
  if new.church_id is null then
    raise exception 'La persona no pertenece a ninguna iglesia';
  end if;
  return new;
end $$;

create trigger contacts_stamp before insert on public.contacts
  for each row execute function public.stamp_owner();
create trigger contact_visits_stamp before insert on public.contact_visits
  for each row execute function public.stamp_owner();
create trigger attendances_stamp before insert on public.attendances
  for each row execute function public.stamp_owner();

-- Un contacto editado no puede cambiar de iglesia ni de creador.
create or replace function public.contacts_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.church_id := old.church_id;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger contacts_guard before update on public.contacts
  for each row execute function public.contacts_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.churches         enable row level security;
alter table public.groups           enable row level security;
alter table public.profiles         enable row level security;
alter table public.sessions         enable row level security;
alter table public.track_points     enable row level security;
alter table public.live_positions   enable row level security;
alter table public.roads            enable row level security;
alter table public.coverage         enable row level security;
alter table public.coverage_events  enable row level security;
alter table public.contacts         enable row level security;
alter table public.contact_children enable row level security;
alter table public.contact_shares   enable row level security;
alter table public.contact_visits   enable row level security;
alter table public.attendances      enable row level security;
alter table public.training_items   enable row level security;
alter table public.audit_log        enable row level security;

-- churches: cada uno ve solo su iglesia; el admin edita nombre/ciudad.
create policy churches_select on public.churches for select to authenticated
  using (id = public.current_church_id());
create policy churches_update on public.churches for update to authenticated
  using (id = public.current_church_id() and public.is_admin())
  with check (id = public.current_church_id() and public.is_admin());

-- groups
create policy groups_select on public.groups for select to authenticated
  using (church_id = public.current_church_id());
create policy groups_admin on public.groups for all to authenticated
  using (church_id = public.current_church_id() and public.is_admin())
  with check (church_id = public.current_church_id() and public.is_admin());

-- profiles: se ven los hermanos de la misma iglesia; cada uno edita lo suyo
-- (el trigger impide cambiar rol/iglesia/grupo); el admin edita a cualquiera.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or church_id = public.current_church_id());
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and church_id is null and role = 'member' and is_network_admin = false);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (church_id = public.current_church_id() and public.is_admin())
  with check (church_id = public.current_church_id() and public.is_admin());

-- sessions: todo el equipo ve las salidas de la iglesia (estadísticas);
-- solo el dueño o el admin las modifican. Se crean con start_session().
create policy sessions_select on public.sessions for select to authenticated
  using (church_id = public.current_church_id());
create policy sessions_update on public.sessions for update to authenticated
  using (church_id = public.current_church_id() and (user_id = auth.uid() or public.is_admin()))
  with check (church_id = public.current_church_id() and (user_id = auth.uid() or public.is_admin()));

-- track_points: el recorrido crudo lo ve su dueño, el admin, y el equipo
-- mientras la salida está activa (para verlo en vivo). Se cargan por función.
create policy track_points_select on public.track_points for select to authenticated
  using (
    church_id = public.current_church_id() and (
      user_id = auth.uid()
      or public.is_admin()
      or exists (select 1 from public.sessions s where s.id = session_id and s.ended_at is null)
    )
  );

-- live_positions: el equipo ve dónde está cada uno mientras sale.
create policy live_positions_select on public.live_positions for select to authenticated
  using (church_id = public.current_church_id());
create policy live_positions_own on public.live_positions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and church_id = public.current_church_id());

-- roads: datos públicos de OpenStreetMap. Solo lectura desde la app.
create policy roads_select on public.roads for select to authenticated using (true);

-- coverage: toda la iglesia la ve. Se escribe solo por upsert_coverage().
create policy coverage_select on public.coverage for select to authenticated
  using (church_id = public.current_church_id());
create policy coverage_events_select on public.coverage_events for select to authenticated
  using (church_id = public.current_church_id());

-- contacts
create policy contacts_select on public.contacts for select to authenticated
  using (public.can_see_contact(contacts));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.current_church_id() is not null);
create policy contacts_update on public.contacts for update to authenticated
  using (public.can_edit_contact(contacts)) with check (public.can_edit_contact(contacts));
create policy contacts_delete on public.contacts for delete to authenticated
  using (church_id = public.current_church_id() and (created_by = auth.uid() or public.is_admin()));

-- contact_children: siguen la visibilidad del contacto.
create policy contact_children_select on public.contact_children for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact(c)));
create policy contact_children_write on public.contact_children for all to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c)))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c)));

-- contact_shares: el creador o el admin eligen con quién compartir; cada uno ve lo suyo.
create policy contact_shares_select on public.contact_shares for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c)));
create policy contact_shares_write on public.contact_shares for all to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c)))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_contact(c))
              and exists (select 1 from public.profiles p where p.id = user_id and p.church_id = public.current_church_id()));

-- contact_visits
create policy contact_visits_select on public.contact_visits for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact(c)));
create policy contact_visits_insert on public.contact_visits for insert to authenticated
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.can_see_contact(c)));
create policy contact_visits_update on public.contact_visits for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- attendances: la ven todos los de la iglesia; la cargan capitanes y admins.
create policy attendances_select on public.attendances for select to authenticated
  using (church_id = public.current_church_id());
create policy attendances_write on public.attendances for all to authenticated
  using (church_id = public.current_church_id() and public.is_captain_or_admin())
  with check (public.is_captain_or_admin());

-- training_items: el material general lo ven todos; el de una iglesia, esa iglesia.
-- Lo carga el admin de la iglesia (lo suyo) o el admin de la red (lo general).
create policy training_select on public.training_items for select to authenticated
  using (published and (church_id is null or church_id = public.current_church_id()));
create policy training_church_admin on public.training_items for all to authenticated
  using (church_id = public.current_church_id() and public.is_admin())
  with check (church_id = public.current_church_id() and public.is_admin());
create policy training_network_admin on public.training_items for all to authenticated
  using (church_id is null and public.is_network_admin())
  with check (church_id is null and public.is_network_admin());

-- audit_log: solo el admin lee; se escribe desde funciones.
create policy audit_log_select on public.audit_log for select to authenticated
  using (church_id = public.current_church_id() and public.is_admin());

-- ---------------------------------------------------------------------------
-- Permisos de las tablas. Lo que no está acá, no se puede hacer.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to authenticated, service_role;
grant select on public.churches, public.groups, public.profiles, public.sessions,
  public.track_points, public.live_positions, public.roads, public.coverage,
  public.coverage_events, public.contacts, public.contact_children, public.contact_shares,
  public.contact_visits, public.attendances, public.training_items, public.audit_log to authenticated;
grant insert, update, delete on public.training_items to authenticated;
grant update on public.churches, public.sessions to authenticated;
grant insert, update, delete on public.groups to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.live_positions to authenticated;
grant insert, update, delete on public.contacts, public.contact_children, public.contact_shares to authenticated;
grant insert, update on public.contact_visits to authenticated;
grant insert, update, delete on public.attendances to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
