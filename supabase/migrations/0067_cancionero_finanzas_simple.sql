-- 0067: cancionero de la iglesia; finanzas más simple (quién dio: opcional por iglesia) y saldo del banco leído de la foto.

-- 1. Cancionero: letra de cada canción y su enlace de Spotify / YouTube.
create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 160),
  author      text check (length(author) <= 160),
  lyrics      text not null default '' check (length(lyrics) <= 20000),
  spotify_url text check (spotify_url is null or (length(spotify_url) <= 500 and spotify_url ~* '^https?://')),
  youtube_url text check (youtube_url is null or (length(youtube_url) <= 500 and youtube_url ~* '^https?://')),
  song_key    text check (length(song_key) <= 20),          -- el tono (para los músicos)
  position    integer not null default 0,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists songs_church_idx on public.songs (church_id, position, title);
alter table public.songs enable row level security;
revoke all on table public.songs from anon, public;
grant select, insert, update, delete on table public.songs to authenticated;
drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs for select to authenticated using (church_id = public.current_church_id());
drop policy if exists songs_write on public.songs;
create policy songs_write on public.songs for all to authenticated
  using (church_id = public.current_church_id() and public.has_perm('com.anuncios'))
  with check (church_id = public.current_church_id() and public.has_perm('com.anuncios'));

-- 2. Quién dio cada ingreso: apagado por defecto (la mayoría no lo lleva).
alter table public.churches add column if not exists fin_track_donors boolean not null default false;
create or replace function public.set_fin_track_donors(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('admin.permisos') and public.finance_level() < 3 then raise exception 'Solo el pastor o el tesorero'; end if;
  update public.churches set fin_track_donors = coalesce(p_on, false) where id = public.current_church_id();
end $$;
revoke all on function public.set_fin_track_donors(boolean) from public, anon;
grant execute on function public.set_fin_track_donors(boolean) to authenticated;

-- 3. Saldo del banco: cada vez que se carga un ingreso con la foto del banco, se guarda el saldo que se leyó.
--    La próxima vez: lo que entró = saldo nuevo − (saldo anterior + lo que ya se cargó de esa cuenta desde entonces).
create table if not exists public.fin_bank_snapshots (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  account_id uuid not null references public.fin_accounts(id) on delete cascade,
  balance    numeric(14,2) not null,
  entry_id   uuid references public.fin_entries(id) on delete set null,
  photo_path text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fin_bank_snapshots_idx on public.fin_bank_snapshots (account_id, created_at desc);
alter table public.fin_bank_snapshots enable row level security;
revoke all on table public.fin_bank_snapshots from anon, authenticated, public;

-- Lo que se movió en una cuenta (según lo cargado en la app) desde un momento.
create or replace function public.fin_account_net_since(p_account uuid, p_since timestamptz) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case
    when e.kind = 'income'  and e.account_id = p_account then e.amount
    when e.kind = 'expense' and e.account_id = p_account then -e.amount
    when e.kind = 'transfer' and e.to_account_id = p_account and e.account_id is distinct from p_account then e.amount
    when e.kind = 'transfer' and e.account_id = p_account and e.to_account_id is not null and e.to_account_id <> p_account then -e.amount
    else 0 end), 0)
  from public.fin_entries e
  where e.church_id = public.current_church_id() and e.voided_at is null and e.created_at > p_since
$$;
revoke all on function public.fin_account_net_since(uuid, timestamptz) from public, anon, authenticated;

-- Con el saldo que se ve en la foto, cuánto entró.
create or replace function public.fin_bank_income_guess(p_account uuid, p_balance numeric)
returns table (prev_balance numeric, prev_at timestamptz, recorded_since numeric, suggested numeric)
language plpgsql stable security definer set search_path = public as $$
declare s public.fin_bank_snapshots; v_net numeric;
begin
  if public.finance_level() < 2 then raise exception 'No tenés permiso de finanzas'; end if;
  select * into s from public.fin_bank_snapshots
    where account_id = p_account and church_id = public.current_church_id() order by created_at desc limit 1;
  if not found then return; end if;
  v_net := public.fin_account_net_since(p_account, s.created_at);
  return query select s.balance, s.created_at, v_net, round(p_balance - (s.balance + v_net), 2);
end $$;

create or replace function public.fin_save_bank_snapshot(p_account uuid, p_balance numeric, p_entry uuid default null, p_photo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.finance_level() < 2 then raise exception 'No tenés permiso de finanzas'; end if;
  if not exists (select 1 from public.fin_accounts where id = p_account and church_id = public.current_church_id()) then raise exception 'Cuenta inválida'; end if;
  if p_balance is null or abs(p_balance) > 1e12 then raise exception 'Saldo inválido'; end if;
  insert into public.fin_bank_snapshots (account_id, balance, entry_id, photo_path) values (p_account, p_balance, p_entry, p_photo);
end $$;

revoke all on function public.fin_bank_income_guess(uuid, numeric), public.fin_save_bank_snapshot(uuid, numeric, uuid, text) from public, anon;
grant execute on function public.fin_bank_income_guess(uuid, numeric), public.fin_save_bank_snapshot(uuid, numeric, uuid, text) to authenticated;
