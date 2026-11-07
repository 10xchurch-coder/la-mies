-- 0020: finanzas de la iglesia.
-- Fondos (General, Misiones, Designado, Vehículo…), cuentas donde está la plata (caja, banco),
-- categorías, movimientos (ingreso, gasto, pase entre fondos) y comprobantes (foto del recibo o de la
-- pantalla del banco) guardados en carpetas por mes: finance/<iglesia>/<AAAA-MM>/archivo.
--
-- Quién ve qué (nivel de finanzas):
--   4 Pastor (admin) o "Administrador de finanzas": todo, incluido nombrar roles de finanzas y crear fondos.
--   3 Tesorero: carga, corrige y anula cualquier movimiento; crea fondos y categorías.
--   2 Secretario de finanzas (y la secretaría de la iglesia, salvo que se le quite): carga movimientos y
--     comprobantes; corrige los suyos durante 7 días.
--   1 Revisor de cuentas: solo mira.
-- Nada se borra: un movimiento mal cargado se ANULA con motivo, y todo cambio queda en el historial.

alter table public.profiles add column if not exists finance_role text
  check (finance_role in ('manager', 'treasurer', 'secretary', 'viewer', 'none'));

create or replace function public.finance_level() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.role::text = 'admin' then 4
      when p.finance_role = 'manager' then 4
      when p.finance_role = 'treasurer' then 3
      when p.finance_role = 'secretary' then 2
      when p.finance_role = 'viewer' then 1
      when p.finance_role = 'none' then 0
      when p.role::text = 'secretary' then 2
      else 0 end
    from public.profiles p where p.id = auth.uid()), 0)
$$;
grant execute on function public.finance_level() to authenticated;

