-- ============================================================================
-- 0091 · Ubicación en familia: historial de 30 días y "Mi familia" en un toque
--
--  · Historial: cada punto que manda el teléfono se guarda 30 días (loc_history).
--    Lo ven solo la persona y quienes ella eligió (loc_can_see). En pausa no se guarda nada.
--    Al dejar de compartir se borra todo el historial.
--  · Mi familia: se suma a alguien con cuenta tocando su nombre. La otra persona acepta
--    (el pastor/administrador lo une directo). Queda unida como familia en toda la app.
--    Si alguno ya comparte con "Mi familia", el nuevo familiar empieza a verlo.
--
-- Se puede correr más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Historial
-- ---------------------------------------------------------------------------
create table if not exists public.loc_history (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  at         timestamptz not null,
  lat        double precision not null,
  lng        double precision not null,
  accuracy   real,
  speed      real,
  battery    smallint,
  primary key (profile_id, at)
);
alter table public.loc_history enable row level security;
revoke all on public.loc_history from anon, authenticated;

-- Cada vez que cambia mi última posición, queda en el historial.
create or replace function public.loc_history_keep() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lat is not null and new.lng is not null and new.located_at is not null
     and new.located_at is distinct from old.located_at then
    insert into public.loc_history (profile_id, at, lat, lng, accuracy, speed, battery)
    values (new.profile_id, new.located_at, new.lat, new.lng, new.accuracy, new.speed, new.battery)
    on conflict do nothing;
  end if;
  -- Dejó de compartir: no queda nada guardado.
  if old.enabled and not new.enabled then
    delete from public.loc_history where profile_id = new.profile_id;
  end if;
  return new;
end $$;
drop trigger if exists loc_history_keep on public.loc_shares;
create trigger loc_history_keep after update on public.loc_shares
  for each row execute function public.loc_history_keep();

-- Varios puntos juntos (el teléfono los junta cuando está guardado). Guarda todos y deja el último como posición actual.
create or replace function public.loc_push_many(p_points jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); s public.loc_shares; e jsonb; v_at timestamptz; v_last jsonb; n int;
begin
  if v_me is null then return 'off'; end if;
  select * into s from public.loc_shares where profile_id = v_me;
  if s.profile_id is null or not s.enabled or public.loc_my_church() is null then return 'off'; end if;
  if s.paused_until is not null and s.paused_until > now() then return 'paused'; end if;
  n := coalesce(jsonb_array_length(p_points), 0);
  if n = 0 then return 'ok'; end if;
  for e in select x from jsonb_array_elements(p_points) x limit 500 loop
    if (e ->> 'lat') is null or (e ->> 'lng') is null then continue; end if;
    if (e ->> 'lat')::double precision not between -90 and 90 or (e ->> 'lng')::double precision not between -180 and 180 then continue; end if;
    v_at := least(coalesce(to_timestamp((e ->> 'at')::double precision / 1000), now()), now());
    if v_at < now() - interval '30 days' then continue; end if;
    insert into public.loc_history (profile_id, at, lat, lng, accuracy, speed, battery)
    values (v_me, v_at, (e ->> 'lat')::double precision, (e ->> 'lng')::double precision,
            (e ->> 'accuracy')::real, case when (e ->> 'speed')::real >= 0 then (e ->> 'speed')::real end,
            case when (e ->> 'battery')::int between 0 and 100 then (e ->> 'battery')::int end)
    on conflict do nothing;
  end loop;
  v_last := p_points -> (n - 1);
  return public.loc_push((v_last ->> 'lat')::double precision, (v_last ->> 'lng')::double precision,
    (v_last ->> 'accuracy')::real, (v_last ->> 'speed')::real, (v_last ->> 'heading')::real, (v_last ->> 'battery')::int,
    case when v_last ? 'at' then to_timestamp((v_last ->> 'at')::double precision / 1000) end);
end $$;
revoke all on function public.loc_push_many(jsonb) from public, anon;
grant execute on function public.loc_push_many(jsonb) to authenticated;

