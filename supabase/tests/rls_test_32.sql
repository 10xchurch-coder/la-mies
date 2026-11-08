\set ON_ERROR_STOP on
-- 0040: un miembro puede leer su perfil con select * y la lista de anuncios.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', false);
do $$ declare n int; begin
  perform * from public.profiles where id = auth.uid();
  select count(*) into n from public.announcements;
end $$;
reset role;
