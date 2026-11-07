\set ON_ERROR_STOP on
-- 0028: pases automáticos.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  begin insert into public.fin_recurring (from_fund_id, to_fund_id, amount, day) select a.id, b.id, 1, 1 from public.fin_funds a, public.fin_funds b where a.name='General' and b.name='Vehículo';
    raise exception 'FALLO: el revisor programó un pase';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.fin_recurring (from_fund_id, to_fund_id, amount, day, description)
select a.id, b.id, 640000, 5, 'Cuota del vehículo' from public.fin_funds a, public.fin_funds b where a.name = 'General' and b.name = 'Vehículo';
reset role;
do $$ declare n int; begin
  n := public.run_fin_recurring('10000000-0000-0000-0000-000000000001', '2027-03-04 09:00');
  if n <> 0 then raise exception 'FALLO: cargó antes del día'; end if;
  n := public.run_fin_recurring('10000000-0000-0000-0000-000000000001', '2027-03-05 09:00');
  if n <> 1 then raise exception 'FALLO: no cargó el día 5'; end if;
  n := public.run_fin_recurring('10000000-0000-0000-0000-000000000001', '2027-03-20 09:00');
  if n <> 0 then raise exception 'FALLO: cargó dos veces en el mes'; end if;
  if not exists (select 1 from public.fin_entries where source = 'automatico' and on_date = '2027-03-05' and amount = 640000 and kind = 'transfer') then
    raise exception 'FALLO: no quedó el pase'; end if;
end $$;
