-- 0053: los chats se parecen más a WhatsApp.
--  1. Ubicación: mandar dónde estoy (o un lugar elegido en el mapa) y ubicación en tiempo real por 15, 30 o 60 minutos.
--  2. Tildes: ✓ enviado · ✓✓ entregado · ✓✓ azul visto. Cada persona tiene, por chat, hasta cuándo le llegaron
--     los mensajes y hasta cuándo los vio. "Info" de un mensaje muestra quién lo vio.
--     Quiénes forman parte de cada chat (para decir "lo vieron todos"):
--       · iglesia: los que usaron la app en los últimos 30 días;
--       · salida: los que estuvieron en la salida en las últimas 12 horas;
--       · ministerio: los integrantes con cuenta.
--  3. Privacidad, como en WhatsApp: "Mostrar cuando estoy en línea" y "Confirmaciones de lectura".
--     Si apagás las confirmaciones, nadie ve que leíste, y vos tampoco ves quién leyó lo tuyo.
--  4. El chat de cada ministerio pasa a ser igual a los otros (fotos, documentos, ubicación, tildes).

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en los mensajes
-- ---------------------------------------------------------------------------
alter table public.church_chat_messages
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists live_until timestamptz,
  add column if not exists live_updated_at timestamptz;
alter table public.outing_chat_messages
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists live_until timestamptz,
  add column if not exists live_updated_at timestamptz;
alter table public.ministry_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size integer,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists live_until timestamptz,
  add column if not exists live_updated_at timestamptz;

alter table public.church_chat_messages drop constraint if exists church_chat_kind_check;
alter table public.church_chat_messages add constraint church_chat_kind_check check (
  kind in ('text', 'image', 'file', 'poll', 'location', 'live') and length(body) <= 1000
  and (kind in ('image', 'file', 'location', 'live') or length(btrim(body)) >= 1)
  and ((kind in ('image', 'file')) = (attachment_path is not null))
  and ((kind in ('location', 'live')) = (lat is not null and lng is not null)));
alter table public.outing_chat_messages drop constraint if exists outing_chat_kind_check;
alter table public.outing_chat_messages add constraint outing_chat_kind_check check (
  kind in ('text', 'image', 'location', 'live') and length(body) <= 1000
  and (kind in ('image', 'location', 'live') or length(btrim(body)) >= 1)
  and ((kind = 'image') = (attachment_path is not null))
  and ((kind in ('location', 'live')) = (lat is not null and lng is not null)));
alter table public.ministry_messages drop constraint if exists ministry_messages_kind_check;
alter table public.ministry_messages drop constraint if exists ministry_messages_body_check;
alter table public.ministry_messages add constraint ministry_messages_kind_check check (
  kind in ('message', 'recommendation', 'announcement', 'image', 'file', 'location', 'live') and length(body) <= 4000
  and (kind in ('image', 'file', 'location', 'live') or length(btrim(body)) >= 1)
  and ((kind in ('image', 'file')) = (attachment_path is not null))
  and ((kind in ('location', 'live')) = (lat is not null and lng is not null)));

-- En el ministerio, cualquiera del grupo manda texto, foto o documento; el anuncio, solo el líder.
-- La ubicación va por chat_send_location (más abajo).
drop policy if exists ministry_messages_insert on public.ministry_messages;
create policy ministry_messages_insert on public.ministry_messages for insert to authenticated
  with check (user_id = auth.uid() and church_id = public.current_church_id()
              and (public.is_ministry_member(ministry_id) or public.is_ministry_leader(ministry_id))
              and kind in ('message', 'recommendation', 'announcement', 'image', 'file')
              and (kind <> 'announcement' or public.is_ministry_leader(ministry_id))
              and (attachment_path is null or attachment_path like public.current_church_id()::text || '/%'));

-- ---------------------------------------------------------------------------
-- 2. Quién puede entrar a cada chat
-- ---------------------------------------------------------------------------
create or replace function public.chat_room_key(p_room text, p_ministry uuid) returns text
language sql immutable as $$
  select case when p_room = 'ministry' then 'ministry:' || p_ministry::text else p_room end
$$;

