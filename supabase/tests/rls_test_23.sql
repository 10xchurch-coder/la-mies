\set ON_ERROR_STOP on
-- 0030/0031: seguridad de funciones y perfiles.
reset role;
update public.profiles set phone = '3764000000', home_address = 'Calle 1' where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if has_function_privilege('anon', 'public.current_church_id()', 'execute') then raise exception 'FALLO: anon ejecuta funciones'; end if;
  if has_table_privilege('anon', 'public.contacts', 'select') then raise exception 'FALLO: anon lee tablas'; end if;
  if has_function_privilege('authenticated', 'public.touch_updated_at()', 'execute') then raise exception 'FALLO: la app llama disparadores'; end if;
  if has_function_privilege('authenticated', 'public.load_growth_articles(jsonb)', 'execute') then raise exception 'FALLO: la app carga artículos'; end if;
  if not has_function_privilege('authenticated', 'public.current_church_id()', 'execute') then raise exception 'FALLO: la app perdió funciones'; end if;
  if not has_function_privilege('anon', 'public.log_app_error(text,text,jsonb,text,text)', 'execute') then raise exception 'FALLO: no se pueden avisar errores'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ begin
  if (select phone from public.my_profile()) is distinct from (select phone from public.profiles_private() where id = auth.uid()) then raise exception 'FALLO: my_profile'; end if;
  if exists (select 1 from public.profiles_private() where id = '00000000-0000-0000-0000-0000000000c1') then raise exception 'FALLO: un miembro ve el teléfono de otro'; end if;
  if not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000c1') then raise exception 'FALLO: no ve el nombre de los hermanos'; end if;
  begin
    perform phone from public.profiles where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'FALLO: lee el teléfono de otro directo';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select phone from public.profiles_private() where id = '00000000-0000-0000-0000-0000000000c1') is distinct from '3764000000' then raise exception 'FALLO: el pastor no ve el teléfono'; end if;
end $$;
reset role;
