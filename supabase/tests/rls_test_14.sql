\set ON_ERROR_STOP on
-- 0020: finanzas. Solo pastor, secretaría o roles de finanzas; nada se borra, se anula; saldos por fondo.
set role authenticated;
-- un miembro no ve nada ni puede cargar
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  if public.finance_level() <> 0 then raise exception 'FALLO: un miembro tiene acceso a finanzas'; end if;
  if exists (select 1 from public.fin_funds) then raise exception 'FALLO: un miembro ve los fondos'; end if;
  begin perform * from public.fin_balances(null, null); raise exception 'FALLO: un miembro vio saldos';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.set_finance_role(auth.uid(), 'manager'); raise exception 'FALLO: un miembro se dio rol de finanzas';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

-- el pastor: ve los 4 fondos de inicio, nombra revisor a c3 y tesorero a c2
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select count(*) from public.fin_funds where name in ('General', 'Misiones', 'Designado', 'Vehículo')) <> 4 then raise exception 'FALLO: faltan los fondos de inicio'; end if;
  perform public.set_finance_role('00000000-0000-0000-0000-0000000000c3', 'viewer');
  perform public.set_finance_role('00000000-0000-0000-0000-0000000000c2', 'treasurer');
end $$;

-- la secretaría carga: ingreso 10000 General, gasto 2500 General, pase 1000 General → Misiones
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ declare g uuid; m uuid; ci uuid; co uuid; e uuid; begin
  if public.finance_level() <> 2 then raise exception 'FALLO: la secretaría debería tener nivel 2'; end if;
  select id into g from public.fin_funds where name = 'General';
  select id into m from public.fin_funds where name = 'Misiones';
  select id into ci from public.fin_categories where name = 'Ofrendas';
  select id into co from public.fin_categories where name = 'Luz';
  insert into public.fin_entries (on_date, kind, fund_id, category_id, amount, method) values (current_date, 'income', g, ci, 10000, 'transfer') returning id into e;
  insert into public.fin_attachments (entry_id, month, path, kind) values (e, to_char(current_date, 'YYYY-MM'),
    'finance/10000000-0000-0000-0000-000000000001/' || to_char(current_date, 'YYYY-MM') || '/banco.jpg', 'bank_screen');
  insert into public.fin_entries (on_date, kind, fund_id, category_id, amount) values (current_date, 'expense', g, co, 2500);
  insert into public.fin_entries (on_date, kind, fund_id, to_fund_id, amount) values (current_date, 'transfer', g, m, 1000);
  -- categoría de gasto en un ingreso: no
  begin insert into public.fin_entries (on_date, kind, fund_id, category_id, amount) values (current_date, 'income', g, co, 5); raise exception 'FALLO: aceptó categoría de gasto en un ingreso';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- comprobante fuera de la carpeta del mes: no
  begin insert into public.fin_attachments (month, path) values ('2026-01', 'finance/10000000-0000-0000-0000-000000000001/2026-02/x.jpg'); raise exception 'FALLO: aceptó comprobante en otra carpeta';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- borrar: no se puede (no hay política), no borra nada
  begin delete from public.fin_entries; raise exception 'FALLO: se pudo borrar un movimiento';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (select count(*) from public.fin_entries) <> 3 then raise exception 'FALLO: faltan movimientos'; end if;
end $$;

-- el revisor ve saldos pero no carga
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
do $$ declare b record; begin
  select * into b from public.fin_balances(null, null) where fund = 'General';
  if b.closing <> 6500 then raise exception 'FALLO: saldo General %, esperaba 6500', b.closing; end if;
  select * into b from public.fin_balances(null, null) where fund = 'Misiones';
  if b.closing <> 1000 then raise exception 'FALLO: saldo Misiones %, esperaba 1000', b.closing; end if;
  begin insert into public.fin_entries (on_date, kind, fund_id, amount) select current_date, 'income', id, 1 from public.fin_funds limit 1; raise exception 'FALLO: el revisor cargó un movimiento';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

-- el tesorero anula el gasto (con motivo) y el saldo vuelve
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ declare b record; begin
  begin update public.fin_entries set voided_at = now() where kind = 'expense'; raise exception 'FALLO: anuló sin motivo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  update public.fin_entries set voided_at = now(), void_reason = 'Cargado dos veces' where kind = 'expense';
  select * into b from public.fin_balances(null, null) where fund = 'General';
  if b.closing <> 9000 then raise exception 'FALLO: saldo después de anular %, esperaba 9000', b.closing; end if;
  if (select count(*) from public.fin_audit where action = 'void') <> 1 then raise exception 'FALLO: la anulación no quedó en el historial'; end if;
  if (select count(*) from public.fin_monthly(3)) < 4 then raise exception 'FALLO: informe mensual vacío'; end if;
end $$;
reset role;
