\set ON_ERROR_STOP on
-- 0050: unirse a una iglesia exige un celular completo.
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  begin perform public.join_church('CODIGO-A', 'Sin Celular', null); raise exception 'FALLO: dejó unirse sin celular';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.join_church('CODIGO-A', 'Sin Celular', '123'); raise exception 'FALLO: aceptó un celular corto';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
