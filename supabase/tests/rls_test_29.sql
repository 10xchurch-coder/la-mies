\set ON_ERROR_STOP on
-- 0037: capacitación con slug; load_training actualiza sin duplicar y solo lo usa el servicio.
reset role;
do $$ declare n int; begin
  perform public.load_training('[{"slug":"respuestas-prueba","category":"Respuestas bíblicas","title":"Prueba","summary":"a","body":"uno","sort_order":30}]'::jsonb);
  perform public.load_training('[{"slug":"respuestas-prueba","category":"Respuestas bíblicas","title":"Prueba 2","summary":"b","body":"dos","sort_order":31}]'::jsonb);
  select count(*) into n from public.training_items where slug = 'respuestas-prueba';
  if n <> 1 then raise exception 'FALLO: load_training duplicó (%)', n; end if;
  if (select title from public.training_items where slug = 'respuestas-prueba') <> 'Prueba 2' then raise exception 'FALLO: no actualizó'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin perform public.load_training('[]'::jsonb); raise exception 'FALLO: un usuario pudo cargar capacitación';
  exception when insufficient_privilege then null; end;
  if not exists (select 1 from public.training_items where slug = 'respuestas-prueba') then raise exception 'FALLO: el admin no ve la capacitación general'; end if;
end $$;
reset role;
delete from public.training_items where slug = 'respuestas-prueba';