create or replace function public.set_finance_role(p_profile uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.finance_level() < 4 then raise exception 'Solo el pastor o el administrador de finanzas'; end if;
  if p_role is not null and p_role not in ('manager', 'treasurer', 'secretary', 'viewer', 'none') then raise exception 'Rol inválido'; end if;
  update public.profiles set finance_role = p_role where id = p_profile and church_id = public.current_church_id();
  if not found then raise exception 'No existe esa persona en la iglesia'; end if;
end $$;
grant execute on function public.set_finance_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
create table if not exists public.fin_funds (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  name            text not null,
  kind            text not null default 'other' check (kind in ('general', 'missions', 'designated', 'vehicle', 'other')),
  description     text,
  currency        text not null default 'ARS',
  opening_balance numeric(14, 2) not null default 0,
  opening_date    date,
  active          boolean not null default true,
  sort_order      integer not null default 100,
  created_at      timestamptz not null default now(),
  unique (church_id, name)
);

create table if not exists public.fin_accounts (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  name       text not null,
  kind       text not null default 'cash' check (kind in ('cash', 'bank', 'digital')),
  currency   text not null default 'ARS',
  active     boolean not null default true,
  sort_order integer not null default 100,
  unique (church_id, name)
);

create table if not exists public.fin_categories (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  name       text not null,
  direction  text not null check (direction in ('in', 'out')),
  active     boolean not null default true,
  sort_order integer not null default 100,
  unique (church_id, direction, name)
);

create table if not exists public.fin_entries (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  on_date       date not null,
  kind          text not null check (kind in ('income', 'expense', 'transfer')),
  fund_id       uuid not null references public.fin_funds(id),
  to_fund_id    uuid references public.fin_funds(id),      -- solo en pases entre fondos
  account_id    uuid references public.fin_accounts(id),
  category_id   uuid references public.fin_categories(id),
  amount        numeric(14, 2) not null check (amount > 0),
  currency      text not null default 'ARS',
  method        text not null default 'cash' check (method in ('cash', 'transfer', 'card', 'check', 'other')),
  description   text,
  counterpart   text,                                      -- quién dio / a quién se pagó
  contact_id    uuid references public.contacts(id) on delete set null,
  source        text,                                      -- 'planilla' si vino de la planilla vieja
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references public.profiles(id) on delete set null,
  void_reason   text,
  check ((kind = 'transfer') = (to_fund_id is not null)),
  check (to_fund_id is null or to_fund_id <> fund_id)
);
create index if not exists fin_entries_date_idx on public.fin_entries (church_id, on_date desc);
create index if not exists fin_entries_fund_idx on public.fin_entries (fund_id, on_date);

create table if not exists public.fin_attachments (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null default public.current_church_id() references public.churches(id) on delete cascade,
  entry_id    uuid references public.fin_entries(id) on delete set null,
  month       text not null check (month ~ '^\d{4}-\d{2}$'),   -- carpeta del mes
  path        text not null unique,
  kind        text not null default 'receipt' check (kind in ('receipt', 'bank_screen', 'other')),
  file_name   text,
  note        text,
  uploaded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists fin_attachments_month_idx on public.fin_attachments (church_id, month);
create index if not exists fin_attachments_entry_idx on public.fin_attachments (entry_id);

create table if not exists public.fin_audit (
  id         bigint generated always as identity primary key,
  church_id  uuid not null,
  entry_id   uuid not null,
  action     text not null,
  old_row    jsonb,
  new_row    jsonb,
  by_user    uuid,
  at         timestamptz not null default now()
);
create index if not exists fin_audit_entry_idx on public.fin_audit (entry_id, at);

-- ---------------------------------------------------------------------------
-- Reglas de los movimientos
-- ---------------------------------------------------------------------------
create or replace function public.fin_entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare f1 record; f2 record;
begin
  select * into f1 from public.fin_funds where id = new.fund_id;
  if f1.id is null or f1.church_id <> new.church_id then raise exception 'Fondo inválido'; end if;
  if new.to_fund_id is not null then
    select * into f2 from public.fin_funds where id = new.to_fund_id;
    if f2.id is null or f2.church_id <> new.church_id then raise exception 'Fondo de destino inválido'; end if;
  end if;
  if new.category_id is not null and not exists (
       select 1 from public.fin_categories c where c.id = new.category_id and c.church_id = new.church_id
         and c.direction = case new.kind when 'income' then 'in' when 'expense' then 'out' else c.direction end) then
    raise exception 'Categoría inválida para este movimiento';
  end if;
  if new.account_id is not null and not exists (select 1 from public.fin_accounts a where a.id = new.account_id and a.church_id = new.church_id) then
    raise exception 'Cuenta inválida';
  end if;
  if tg_op = 'UPDATE' then
    new.church_id := old.church_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
    if old.voided_at is not null and new.voided_at is null then raise exception 'Un movimiento anulado no se puede reactivar; cargalo de nuevo'; end if;
    if new.voided_at is not null and old.voided_at is null then
      if coalesce(trim(new.void_reason), '') = '' then raise exception 'Poné el motivo de la anulación'; end if;
      new.voided_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fin_entries_guard on public.fin_entries;
create trigger fin_entries_guard before insert or update on public.fin_entries for each row execute function public.fin_entries_guard();

create or replace function public.fin_entries_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.fin_audit (church_id, entry_id, action, old_row, new_row, by_user)
  values (new.church_id, new.id,
          case when tg_op = 'INSERT' then 'create' when new.voided_at is not null and old.voided_at is null then 'void' else 'edit' end,
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), auth.uid());
  return null;
end $$;
drop trigger if exists fin_entries_audit on public.fin_entries;
create trigger fin_entries_audit after insert or update on public.fin_entries for each row execute function public.fin_entries_audit();

-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------
alter table public.fin_funds enable row level security;
alter table public.fin_accounts enable row level security;
alter table public.fin_categories enable row level security;
alter table public.fin_entries enable row level security;
alter table public.fin_attachments enable row level security;
alter table public.fin_audit enable row level security;

do $$ declare t text; begin
  foreach t in array array['fin_funds', 'fin_accounts', 'fin_categories'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (church_id = public.current_church_id() and public.finance_level() >= 1)', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for insert to authenticated with check (church_id = public.current_church_id() and public.finance_level() >= 3)', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (church_id = public.current_church_id() and public.finance_level() >= 3) with check (church_id = public.current_church_id())', t);
  end loop;
end $$;

drop policy if exists fin_entries_read on public.fin_entries;
create policy fin_entries_read on public.fin_entries for select to authenticated
  using (church_id = public.current_church_id() and public.finance_level() >= 1);
drop policy if exists fin_entries_insert on public.fin_entries;
create policy fin_entries_insert on public.fin_entries for insert to authenticated
  with check (church_id = public.current_church_id() and public.finance_level() >= 2 and voided_at is null);
drop policy if exists fin_entries_update on public.fin_entries;
create policy fin_entries_update on public.fin_entries for update to authenticated
  using (church_id = public.current_church_id() and (public.finance_level() >= 3
         or (public.finance_level() = 2 and created_by = auth.uid() and created_at > now() - interval '7 days')))
  with check (church_id = public.current_church_id());
-- sin política de delete: no se borran, se anulan.

drop policy if exists fin_attachments_read on public.fin_attachments;
create policy fin_attachments_read on public.fin_attachments for select to authenticated
  using (church_id = public.current_church_id() and public.finance_level() >= 1);
drop policy if exists fin_attachments_insert on public.fin_attachments;
create policy fin_attachments_insert on public.fin_attachments for insert to authenticated
  with check (church_id = public.current_church_id() and public.finance_level() >= 2
              and path like 'finance/' || public.current_church_id()::text || '/' || month || '/%');
drop policy if exists fin_attachments_update on public.fin_attachments;
create policy fin_attachments_update on public.fin_attachments for update to authenticated
  using (church_id = public.current_church_id() and public.finance_level() >= 2) with check (church_id = public.current_church_id());

drop policy if exists fin_audit_read on public.fin_audit;
create policy fin_audit_read on public.fin_audit for select to authenticated
  using (church_id = public.current_church_id() and public.finance_level() >= 3);

-- Archivos: bucket privado "finance", carpeta finance/<iglesia>/<AAAA-MM>/.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit) values ('finance', 'finance', false, 15728640)
    on conflict (id) do nothing;
    drop policy if exists lamies_finance_read on storage.objects;
    create policy lamies_finance_read on storage.objects for select to authenticated
      using (bucket_id = 'finance' and (storage.foldername(name))[1] = 'finance'
             and (storage.foldername(name))[2] = public.current_church_id()::text and public.finance_level() >= 1);
    drop policy if exists lamies_finance_insert on storage.objects;
    create policy lamies_finance_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'finance' and (storage.foldername(name))[1] = 'finance'
                  and (storage.foldername(name))[2] = public.current_church_id()::text
                  and (storage.foldername(name))[3] ~ '^\d{4}-\d{2}$' and public.finance_level() >= 2);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fondos, cuentas y categorías de inicio
