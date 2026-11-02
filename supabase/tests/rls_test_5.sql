\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
select public.request_account_deletion();
do $$ begin
  if (select deletion_requested_at from public.profiles where id = auth.uid()) is null then raise exception 'FALLO: no quedó el pedido'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  if not exists (select 1 from public.accounts_overview() where deletion_requested_at is not null) then raise exception 'FALLO: la secretaría no ve el pedido'; end if;
  if not exists (select 1 from public.notifications where kind = 'account' and user_id = auth.uid()) then raise exception 'FALLO: no llegó el aviso'; end if;
end $$;
reset role;
select 'PARTE 4: TODAS LAS PRUEBAS PASARON' as resultado;
