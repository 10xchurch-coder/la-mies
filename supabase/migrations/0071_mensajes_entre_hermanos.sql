-- 0071: mensajes privados entre dos hermanos de la misma iglesia (texto, fotos, documentos y voz),
--       con bloquear y denunciar. Las tablas no se leen ni se escriben directo: todo pasa por funciones,
--       así solo las dos personas de la conversación ven los mensajes.

create table if not exists public.dm_messages (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.churches(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  kind            text not null default 'text' check (kind in ('text', 'image', 'file')),
  body            text not null default '' check (length(body) <= 4000),
  attachment_path text,
  attachment_name text,
  attachment_size integer,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check ((kind = 'text') = (attachment_path is null)),
  check (kind <> 'text' or length(btrim(body)) >= 1)
);
create index if not exists dm_messages_pair_idx on public.dm_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
create index if not exists dm_messages_inbox_idx on public.dm_messages (recipient_id, read_at) where read_at is null;
create index if not exists dm_messages_path_idx on public.dm_messages (attachment_path) where attachment_path is not null;
alter table public.dm_messages enable row level security;
revoke all on table public.dm_messages from anon, authenticated, public;

create table if not exists public.dm_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.dm_blocks enable row level security;
revoke all on table public.dm_blocks from anon, authenticated, public;

create table if not exists public.dm_reports (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  message_id  uuid references public.dm_messages(id) on delete set null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '',       -- copia de lo denunciado, por si después se borra
  reason      text check (length(reason) <= 500),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.dm_reports enable row level security;
revoke all on table public.dm_reports from anon, authenticated, public;

-- ¿Alguno de los dos bloqueó al otro?
create or replace function public.dm_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.dm_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;
revoke all on function public.dm_blocked_between(uuid, uuid) from public, anon, authenticated;

-- Mandar un mensaje.
create or replace function public.dm_send(p_to uuid, p_body text, p_kind text default 'text', p_path text default null, p_name text default null, p_size integer default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid(); v_church uuid; v_name text; v_id uuid; v_kind text := coalesce(p_kind, 'text'); v_body text := btrim(coalesce(p_body, ''));
begin
  if v_me is null then raise exception 'Iniciá sesión'; end if;
  select church_id, display_name into v_church, v_name from public.profiles where id = v_me and disabled_at is null;
  if v_church is null then raise exception 'Primero entrá a tu iglesia'; end if;
  if p_to is null or p_to = v_me then raise exception 'Elegí a quién le escribís'; end if;
  if not exists (select 1 from public.profiles where id = p_to and church_id = v_church and disabled_at is null) then
    raise exception 'Esa persona no es de tu iglesia';
  end if;
  if public.dm_blocked_between(v_me, p_to) then raise exception 'No se le puede escribir a esta persona'; end if;
  if v_kind not in ('text', 'image', 'file') then raise exception 'Tipo de mensaje inválido'; end if;
  if v_kind = 'text' and length(v_body) < 1 then raise exception 'Escribí el mensaje'; end if;
  if length(v_body) > 4000 then raise exception 'El mensaje es muy largo'; end if;
  if v_kind <> 'text' then
    if p_path is null or split_part(p_path, '/', 1) <> v_church::text then raise exception 'Archivo inválido'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'chat' and o.name = p_path and coalesce(o.owner_id, '') = v_me::text) then
      raise exception 'Archivo inválido';
    end if;
  end if;
  if (select count(*) from public.dm_messages where sender_id = v_me and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Mandaste muchos mensajes seguidos. Probá de nuevo en un rato.';
  end if;

  insert into public.dm_messages (church_id, sender_id, recipient_id, kind, body, attachment_path, attachment_name, attachment_size)
  values (v_church, v_me, p_to, v_kind, v_body, case when v_kind = 'text' then null else p_path end,
          case when v_kind = 'text' then null else left(p_name, 200) end, case when v_kind = 'text' then null else p_size end)
  returning id into v_id;

  -- El aviso no lleva el texto: el mensaje es privado y el teléfono bloqueado lo puede mostrar.
  -- Un solo aviso por conversación mientras haya otros sin leer, para no llenar el teléfono.
  if (select count(*) from public.dm_messages where sender_id = v_me and recipient_id = p_to and read_at is null) = 1 then
    perform public.notify(p_to, 'dm', 'Mensaje privado', coalesce(v_name, 'Un hermano') || ' te escribió', '/mensajes/' || v_me::text);
  end if;
  return v_id;
end $$;

-- La conversación con una persona (los últimos 200, del más viejo al más nuevo).
create or replace function public.dm_thread(p_with uuid, p_before timestamptz default null)
returns table (id uuid, body text, kind text, attachment_path text, attachment_name text, attachment_size integer, created_at timestamptz, mine boolean, read_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select * from (
    select m.id, m.body, m.kind, m.attachment_path, m.attachment_name, m.attachment_size, m.created_at, m.sender_id = auth.uid(), m.read_at
    from public.dm_messages m
    where m.church_id = public.current_church_id()
      and ((m.sender_id = auth.uid() and m.recipient_id = p_with) or (m.sender_id = p_with and m.recipient_id = auth.uid()))
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc limit 200) t
  order by t.created_at asc
$$;

-- Mis conversaciones: una fila por persona, la más reciente arriba.
create or replace function public.dm_inbox()
returns table (other_id uuid, name text, photo_path text, last_body text, last_kind text, last_name text, last_at timestamptz, last_mine boolean, unread integer)
language sql stable security definer set search_path to 'public' as $$
  with mine as (
    select m.*, case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other
    from public.dm_messages m
    where m.church_id = public.current_church_id() and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())),
  t as (
    select other, max(created_at) as last_at, (count(*) filter (where recipient_id = auth.uid() and read_at is null))::int as unread
    from mine group by other)
  select t.other, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = t.other limit 1),
         lm.body, lm.kind, lm.attachment_name, t.last_at, lm.sender_id = auth.uid(), t.unread
  from t
  left join public.profiles p on p.id = t.other
  left join lateral (select x.body, x.kind, x.attachment_name, x.sender_id from mine x where x.other = t.other order by x.created_at desc limit 1) lm on true
  order by t.last_at desc
$$;

create or replace function public.dm_read(p_with uuid) returns void
language sql security definer set search_path to 'public' as $$
  update public.dm_messages set read_at = now() where recipient_id = auth.uid() and sender_id = p_with and read_at is null
$$;

create or replace function public.dm_unread() returns integer
language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from public.dm_messages m
  where m.recipient_id = auth.uid() and m.read_at is null and m.church_id = public.current_church_id()
$$;

-- A quién le puedo escribir: los hermanos de mi iglesia que tienen cuenta.
create or replace function public.dm_people()
returns table (id uuid, name text, photo_path text, title text, i_blocked boolean)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.display_name, (select k.photo_path from public.contacts k where k.profile_id = p.id limit 1), p.title,
         exists (select 1 from public.dm_blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id)
  from public.profiles p
  where p.church_id = public.current_church_id() and p.disabled_at is null and p.id <> auth.uid()
    and public.current_church_id() is not null
  order by p.display_name
$$;

-- Borrar un mensaje mío (para los dos).
create or replace function public.dm_delete(p_id uuid) returns void
language sql security definer set search_path to 'public' as $$
  delete from public.dm_messages where id = p_id and sender_id = auth.uid()
$$;

-- Bloquear o desbloquear a alguien: ninguno de los dos le puede escribir al otro.
create or replace function public.dm_block(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or p_user is null or p_user = auth.uid() then raise exception 'Persona inválida'; end if;
  if p_on then
    insert into public.dm_blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  else
    delete from public.dm_blocks where blocker_id = auth.uid() and blocked_id = p_user;
  end if;
end $$;

-- Denunciar un mensaje que me mandaron: le llega al pastor con una copia del mensaje.
create or replace function public.dm_report(p_message uuid, p_reason text default null) returns void
language plpgsql security definer set search_path to 'public' as $$
declare m public.dm_messages; v_name text; r record;
begin
  select * into m from public.dm_messages where id = p_message and recipient_id = auth.uid();
  if m.id is null then raise exception 'Ese mensaje no se puede denunciar'; end if;
  if exists (select 1 from public.dm_reports where message_id = m.id and reporter_id = auth.uid()) then return; end if;
  insert into public.dm_reports (church_id, message_id, reporter_id, sender_id, body, reason)
  values (m.church_id, m.id, auth.uid(), m.sender_id,
          case m.kind when 'text' then m.body else '[' || case m.kind when 'image' then 'Foto' else coalesce(m.attachment_name, 'Archivo') end || '] ' || m.body end,
          nullif(btrim(left(coalesce(p_reason, ''), 500)), ''));
  select display_name into v_name from public.profiles where id = auth.uid();
  for r in select id from public.profiles where church_id = m.church_id and role::text = 'admin' and disabled_at is null loop
    perform public.notify(r.id, 'dm_report', 'Mensaje denunciado', coalesce(v_name, 'Un hermano') || ' denunció un mensaje privado', '/mensajes/denuncias');
  end loop;
end $$;

-- Las denuncias, para el pastor.
create or replace function public.dm_reports_list()
returns table (id uuid, reporter text, sender text, sender_id uuid, body text, reason text, created_at timestamptz, resolved_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select r.id, coalesce(pr.display_name, 'Alguien'), coalesce(ps.display_name, 'Alguien'), r.sender_id, r.body, r.reason, r.created_at, r.resolved_at
  from public.dm_reports r
  left join public.profiles pr on pr.id = r.reporter_id
  left join public.profiles ps on ps.id = r.sender_id
  where r.church_id = public.current_church_id() and public.is_pastor()
  order by r.resolved_at is not null, r.created_at desc
  limit 200
$$;

create or replace function public.dm_report_resolve(p_id uuid) returns void
language sql security definer set search_path to 'public' as $$
  update public.dm_reports set resolved_at = now() where id = p_id and church_id = public.current_church_id() and public.is_pastor()
$$;

revoke all on function public.dm_send(uuid, text, text, text, text, integer), public.dm_thread(uuid, timestamptz), public.dm_inbox(), public.dm_read(uuid),
  public.dm_unread(), public.dm_people(), public.dm_delete(uuid), public.dm_block(uuid, boolean), public.dm_report(uuid, text),
  public.dm_reports_list(), public.dm_report_resolve(uuid) from public, anon;
grant execute on function public.dm_send(uuid, text, text, text, text, integer), public.dm_thread(uuid, timestamptz), public.dm_inbox(), public.dm_read(uuid),
  public.dm_unread(), public.dm_people(), public.dm_delete(uuid), public.dm_block(uuid, boolean), public.dm_report(uuid, text),
  public.dm_reports_list(), public.dm_report_resolve(uuid) to authenticated;

-- Las fotos, documentos y audios de un mensaje privado los abren solo las dos personas de la conversación.
create or replace function public.dm_can_read(p_path text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.dm_messages m where m.attachment_path = p_path and auth.uid() in (m.sender_id, m.recipient_id))
$$;
revoke all on function public.dm_can_read(text) from public, anon;
grant execute on function public.dm_can_read(text) to authenticated;

alter policy lamies_chat_read on storage.objects using (
  bucket_id = 'chat' and (storage.foldername(name))[1] = (public.current_church_id())::text
  and (coalesce(owner_id, '') = (auth.uid())::text
    or exists (select 1 from public.church_chat_messages m where m.attachment_path = objects.name)
    or exists (select 1 from public.outing_chat_messages m where m.attachment_path = objects.name)
    or exists (select 1 from public.ministry_messages m where m.attachment_path = objects.name)
    or public.dm_can_read(objects.name))
);