-- ---------------------------------------------------------------------------
create or replace function public.fin_ensure_defaults(p_church uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.fin_funds (church_id, name, kind, description, sort_order) values
    (p_church, 'General', 'general', 'Ofrendas y diezmos para los gastos de la iglesia.', 10),
    (p_church, 'Misiones', 'missions', 'Ofrendas misioneras y apoyo a misioneros.', 20),
    (p_church, 'Designado', 'designated', 'Ofrendas dadas para un fin específico (se aclara en cada movimiento).', 30),
    (p_church, 'Vehículo', 'vehicle', 'Compra, combustible y mantenimiento del vehículo.', 40)
  on conflict (church_id, name) do nothing;
  insert into public.fin_accounts (church_id, name, kind, sort_order) values
    (p_church, 'Caja (efectivo)', 'cash', 10),
    (p_church, 'Banco', 'bank', 20)
  on conflict (church_id, name) do nothing;
  insert into public.fin_categories (church_id, name, direction, sort_order) values
    (p_church, 'Diezmos', 'in', 10), (p_church, 'Ofrendas', 'in', 20), (p_church, 'Ofrenda misionera', 'in', 30),
    (p_church, 'Ofrenda designada', 'in', 40), (p_church, 'Donación', 'in', 50), (p_church, 'Apoyo del exterior', 'in', 60),
    (p_church, 'Actividades y ventas', 'in', 70), (p_church, 'Otros ingresos', 'in', 90),
    (p_church, 'Alquiler', 'out', 10), (p_church, 'Luz', 'out', 20), (p_church, 'Agua', 'out', 21), (p_church, 'Internet y teléfono', 'out', 22),
    (p_church, 'Limpieza', 'out', 30), (p_church, 'Mantenimiento del edificio', 'out', 31), (p_church, 'Equipos y sonido', 'out', 32),
    (p_church, 'Materiales y literatura', 'out', 40), (p_church, 'Desayuno y comida', 'out', 41), (p_church, 'Eventos y actividades', 'out', 42),
    (p_church, 'Combustible', 'out', 50), (p_church, 'Mantenimiento del vehículo', 'out', 51), (p_church, 'Seguro y patente', 'out', 52),
    (p_church, 'Apoyo a misioneros', 'out', 60), (p_church, 'Ayuda social', 'out', 61), (p_church, 'Comisiones bancarias', 'out', 70),
    (p_church, 'Otros gastos', 'out', 90)
  on conflict (church_id, direction, name) do nothing;
end $$;
revoke all on function public.fin_ensure_defaults(uuid) from public, anon, authenticated;
select public.fin_ensure_defaults(id) from public.churches;

-- ---------------------------------------------------------------------------
-- Saldos e informes (sin anulados)
-- ---------------------------------------------------------------------------
-- Efecto de un movimiento en un fondo: + ingreso, − gasto, − sale / + entra en un pase.
create or replace function public.fin_balances(p_from date default null, p_to date default null) returns table (
  fund_id uuid, fund text, kind text, currency text, opening numeric, income numeric, expense numeric, transfers_in numeric, transfers_out numeric, closing numeric
)
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_from date := coalesce(p_from, '1900-01-01'); v_to date := coalesce(p_to, '2999-12-31');
begin
  if public.finance_level() < 1 then raise exception 'Sin acceso a finanzas'; end if;
  return query
  select q.id, q.name, q.kind, q.currency, q.op, q.inc, q.exp, q.tin, q.tout, q.op + q.inc - q.exp + q.tin - q.tout
  from (
    select f.id, f.name, f.kind, f.currency, f.sort_order,
      f.opening_balance + coalesce((select sum(case when e.kind = 'income' and e.fund_id = f.id then e.amount
                                                    when e.kind in ('expense', 'transfer') and e.fund_id = f.id then -e.amount
                                                    when e.kind = 'transfer' and e.to_fund_id = f.id then e.amount else 0 end)
                           from public.fin_entries e where e.church_id = v_church and e.voided_at is null and e.on_date < v_from
                             and (e.fund_id = f.id or e.to_fund_id = f.id)), 0) op,
      coalesce(sum(e.amount) filter (where e.kind = 'income' and e.fund_id = f.id), 0) inc,
      coalesce(sum(e.amount) filter (where e.kind = 'expense' and e.fund_id = f.id), 0) exp,
      coalesce(sum(e.amount) filter (where e.kind = 'transfer' and e.to_fund_id = f.id), 0) tin,
      coalesce(sum(e.amount) filter (where e.kind = 'transfer' and e.fund_id = f.id), 0) tout
    from public.fin_funds f
    left join public.fin_entries e on e.church_id = v_church and e.voided_at is null and (e.fund_id = f.id or e.to_fund_id = f.id)
         and e.on_date between v_from and v_to
    where f.church_id = v_church
    group by f.id
  ) q
  order by q.sort_order, q.name;
end $$;
grant execute on function public.fin_balances(date, date) to authenticated;

-- Por mes y fondo (para el informe y el gráfico).
create or replace function public.fin_monthly(p_months integer default 12) returns table (
  month date, fund_id uuid, fund text, income numeric, expense numeric, net numeric
)
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_start date;
begin
  if public.finance_level() < 1 then raise exception 'Sin acceso a finanzas'; end if;
  v_start := (date_trunc('month', current_date) - make_interval(months => greatest(p_months, 1) - 1))::date;
  return query
  select m::date, f.id, f.name,
    coalesce(sum(e.amount) filter (where e.kind = 'income' and e.fund_id = f.id), 0),
    coalesce(sum(e.amount) filter (where e.kind = 'expense' and e.fund_id = f.id), 0),
    coalesce(sum(case when e.kind = 'income' and e.fund_id = f.id then e.amount
                      when e.kind in ('expense', 'transfer') and e.fund_id = f.id then -e.amount
                      when e.kind = 'transfer' and e.to_fund_id = f.id then e.amount end), 0)
  from generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month') m
  cross join public.fin_funds f
  left join public.fin_entries e on e.church_id = v_church and e.voided_at is null and (e.fund_id = f.id or e.to_fund_id = f.id)
       and e.on_date >= m::date and e.on_date < (m + interval '1 month')::date
  where f.church_id = v_church
  group by m, f.id
  order by m, f.sort_order;
end $$;
grant execute on function public.fin_monthly(integer) to authenticated;

-- Por categoría en un período.
create or replace function public.fin_by_category(p_from date, p_to date) returns table (
  direction text, category text, fund text, total numeric, entries int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.finance_level() < 1 then raise exception 'Sin acceso a finanzas'; end if;
  return query
  select case e.kind when 'income' then 'in' else 'out' end, coalesce(c.name, 'Sin categoría'), f.name, sum(e.amount), count(*)::int
  from public.fin_entries e
  join public.fin_funds f on f.id = e.fund_id
  left join public.fin_categories c on c.id = e.category_id
  where e.church_id = public.current_church_id() and e.voided_at is null and e.kind <> 'transfer' and e.on_date between p_from and p_to
  group by 1, 2, 3
  order by 1, 4 desc;
end $$;
grant execute on function public.fin_by_category(date, date) to authenticated;

grant select, insert, update on public.fin_funds, public.fin_accounts, public.fin_categories, public.fin_entries, public.fin_attachments to authenticated;
grant select on public.fin_audit to authenticated;