create or replace function public.chat_can_access(p_room text, p_ministry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.current_church_id() is not null and case p_room
    when 'church' then true
    when 'outing' then public.in_outing_now() or public.has_perm('evang.ver_salidas')
    when 'ministry' then p_ministry is not null
      and exists (select 1 from public.ministries m where m.id = p_ministry and m.church_id = public.current_church_id())
      and (public.is_ministry_member(p_ministry) or public.is_ministry_leader(p_ministry))
    else false end
$$;
grant execute on function public.chat_can_access(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Entregado y visto
-- ---------------------------------------------------------------------------
create table if not exists public.chat_reads (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  room_key     text not null,
  church_id    uuid not null references public.churches(id) on delete cascade,
  delivered_at timestamptz,
  read_at      timestamptz,
  primary key (user_id, room_key)
);
create index if not exists chat_reads_room_idx on public.chat_reads (church_id, room_key, delivered_at desc);
alter table public.chat_reads enable row level security;   -- solo por las funciones de abajo

create table if not exists public.chat_settings (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  show_online   boolean not null default true,
  read_receipts boolean not null default true,
  updated_at    timestamptz not null default now()
);
alter table public.chat_settings enable row level security;
grant select on public.chat_settings to authenticated;
drop policy if exists chat_settings_select on public.chat_settings;
create policy chat_settings_select on public.chat_settings for select to authenticated using (user_id = auth.uid());

create or replace function public.chat_my_privacy()
returns table (show_online boolean, read_receipts boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(s.show_online, true), coalesce(s.read_receipts, true)
  from (select 1) x left join public.chat_settings s on s.user_id = auth.uid()
$$;
grant execute on function public.chat_my_privacy() to authenticated;

create or replace function public.chat_set_privacy(p_show_online boolean, p_read_receipts boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entrá a tu cuenta.'; end if;
  insert into public.chat_settings (user_id, show_online, read_receipts, updated_at)
  values (auth.uid(), coalesce(p_show_online, true), coalesce(p_read_receipts, true), now())
  on conflict (user_id) do update set show_online = excluded.show_online, read_receipts = excluded.read_receipts, updated_at = now();
end $$;
grant execute on function public.chat_set_privacy(boolean, boolean) to authenticated;

-- Abrí el chat: todo lo que hay quedó visto (y entregado).
create or replace function public.chat_mark_read(p_room text, p_ministry uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_can_access(p_room, p_ministry) then return; end if;
  insert into public.chat_reads (user_id, room_key, church_id, delivered_at, read_at)
  values (auth.uid(), public.chat_room_key(p_room, p_ministry), public.current_church_id(), now(), now())
  on conflict (user_id, room_key) do update set delivered_at = now(), read_at = now();
end $$;
grant execute on function public.chat_mark_read(text, uuid) to authenticated;

-- La app está abierta en el teléfono: los mensajes de todos mis chats ya me llegaron.
create or replace function public.chat_mark_delivered() returns void
language plpgsql security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_uid uuid := auth.uid();
begin
  if v_uid is null or v_church is null then return; end if;
  insert into public.chat_reads (user_id, room_key, church_id, delivered_at)
  select v_uid, k, v_church, now()
  from (select 'church'::text as k
        union all select 'outing' where public.in_outing_now()
        union all select 'ministry:' || mm.ministry_id::text from public.ministry_members mm
          join public.ministries m on m.id = mm.ministry_id and m.church_id = v_church
          where mm.profile_id = v_uid) rooms
  on conflict (user_id, room_key) do update set delivered_at = now();
end $$;
grant execute on function public.chat_mark_delivered() to authenticated;

-- Los demás del chat, con hasta cuándo les llegó y hasta cuándo vieron.
-- "Visto" se oculta si esa persona apagó las confirmaciones de lectura, o si las apagué yo.
create or replace function public.chat_receipts(p_room text, p_ministry uuid default null)
returns table (user_id uuid, name text, photo_path text, delivered_at timestamptz, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_key text := public.chat_room_key(p_room, p_ministry);
  v_church uuid := public.current_church_id();
  v_me_receipts boolean := coalesce((select s.read_receipts from public.chat_settings s where s.user_id = auth.uid()), true);
begin
  if not public.chat_can_access(p_room, p_ministry) then return; end if;
  return query
  with people as (
    select r.user_id as uid from public.chat_reads r
    where r.church_id = v_church and r.room_key = v_key and p_room = 'church' and r.delivered_at > now() - interval '30 days'
    union
    select r.user_id from public.chat_reads r
    where r.church_id = v_church and r.room_key = v_key and p_room = 'outing' and r.delivered_at > now() - interval '12 hours'
    union
    select mm.profile_id from public.ministry_members mm where p_room = 'ministry' and mm.ministry_id = p_ministry
    union
    select m.leader_id from public.ministries m where p_room = 'ministry' and m.id = p_ministry and m.leader_id is not null
  )
  select p.id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = p.id limit 1),
         r.delivered_at,
         case when v_me_receipts and coalesce(s.read_receipts, true) then r.read_at end
  from people x
  join public.profiles p on p.id = x.uid and p.church_id = v_church and p.disabled_at is null
  left join public.chat_reads r on r.user_id = p.id and r.room_key = v_key
  left join public.chat_settings s on s.user_id = p.id
  where p.id <> auth.uid() and not public.is_blocked_by_me(p.id)
  order by p.display_name;
end $$;
grant execute on function public.chat_receipts(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ubicación y ubicación en tiempo real
-- ---------------------------------------------------------------------------
create or replace function public.chat_send_location(p_room text, p_ministry uuid, p_lat double precision, p_lng double precision,
                                                     p_live_minutes integer default null, p_label text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_church uuid := public.current_church_id();
  v_kind text := case when p_live_minutes is null then 'location' else 'live' end;
  v_until timestamptz;
  v_body text := left(coalesce(btrim(p_label), ''), 200);
  v_id uuid;
begin
  if not public.chat_can_access(p_room, p_ministry) then raise exception 'No podés escribir en este chat.'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Ubicación no válida.'; end if;
  if p_live_minutes is not null then
    if p_live_minutes not in (15, 30, 60) then raise exception 'Elegí 15, 30 o 60 minutos.'; end if;
    v_until := now() + make_interval(mins => p_live_minutes);
  end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.disabled_at is not null) then raise exception 'Tu cuenta está desactivada.'; end if;
  if p_room = 'church' then
    insert into public.church_chat_messages (church_id, user_id, kind, body, lat, lng, live_until, live_updated_at)
    values (v_church, auth.uid(), v_kind, v_body, p_lat, p_lng, v_until, now()) returning id into v_id;
  elsif p_room = 'outing' then
    insert into public.outing_chat_messages (church_id, user_id, kind, body, lat, lng, live_until, live_updated_at)
    values (v_church, auth.uid(), v_kind, v_body, p_lat, p_lng, v_until, now()) returning id into v_id;
  else
    insert into public.ministry_messages (church_id, ministry_id, user_id, kind, body, lat, lng, live_until, live_updated_at)
    values (v_church, p_ministry, auth.uid(), v_kind, v_body, p_lat, p_lng, v_until, now()) returning id into v_id;
  end if;
  return v_id;
end $$;
grant execute on function public.chat_send_location(text, uuid, double precision, double precision, integer, text) to authenticated;

-- El teléfono manda la nueva posición. Devuelve false si ya terminó (o no es mía): el teléfono deja de mandar.
create or replace function public.chat_live_update(p_room text, p_id uuid, p_lat double precision, p_lng double precision) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return true; end if;
  if p_room = 'church' then
    update public.church_chat_messages set lat = p_lat, lng = p_lng, live_updated_at = now()
    where id = p_id and user_id = auth.uid() and kind = 'live' and live_until > now();
  elsif p_room = 'outing' then
    update public.outing_chat_messages set lat = p_lat, lng = p_lng, live_updated_at = now()
    where id = p_id and user_id = auth.uid() and kind = 'live' and live_until > now();
  elsif p_room = 'ministry' then
    update public.ministry_messages set lat = p_lat, lng = p_lng, live_updated_at = now()
    where id = p_id and user_id = auth.uid() and kind = 'live' and live_until > now();
  else
    return false;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;
grant execute on function public.chat_live_update(text, uuid, double precision, double precision) to authenticated;

create or replace function public.chat_live_stop(p_room text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_room = 'church' then
    update public.church_chat_messages set live_until = now() where id = p_id and user_id = auth.uid() and kind = 'live' and live_until > now();
  elsif p_room = 'outing' then
    update public.outing_chat_messages set live_until = now() where id = p_id and user_id = auth.uid() and kind = 'live' and live_until > now();
  elsif p_room = 'ministry' then
    update public.ministry_messages set live_until = now() where id = p_id and user_id = auth.uid() and kind = 'live' and live_until > now();
  end if;
end $$;
grant execute on function public.chat_live_stop(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Listas de mensajes (las tres con las mismas columnas)
-- ---------------------------------------------------------------------------
drop function if exists public.church_chat_list(timestamptz, int);
create or replace function public.church_chat_list(p_before timestamptz default null, p_limit int default 60)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean,
               kind text, attachment_path text, attachment_name text, attachment_size integer,
               lat double precision, lng double precision, live_until timestamptz, live_updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = m.user_id limit 1),
         m.body, m.created_at, m.user_id = auth.uid(), m.kind, m.attachment_path, m.attachment_name, m.attachment_size,
         m.lat, m.lng, m.live_until, m.live_updated_at
  from public.church_chat_messages m
  left join public.profiles p on p.id = m.user_id
  where m.church_id = public.current_church_id() and not public.is_blocked_by_me(m.user_id)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
grant execute on function public.church_chat_list(timestamptz, int) to authenticated;

drop function if exists public.outing_chat_list(timestamptz, int);
create or replace function public.outing_chat_list(p_before timestamptz default null, p_limit int default 80)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean,
               kind text, attachment_path text, attachment_name text, attachment_size integer,
               lat double precision, lng double precision, live_until timestamptz, live_updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = m.user_id limit 1),
         m.body, m.created_at, m.user_id = auth.uid(), m.kind, m.attachment_path, m.attachment_name, m.attachment_size,
         m.lat, m.lng, m.live_until, m.live_updated_at
  from public.outing_chat_messages m
  left join public.profiles p on p.id = m.user_id
  where m.church_id = public.current_church_id() and m.created_at > now() - interval '12 hours'
    and (public.in_outing_now() or public.has_perm('evang.ver_salidas'))
    and not public.is_blocked_by_me(m.user_id)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200)
$$;
grant execute on function public.outing_chat_list(timestamptz, int) to authenticated;

-- El chat del ministerio (sin las recomendaciones, que tienen su pestaña). "message" sale como "text".
create or replace function public.ministry_chat_list(p_ministry uuid, p_before timestamptz default null, p_limit int default 60)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean,
               kind text, attachment_path text, attachment_name text, attachment_size integer,
               lat double precision, lng double precision, live_until timestamptz, live_updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = m.user_id limit 1),
         m.body, m.created_at, m.user_id = auth.uid(), case when m.kind = 'message' then 'text' else m.kind end,
         m.attachment_path, m.attachment_name, m.attachment_size, m.lat, m.lng, m.live_until, m.live_updated_at
  from public.ministry_messages m
  left join public.profiles p on p.id = m.user_id
  where m.ministry_id = p_ministry and m.church_id = public.current_church_id() and m.kind <> 'recommendation'
    and public.chat_can_access('ministry', p_ministry)
    and not public.is_blocked_by_me(m.user_id)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
grant execute on function public.ministry_chat_list(uuid, timestamptz, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. El aviso de la salida dice qué se mandó
-- ---------------------------------------------------------------------------
create or replace function public.outing_chat_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; v_name text; v_text text;
begin
  select display_name into v_name from public.profiles where id = new.user_id;
  v_text := case new.kind
    when 'image' then coalesce(nullif(left(new.body, 140), ''), '📷 Mandó una foto')
    when 'location' then '📍 Mandó una ubicación'
    when 'live' then '📍 Comparte su ubicación en tiempo real'
    else left(new.body, 140) end;
  for u in select distinct s.user_id from public.sessions s
           where s.church_id = new.church_id and s.ended_at is null and s.started_at > now() - interval '12 hours' and s.user_id <> new.user_id loop
    perform public.notify(u, 'outing_chat', 'Chat de la salida · ' || coalesce(v_name, 'Alguien'), v_text, '/salida-chat');
  end loop;
  return null;
end $$;
