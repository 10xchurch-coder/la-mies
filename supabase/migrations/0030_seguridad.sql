-- 0030: seguridad.
--  - Sin sesión (rol anon) no se puede leer ni llamar nada, salvo avisar un error de la app.
--  - Las funciones internas (disparadores y tareas del servidor) no se pueden llamar desde la app.
--  - Datos privados del perfil (teléfono, domicilio, ubicación, token de avisos): se leen con
--    my_profile() (lo propio) y profiles_private() (el teléfono y domicilio de los hermanos, solo
--    para pastor, secretaría y capitanes). En 0031 se cierra la lectura directa de esas columnas.
--  - Las fotos y los comprobantes solo aceptan imágenes (y PDF los comprobantes).

-- Lo propio, completo.
create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid()
$$;

-- Teléfono y domicilio: cada uno ve lo suyo; el pastor, la secretaría y los capitanes ven los de su iglesia.
create or replace function public.profiles_private()
returns table (id uuid, phone text, home_address text, home_lat double precision, home_lng double precision)
language sql stable security definer set search_path = public as $$
  select p.id, p.phone, p.home_address, p.home_lat, p.home_lng
  from public.profiles p
  where p.id = auth.uid()
     or (p.church_id = public.current_church_id() and public.is_captain_or_admin())
$$;

-- Funciones: nadie sin sesión; las internas, nadie desde la app.
do $sec$
declare f record; was_auth boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    was_auth := has_function_privilege('authenticated', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.is_trigger then
      execute format('revoke execute on function %s from authenticated', f.sig);
    elsif was_auth then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $sec$;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.profiles_private() to authenticated;
grant execute on function public.log_app_error(text, text, jsonb, text, text) to anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Tablas: nada para el rol anon.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- search_path fijo en las funciones que no lo tenían.
do $sp$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('touch_updated_at', 'haversine_m', 'contacts_guard', 'notifications_link_review', 'point_in_poly')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $sp$;

-- Tipos de archivo permitidos.
do $b$ begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set allowed_mime_types = array['image/*'] where id = 'photos';
    update storage.buckets set allowed_mime_types = array['image/*', 'application/pdf'] where id = 'finance';
  end if;
end $b$;
