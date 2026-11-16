-- A quién ya se le escribió por haber faltado un fin de semana.
-- Al mandarle el WhatsApp sale de la lista de "Faltaron" (para todos los que la ven).
create table if not exists public.absence_messages (
  church_id uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  weekend date not null,
  sent_by uuid default auth.uid() references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  primary key (contact_id, weekend)
);
create index if not exists absence_messages_church_weekend on public.absence_messages (church_id, weekend);
alter table public.absence_messages enable row level security;

drop policy if exists absence_messages_select on public.absence_messages;
create policy absence_messages_select on public.absence_messages for select to authenticated
  using (church_id = public.current_church_id());
drop policy if exists absence_messages_insert on public.absence_messages;
create policy absence_messages_insert on public.absence_messages for insert to authenticated
  with check (church_id = public.current_church_id() and exists (select 1 from public.contacts c where c.id = contact_id and c.church_id = public.current_church_id()));
drop policy if exists absence_messages_delete on public.absence_messages;
create policy absence_messages_delete on public.absence_messages for delete to authenticated
  using (church_id = public.current_church_id());
revoke all on table public.absence_messages from anon, public;
grant select, insert, delete on table public.absence_messages to authenticated;
