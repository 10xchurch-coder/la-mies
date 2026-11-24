-- Reacciones en los chats (como WhatsApp): mantené apretado un mensaje y dejá un ❤️, un 👍, etc.
-- Sirve para todos los chats: el de la iglesia, el de la salida, los de ministerios, los mensajes privados y el hilo con el pastor.
-- Una reacción por persona por mensaje. Tocar la misma la saca. Nadie lee la tabla directo: todo pasa por las funciones.

create table if not exists public.chat_reactions (
  source text not null check (source in ('church', 'outing', 'ministry', 'dm', 'pastor')),
  message_id uuid not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (source, message_id, user_id)
);
create index if not exists chat_reactions_church_idx on public.chat_reactions (church_id);
alter table public.chat_reactions enable row level security;
revoke all on public.chat_reactions from anon, authenticated;

-- ¿Puedo ver este mensaje? (Si lo puedo ver, puedo reaccionar.)
create or replace function public.chat_reaction_can(p_source text, p_message uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and public.current_church_id() is not null and case p_source
    when 'church' then exists (select 1 from public.church_chat_messages m where m.id = p_message and m.church_id = public.current_church_id())
    when 'outing' then public.chat_can_access('outing', null)
      and exists (select 1 from public.outing_chat_messages m where m.id = p_message and m.church_id = public.current_church_id())
    when 'ministry' then exists (select 1 from public.ministry_messages m where m.id = p_message and m.church_id = public.current_church_id()
      and public.chat_can_access('ministry', m.ministry_id))
    when 'dm' then exists (select 1 from public.dm_messages m where m.id = p_message and m.church_id = public.current_church_id()
      and auth.uid() in (m.sender_id, m.recipient_id))
    when 'pastor' then exists (select 1 from public.pastor_messages m where m.id = p_message and m.church_id = public.current_church_id()
      and (m.member_id = auth.uid() or public.is_pastor()))
    else false end
$$;
revoke all on function public.chat_reaction_can(text, uuid) from public, anon;
grant execute on function public.chat_reaction_can(text, uuid) to authenticated;

-- Dejar, cambiar o sacar mi reacción. Devuelve la que quedó (null si la saqué).
create or replace function public.chat_react(p_source text, p_message uuid, p_emoji text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_emoji text := nullif(btrim(coalesce(p_emoji, '')), ''); v_old text;
begin
  if not public.chat_reaction_can(p_source, p_message) then raise exception 'No podés reaccionar a este mensaje.'; end if;
  if v_emoji is not null and char_length(v_emoji) > 16 then raise exception 'Esa reacción no se puede usar.'; end if;
  select emoji into v_old from public.chat_reactions where source = p_source and message_id = p_message and user_id = auth.uid();
  if v_emoji is null or v_emoji = v_old then
    delete from public.chat_reactions where source = p_source and message_id = p_message and user_id = auth.uid();
    return null;
  end if;
  insert into public.chat_reactions (source, message_id, user_id, church_id, emoji)
  values (p_source, p_message, auth.uid(), public.current_church_id(), v_emoji)
  on conflict (source, message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  return v_emoji;
end $$;
revoke all on function public.chat_react(text, uuid, text) from public, anon;
grant execute on function public.chat_react(text, uuid, text) to authenticated;

-- Las reacciones de varios mensajes a la vez: cuántas de cada una, si una es mía y quiénes la pusieron.
create or replace function public.chat_reactions_list(p_source text, p_messages uuid[])
returns table (message_id uuid, emoji text, total integer, mine boolean, names text[])
language sql stable security definer set search_path to 'public' as $$
  select r.message_id, r.emoji, count(*)::int, bool_or(r.user_id = auth.uid()),
         (array_agg(coalesce(p.display_name, 'Alguien') order by r.created_at))[1:20]
  from public.chat_reactions r left join public.profiles p on p.id = r.user_id
  where r.source = p_source and r.church_id = public.current_church_id()
    and r.message_id = any (coalesce(p_messages, '{}'))
    and public.chat_reaction_can(p_source, r.message_id)
  group by r.message_id, r.emoji
  order by r.message_id, min(r.created_at)
$$;
revoke all on function public.chat_reactions_list(text, uuid[]) from public, anon;
grant execute on function public.chat_reactions_list(text, uuid[]) to authenticated;

-- Si se borra el mensaje, se van sus reacciones.
create or replace function public.chat_reactions_cleanup() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.chat_reactions where source = tg_argv[0] and message_id = old.id;
  return old;
end $$;
do $$
declare t record;
begin
  for t in select * from (values ('church_chat_messages', 'church'), ('outing_chat_messages', 'outing'), ('ministry_messages', 'ministry'),
                                 ('dm_messages', 'dm'), ('pastor_messages', 'pastor')) v (tbl, src)
  loop
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || t.tbl)::regclass and tgname = 'zz_reactions_cleanup') then
      execute format('create trigger zz_reactions_cleanup after delete on public.%I for each row execute function public.chat_reactions_cleanup(%L)', t.tbl, t.src);
    end if;
  end loop;
end $$;

-- La iglesia de muestra no se puede cambiar: la tabla nueva también queda cuidada.
select public.demo_guard_install();

-- La Biblia ahora también es una pestaña de la barra de abajo: el servidor la conoce como parte de la misma función.
insert into public.feature_routes (route, feature) values
  ('/t-biblia', 'biblia')
on conflict (route) do update set feature = excluded.feature;
