\set ON_ERROR_STOP on
-- 0047: Mi camino y Preguntas.
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.faith_questions;
select id as lucia from public.profiles where id = '00000000-0000-0000-0000-000000000002' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select public.set_my_step('cristo', true);
do $$ begin
  if not (select done from public.my_path() where step = 'cristo') then raise exception 'FALLO: paso cristo'; end if;
  if (select count(*) from public.my_path()) <> 7 then raise exception 'FALLO: cantidad de pasos'; end if;
end $$;
select public.ask_question('¿Qué dice la Biblia sobre el bautismo?');
do $$ begin
  if (select count(*) from public.faith_questions) <> 1 then raise exception 'FALLO: no ve su pregunta'; end if;
  begin perform public.ask_question('hola'); raise exception 'FALLO: pregunta muy corta'; exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
-- Otro miembro común no ve la pregunta de Lucía.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if (select count(*) from public.faith_questions) <> 0 then raise exception 'FALLO: ve pregunta ajena'; end if;
  begin perform public.answer_question((select id from public.faith_questions limit 1), 'x'); exception when others then null; end;
  begin perform public.answer_question(gen_random_uuid(), 'x'); raise exception 'FALLO: miembro respondió'; exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
-- El pastor (admin) responde y la deja pública.
reset role;
select set_config('test.q', (select id::text from public.faith_questions limit 1), false);
select id as admin_id from public.profiles where church_id = (select church_id from public.profiles where id = '00000000-0000-0000-0000-000000000002') and role = 'admin' limit 1 \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.answer_question(current_setting('test.q')::uuid, 'El bautismo es obediencia.', null, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  if (select count(*) from public.public_questions()) <> 1 then raise exception 'FALLO: pregunta pública'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-000000000002' and kind = 'question') then raise exception 'FALLO: aviso de respuesta'; end if;
end $$;
reset role;
