-- 0023: denunciar contenido y bloquear personas (lo pide Apple para apps donde los usuarios publican).
-- - Cualquiera denuncia un comentario, pedido de oración o mensaje de ministerio: les llega aviso al pastor
--   y a la secretaría, que lo borran o lo dejan.
-- - Cualquiera bloquea a otra persona: deja de ver lo que publica (comentarios, oración, mensajes).
-- - Normas de la comunidad: se aceptan al crear la cuenta.

create table if not exists public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  kind        text not null check (kind in ('comment', 'prayer', 'ministry_message', 'announcement', 'profile')),
  target_id   uuid not null,
  author_id   uuid references public.profiles(id) on delete set null,
  excerpt     text,
  reason      text,
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status      text not null default 'open' check (status in ('open', 'removed', 'kept')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists content_reports_open_idx on public.content_reports (church_id, status, created_at desc);

create table if not exists public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;
grant select, insert, update on public.content_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists content_reports_insert on public.content_reports;
create policy content_reports_insert on public.content_reports for insert to authenticated
  with check (church_id = public.current_church_id() and reporter_id = auth.uid() and status = 'open');
drop policy if exists content_reports_read on public.content_reports;
create policy content_reports_read on public.content_reports for select to authenticated
  using (church_id = public.current_church_id() and (public.is_staff() or reporter_id = auth.uid()));
drop policy if exists content_reports_update on public.content_reports;
create policy content_reports_update on public.content_reports for update to authenticated
  using (church_id = public.current_church_id() and public.is_staff()) with check (church_id = public.current_church_id());

drop policy if exists user_blocks_own on public.user_blocks;
create policy user_blocks_own on public.user_blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create or replace function public.is_blocked_by_me(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = p_user)
$$;
grant execute on function public.is_blocked_by_me(uuid) to authenticated;

-- Aviso al pastor y la secretaría.
create or replace function public.content_report_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_to uuid;
begin
  for v_to in select public.staff_ids(new.church_id) loop
    if v_to <> new.reporter_id then
      perform public.notify(v_to, 'report', 'Contenido denunciado',
        coalesce(left(new.excerpt, 120), 'Alguien denunció una publicación') || coalesce(' · Motivo: ' || new.reason, ''), '/admin/denuncias');
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists content_report_notify on public.content_reports;
create trigger content_report_notify after insert on public.content_reports for each row execute function public.content_report_notify();

-- Resolver: borrar el contenido o dejarlo.
create or replace function public.resolve_report(p_report uuid, p_remove boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_staff() then raise exception 'Solo el pastor o la secretaría'; end if;
  select * into r from public.content_reports where id = p_report and church_id = public.current_church_id();
  if r.id is null then raise exception 'No existe la denuncia'; end if;
  if p_remove then
    if r.kind = 'comment' then delete from public.daily_comments where id = r.target_id and church_id = r.church_id;
    elsif r.kind = 'prayer' then delete from public.prayer_requests where id = r.target_id and church_id = r.church_id;
    elsif r.kind = 'ministry_message' then delete from public.ministry_messages where id = r.target_id and church_id = r.church_id;
    elsif r.kind = 'announcement' then delete from public.announcements where id = r.target_id and church_id = r.church_id;
    end if;
  end if;
  update public.content_reports set status = case when p_remove then 'removed' else 'kept' end, resolved_by = auth.uid(), resolved_at = now()
  where church_id = r.church_id and kind = r.kind and target_id = r.target_id and status = 'open';
end $$;
grant execute on function public.resolve_report(uuid, boolean) to authenticated;

-- No mostrar lo que publica alguien que bloqueé.
create or replace function public.daily_comments_list(p_date date)
returns table (id uuid, user_id uuid, name text, photo_path text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, coalesce(p.display_name, 'Alguien'),
         (select k.photo_path from public.contacts k where k.profile_id = c.user_id limit 1),
         c.body, c.created_at, c.user_id = auth.uid()
  from public.daily_comments c
  left join public.profiles p on p.id = c.user_id
  where c.church_id = public.current_church_id() and c.on_date = p_date and not public.is_blocked_by_me(c.user_id)
  order by c.created_at
  limit 500
$$;
grant execute on function public.daily_comments_list(date) to authenticated;

drop policy if exists ministry_messages_select on public.ministry_messages;
create policy ministry_messages_select on public.ministry_messages for select to authenticated
  using (church_id = public.current_church_id() and (public.is_ministry_member(ministry_id) or public.is_ministry_leader(ministry_id))
         and not public.is_blocked_by_me(user_id));

-- Oración: además, el pedido anónimo ya no deja ver quién lo pidió (antes se mandaba el id).
create or replace function public.prayer_list()
returns table (id uuid, user_id uuid, author text, body text, visibility text, people uuid[], anonymous boolean,
               answered_at timestamptz, answer_note text, created_at timestamptz, prayed integer, i_prayed boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         case when p.anonymous and p.user_id <> auth.uid() then null else p.user_id end,
         case when p.anonymous and p.user_id <> auth.uid() then null else pr.display_name end,
         p.body, p.visibility, case when p.user_id = auth.uid() then p.people else '{}'::uuid[] end, p.anonymous,
         p.answered_at, p.answer_note, p.created_at,
         (select count(*)::int from public.prayer_prayed x where x.request_id = p.id),
         exists (select 1 from public.prayer_prayed x where x.request_id = p.id and x.user_id = auth.uid()),
         p.user_id = auth.uid()
  from public.prayer_requests p join public.profiles pr on pr.id = p.user_id
  where public.can_see_prayer(p.id) and (p.answered_at is null or p.answered_at > now() - interval '30 days')
    and not public.is_blocked_by_me(p.user_id)
  order by p.created_at desc limit 200
$$;
grant execute on function public.prayer_list() to authenticated;

-- Aceptación de las normas de la comunidad.
alter table public.profiles add column if not exists rules_accepted_at timestamptz;
create or replace function public.accept_community_rules() returns void
language sql security definer set search_path = public as $$
  update public.profiles set rules_accepted_at = coalesce(rules_accepted_at, now()) where id = auth.uid()
$$;
grant execute on function public.accept_community_rules() to authenticated;
