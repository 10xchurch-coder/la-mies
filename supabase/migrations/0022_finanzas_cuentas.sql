-- 0022: pases entre cuentas (del banco a la caja y al revés) dentro del mismo fondo, saldo por cuenta,
-- y fondos/categorías que usa la planilla de la iglesia (Terreno y construcción, General en dólares).

alter table public.fin_entries add column if not exists to_account_id uuid references public.fin_accounts(id);

-- Un pase puede ser entre fondos o, dentro del mismo fondo, entre cuentas distintas.
do $$ declare c record; begin
  for c in select conname from pg_constraint
           where conrelid = 'public.fin_entries'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%to_fund_id <> fund_id%' loop
    execute format('alter table public.fin_entries drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.fin_entries drop constraint if exists fin_entries_transfer_target;
alter table public.fin_entries add constraint fin_entries_transfer_target check (
  kind <> 'transfer' or to_fund_id <> fund_id
  or (account_id is not null and to_account_id is not null and account_id <> to_account_id));

create or replace function public.fin_entries_accounts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'transfer' then new.to_account_id := null; end if;
  if new.to_account_id is not null and not exists (select 1 from public.fin_accounts a where a.id = new.to_account_id and a.church_id = new.church_id) then
    raise exception 'Cuenta de destino inválida';
  end if;
  return new;
end $$;
drop trigger if exists fin_entries_accounts_guard on public.fin_entries;
create trigger fin_entries_accounts_guard before insert or update on public.fin_entries for each row execute function public.fin_entries_accounts_guard();

-- Saldo de cada cuenta (caja, banco) por fondo.
create or replace function public.fin_account_balances(p_to date default null) returns table (account_id uuid, account text, fund_id uuid, fund text, currency text, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid := public.current_church_id(); v_to date := coalesce(p_to, '2999-12-31');
begin
  if public.finance_level() < 1 then raise exception 'Sin acceso a finanzas'; end if;
  return query
  with m as (
    select e.account_id a, e.fund_id f, case when e.kind = 'income' then e.amount else -e.amount end v
    from public.fin_entries e where e.church_id = v_church and e.voided_at is null and e.on_date <= v_to and e.account_id is not null
    union all
    select coalesce(e.to_account_id, e.account_id), e.to_fund_id, e.amount
    from public.fin_entries e where e.church_id = v_church and e.voided_at is null and e.on_date <= v_to and e.kind = 'transfer'
      and coalesce(e.to_account_id, e.account_id) is not null
  )
  select ac.id, ac.name, f.id, f.name, f.currency, sum(m.v)
  from m join public.fin_accounts ac on ac.id = m.a join public.fin_funds f on f.id = m.f
  group by ac.id, f.id
  having abs(sum(m.v)) > 0.004
  order by ac.sort_order, f.sort_order;
end $$;
grant execute on function public.fin_account_balances(date) to authenticated;

create or replace function public.fin_ensure_defaults_v2(p_church uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.fin_funds (church_id, name, kind, description, currency, sort_order) values
    (p_church, 'Terreno y construcción', 'other', 'Para terreno, construcción e infraestructura.', 'ARS', 50),
    (p_church, 'General (dólares)', 'other', 'Ofrendas en dólares del fondo General.', 'USD', 15)
  on conflict (church_id, name) do nothing;
  insert into public.fin_categories (church_id, name, direction, sort_order) values
    (p_church, 'Diezmos y ofrendas', 'in', 5),
    (p_church, 'Cuota del vehículo', 'out', 53),
    (p_church, 'Ofrendas a pastores y predicadores', 'out', 62),
    (p_church, 'Muebles y artículos', 'out', 33)
  on conflict (church_id, direction, name) do nothing;
end $$;
revoke all on function public.fin_ensure_defaults_v2(uuid) from public, anon, authenticated;
select public.fin_ensure_defaults_v2(id) from public.churches;


-- Saldos: un pase dentro del mismo fondo (banco ↔ caja) resta y suma en el mismo fondo (queda en cero).
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
      f.opening_balance + coalesce((select sum(((case when e.fund_id = f.id then (case when e.kind = 'income' then e.amount else -e.amount end) else 0 end) + (case when e.kind = 'transfer' and e.to_fund_id = f.id then e.amount else 0 end)))
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
    coalesce(sum(((case when e.fund_id = f.id then (case when e.kind = 'income' then e.amount else -e.amount end) else 0 end) + (case when e.kind = 'transfer' and e.to_fund_id = f.id then e.amount else 0 end))), 0)
  from generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month') m
  cross join public.fin_funds f
  left join public.fin_entries e on e.church_id = v_church and e.voided_at is null and (e.fund_id = f.id or e.to_fund_id = f.id)
       and e.on_date >= m::date and e.on_date < (m + interval '1 month')::date
  where f.church_id = v_church
  group by m, f.id
  order by m, f.sort_order;
end $$;

create or replace function public.fin_period(p_church uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'income', coalesce(sum(amount) filter (where kind = 'income'), 0),
    'expense', coalesce(sum(amount) filter (where kind = 'expense'), 0),
    'entries', count(*),
    'missing_receipts', count(*) filter (where kind <> 'transfer' and method <> 'cash'
                                           and not exists (select 1 from public.fin_attachments a where a.entry_id = e.id)),
    'funds', coalesce((
      select jsonb_agg(jsonb_build_object('name', f.name, 'balance',
        f.opening_balance + coalesce((select sum(((case when x.fund_id = f.id then (case when x.kind = 'income' then x.amount else -x.amount end) else 0 end) + (case when x.kind = 'transfer' and x.to_fund_id = f.id then x.amount else 0 end)))
                                     from public.fin_entries x where x.church_id = p_church and x.voided_at is null and x.on_date <= p_to
                                       and (x.fund_id = f.id or x.to_fund_id = f.id)), 0)) order by f.sort_order)
      from public.fin_funds f where f.church_id = p_church and f.active), '[]'::jsonb)
  )
  from public.fin_entries e
  where e.church_id = p_church and e.voided_at is null and e.on_date between p_from and p_to
$$;
revoke all on function public.fin_period(uuid, date, date) from public, anon, authenticated;