-- El historial de un día (o un rango) de una persona: [[segundos, lat, lng, velocidad], ...]
create or replace function public.loc_history(p_owner uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_array(extract(epoch from h.at)::bigint, round(h.lat::numeric, 6), round(h.lng::numeric, 6), h.speed) order by h.at)
    from (select * from public.loc_history h
          where h.profile_id = p_owner and (p_owner = auth.uid() or public.loc_can_see(p_owner))
            and h.at >= greatest(p_from, now() - interval '30 days') and h.at < p_to
          order by h.at limit 8000) h), '[]'::jsonb)
$$;
revoke all on function public.loc_history(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.loc_history(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.loc_history_sweep() returns void
language sql security definer set search_path = public as $$
  delete from public.loc_history where at < now() - interval '30 days';
$$;
revoke all on function public.loc_history_sweep() from public, anon, authenticated;

do $c$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and not exists (select 1 from cron.job where jobname = 'lamies-historial') then
    perform cron.schedule('lamies-historial', '41 4 * * *', 'select public.loc_history_sweep()');
  end if;
end $c$;

-- ---------------------------------------------------------------------------
-- Mi familia
-- ---------------------------------------------------------------------------
create table if not exists public.loc_family_requests (
  from_id    uuid not null references public.profiles(id) on delete cascade,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.loc_family_requests enable row level security;
revoke all on public.loc_family_requests from anon, authenticated;

create or replace function public.loc_card_of(p_profile uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.contacts c where c.profile_id = p_profile and not c.archived order by c.created_at limit 1
$$;
revoke all on function public.loc_card_of(uuid) from public, anon, authenticated;

-- Une a dos personas como familia (misma casa). Si alguno comparte con "Mi familia", el otro empieza a verlo.
create or replace function public.loc_family_link(p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ca uuid := public.loc_card_of(p_a); cb uuid := public.loc_card_of(p_b); v_church uuid; v_house uuid;
begin
  if ca is null or cb is null then raise exception 'Esa persona todavía no tiene ficha en la iglesia'; end if;
  select church_id into v_church from public.profiles where id = p_a;
  select hm.household_id into v_house from public.household_members hm join public.households h on h.id = hm.household_id
   where hm.contact_id = ca and h.church_id = v_church order by hm.created_at limit 1;
  if v_house is null then
    select hm.household_id into v_house from public.household_members hm join public.households h on h.id = hm.household_id
     where hm.contact_id = cb and h.church_id = v_church order by hm.created_at limit 1;
  end if;
  if v_house is null then
    insert into public.households (church_id, name, created_by)
    values (v_church, 'Familia de ' || coalesce((select display_name from public.profiles where id = p_a), ''), p_a)
    returning id into v_house;
  end if;
  insert into public.household_members (household_id, contact_id) values (v_house, ca) on conflict do nothing;
  insert into public.household_members (household_id, contact_id) values (v_house, cb) on conflict do nothing;
  delete from public.loc_family_requests where (from_id = p_a and to_id = p_b) or (from_id = p_b and to_id = p_a);
  -- Quien ya comparte con su familia: el familiar nuevo lo ve (salvo que lo haya sacado a mano).
  insert into public.loc_viewers (owner_id, viewer_id, via)
  select s.profile_id, case when s.profile_id = p_a then p_b else p_a end, 'familia'
    from public.loc_shares s where s.profile_id in (p_a, p_b) and s.enabled and s.share_family
  on conflict (owner_id, viewer_id) do update set status = 'on', updated_at = now() where public.loc_viewers.status = 'off';
end $$;
revoke all on function public.loc_family_link(uuid, uuid) from public, anon, authenticated;

-- Sumar a alguien a mi familia. El pastor/administrador une directo; los demás mandan un pedido que el otro acepta.
create or replace function public.loc_family_add(p_other uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_church uuid := public.loc_my_church(); me public.profiles;
begin
  if v_me is null or v_church is null then raise exception 'Tu iglesia no usa esta función'; end if;
  if p_other is null or p_other = v_me then raise exception 'Elegí a otra persona'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_other and p.church_id = v_church and p.disabled_at is null) then
    raise exception 'Esa persona no tiene cuenta en tu iglesia';
  end if;
  if p_other in (select public.loc_family_ids(v_me)) then return 'ya'; end if;
  select * into me from public.profiles where id = v_me;
  -- Si el otro ya me lo había pedido, es como aceptar.
  if exists (select 1 from public.loc_family_requests where from_id = p_other and to_id = v_me) then
    perform public.loc_family_link(v_me, p_other);
    return 'unidos';
  end if;
  if me.role::text = 'admin' or me.is_network_admin then
    perform public.loc_family_link(v_me, p_other);
    return 'unidos';
  end if;
  insert into public.loc_family_requests (from_id, to_id) values (v_me, p_other) on conflict do nothing;
  perform public.notify(p_other, 'location', public.loc_first_name(v_me) || ' te quiere sumar a su familia',
                        'Tocá para aceptar.', '/familia-ubicacion');
  return 'pedido';
end $$;
revoke all on function public.loc_family_add(uuid) from public, anon;
grant execute on function public.loc_family_add(uuid) to authenticated;

create or replace function public.loc_family_answer(p_from uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Tenés que entrar a la app'; end if;
  if not exists (select 1 from public.loc_family_requests where from_id = p_from and to_id = v_me) then return; end if;
  if p_yes then
    perform public.loc_family_link(p_from, v_me);
    perform public.notify(p_from, 'location', public.loc_first_name(v_me) || ' ya es parte de tu familia', 'Tocá para ver.', '/familia-ubicacion');
  else
    delete from public.loc_family_requests where from_id = p_from and to_id = v_me;
  end if;
end $$;
revoke all on function public.loc_family_answer(uuid, boolean) from public, anon;
grant execute on function public.loc_family_answer(uuid, boolean) to authenticated;

-- Sacar a alguien de mi familia (de las casas que compartimos) o cancelar mi pedido.
create or replace function public.loc_family_remove(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); ca uuid; cb uuid;
begin
  if v_me is null then raise exception 'Tenés que entrar a la app'; end if;
  delete from public.loc_family_requests where from_id = v_me and to_id = p_other;
  ca := public.loc_card_of(v_me); cb := public.loc_card_of(p_other);
  if ca is null or cb is null then return; end if;
  delete from public.household_members m
   where m.contact_id = cb
     and m.household_id in (select household_id from public.household_members where contact_id = ca);
  update public.loc_viewers set status = 'off', updated_at = now()
   where via = 'familia' and status = 'on' and ((owner_id = v_me and viewer_id = p_other) or (owner_id = p_other and viewer_id = v_me));
end $$;
revoke all on function public.loc_family_remove(uuid) from public, anon;
grant execute on function public.loc_family_remove(uuid) to authenticated;

-- loc_me: ahora también trae mi familia y los pedidos.
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
    'family_left', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) order by p.display_name)
      from public.profiles p where p.id in (select public.loc_family_ids(me.id))
        and p.id not in (select public.loc_active_viewers(me.id))), '[]'::jsonb),
    'family', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name,
               'photo_path', (select c.photo_path from public.contacts c where c.profile_id = p.id and not c.archived order by c.created_at limit 1))
             order by p.display_name)
      from public.profiles p where p.id in (select public.loc_family_ids(me.id))), '[]'::jsonb),
    'family_asks', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) order by r.created_at)
      from public.loc_family_requests r join public.profiles p on p.id = r.from_id
      where r.to_id = me.id and p.disabled_at is null), '[]'::jsonb),
    'family_sent', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) order by r.created_at)
      from public.loc_family_requests r join public.profiles p on p.id = r.to_id
      where r.from_id = me.id and p.disabled_at is null), '[]'::jsonb),
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

-- La pantalla nueva va con la misma función.
insert into public.feature_routes (route, feature) values
  ('/familia-historial', 'ubicacion_familia')
on conflict (route) do update set feature = excluded.feature;
