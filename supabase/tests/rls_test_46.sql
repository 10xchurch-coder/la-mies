\set ON_ERROR_STOP on
-- 0054: alabanza. c1 = secretaría, c2 = miembro (va a ser músico), c5 = miembro sin nada que ver.
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.worship_plans; delete from public.songs;
do $$
declare m uuid;
begin
  insert into public.ministries (church_id, name, is_music)
  select church_id, 'Música prueba', true from public.profiles where id = '00000000-0000-0000-0000-0000000000c1' returning id into m;
  insert into public.ministry_members (ministry_id, profile_id) values (m, '00000000-0000-0000-0000-0000000000c2');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$
declare s uuid; p uuid; t uuid;
begin
  insert into public.songs (title, song_key, bpm) values ('Cuán grande es Él', 'Sol', 80) returning id into s;
  insert into public.worship_plans (on_date, title) values (current_date, 'Culto de prueba') returning id into p;
  insert into public.worship_items (plan_id, sort, kind, title, song_id, song_key) values (p, 10, 'song', 'Cuán grande es Él', s, 'La');
  insert into public.worship_team (plan_id, profile_id, role) values (p, '00000000-0000-0000-0000-0000000000c2', 'Guitarra') returning id into t;
  perform set_config('test.plan', p::text, false); perform set_config('test.team', t::text, false); perform set_config('test.song', s::text, false);
end $$;
-- El músico: ve las canciones, pero no el plan sin publicar, y no puede contestar todavía.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if (select count(*) from public.songs) <> 1 then raise exception 'FALLO: el músico no ve las canciones'; end if;
  if exists (select 1 from public.worship_plans) then raise exception 'FALLO: ve un plan sin publicar'; end if;
  if exists (select 1 from public.worship_items) then raise exception 'FALLO: ve el orden sin publicar'; end if;
  begin perform public.worship_answer(current_setting('test.team')::uuid, true); raise exception 'FALLO: contestó sin publicar';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin insert into public.songs (title) values ('No debería'); raise exception 'FALLO: un músico creó una canción';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
update public.worship_plans set published = true where id = current_setting('test.plan')::uuid;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if (select count(*) from public.worship_items) <> 1 then raise exception 'FALLO: no ve el orden publicado'; end if;
  perform public.worship_answer(current_setting('test.team')::uuid, true);
  if (select status from public.worship_team where id = current_setting('test.team')::uuid) <> 'yes' then raise exception 'FALLO: no quedó confirmado'; end if;
  if (select times from public.song_usage() where song_id = current_setting('test.song')::uuid) <> 1 then raise exception 'FALLO: no cuenta el uso'; end if;
  begin perform public.worship_copy(current_setting('test.plan')::uuid, current_date + 7); raise exception 'FALLO: un músico copió un plan';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
-- Alguien que no es de música no ve nada.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  if exists (select 1 from public.songs) or exists (select 1 from public.worship_plans) or exists (select 1 from public.worship_team) then raise exception 'FALLO: alguien de afuera ve la alabanza'; end if;
  begin perform public.worship_answer(current_setting('test.team')::uuid, false); raise exception 'FALLO: contestó por otro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ declare n uuid; begin
  n := public.worship_copy(current_setting('test.plan')::uuid, current_date + 7);
  if (select count(*) from public.worship_items where plan_id = n) <> 1 then raise exception 'FALLO: no copió el orden'; end if;
  if (select published from public.worship_plans where id = n) then raise exception 'FALLO: la copia salió publicada'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.worship_plans; delete from public.songs; delete from public.ministries where name = 'Música prueba';
\echo 'rls_test_46 OK'
