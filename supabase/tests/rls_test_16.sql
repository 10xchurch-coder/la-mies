\set ON_ERROR_STOP on
-- 0022: pase del banco a la caja dentro del mismo fondo; saldos por cuenta.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare g uuid; caja uuid; banco uuid; b record; n numeric; begin
  select id into g from public.fin_funds where name = 'General';
  select id into caja from public.fin_accounts where name = 'Caja (efectivo)';
  select id into banco from public.fin_accounts where name = 'Banco';
  if not exists (select 1 from public.fin_funds where name = 'Terreno y construcción') then raise exception 'FALLO: falta el fondo Terreno'; end if;
  insert into public.fin_entries (on_date, kind, fund_id, account_id, amount, method) values (current_date, 'income', g, banco, 3000, 'transfer');
  insert into public.fin_entries (on_date, kind, fund_id, to_fund_id, account_id, to_account_id, amount) values (current_date, 'transfer', g, g, banco, caja, 1000);
  begin insert into public.fin_entries (on_date, kind, fund_id, to_fund_id, account_id, to_account_id, amount) values (current_date, 'transfer', g, g, caja, caja, 1); raise exception 'FALLO: pase a la misma cuenta y fondo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  select sum(balance) into n from public.fin_account_balances(null) where fund = 'General' and account = 'Banco';
  if n <> 2000 then raise exception 'FALLO: banco General %, esperaba 2000', n; end if;
  select * into b from public.fin_balances(null, null) where fund = 'General';
  if b.closing <> 12000 then raise exception 'FALLO: el pase dentro del fondo cambió el saldo (%)', b.closing; end if;
end $$;
reset role;
-- el saldo inicial del período y el mensual también cuentan bien el pase dentro del fondo
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare b record; m numeric; begin
  select * into b from public.fin_balances(current_date + 1, current_date + 2) where fund = 'General';
  if b.opening <> 12000 then raise exception 'FALLO: saldo inicial %, esperaba 12000', b.opening; end if;
  select sum(net) into m from public.fin_monthly(1) where fund = 'General';
  if m <> 12000 then raise exception 'FALLO: neto del mes %, esperaba 12000', m; end if;
end $$;
reset role;
