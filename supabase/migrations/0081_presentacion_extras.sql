-- 0081: permiso propio para el Modo presentación ("presentar.usar").
--       Antes lo usaban todos los líderes (public.is_captain_or_admin()). Ahora: el pastor y el administrador
--       lo tienen siempre, nadie más lo tiene de entrada, y el pastor se lo da a quien quiera desde
--       Roles y permisos (un permiso suelto por persona, como los demás: public.set_permission).
--       La pantalla de salida (el aparato conectado al proyector) sigue igual: cualquiera de la iglesia puede escuchar.
--       Todo es aditivo: no se borra nada.

-- 1. El permiso nuevo entra en la lista de permisos conocidos.
create or replace function public.all_perms() returns text[]
language sql immutable as $$
  select array['personas.ver_todas', 'personas.editar', 'personas.asistencia', 'personas.privados',
               'com.anuncios', 'com.moderar', 'cal.editar', 'predicas.subir', 'devocional.editar',
               'ens.ver', 'ens.editar', 'ens.material',
               'evang.corregir', 'evang.marcar_otros', 'evang.ver_salidas', 'evang.zonas',
               'inf.panel', 'fin.ver', 'fin.cargar', 'fin.tesoreria', 'fin.roles',
               'admin.permisos', 'admin.iglesia', 'presentar.usar']
$$;

-- 2. Solo el pastor (admin) y el administrador de la app lo traen con su rol.
--    El copastor y la secretaría ("todo menos...") quedan sin él: si hace falta, el pastor se lo da a la persona.
create or replace function public.role_perms(p_role text) returns text[]
language sql immutable set search_path to 'public' as $$
  select case p_role
    when 'app_admin' then public.all_perms()
    when 'admin' then public.all_perms()
    when 'assistant_pastor' then array(select x from unnest(public.all_perms()) x where x not like 'fin.%' and x not in ('admin.permisos', 'presentar.usar'))
    when 'secretary' then array(select x from unnest(public.all_perms()) x where x not in ('admin.permisos', 'fin.tesoreria', 'fin.roles', 'presentar.usar'))
    when 'deacon' then array['personas.ver_todas', 'personas.asistencia', 'personas.privados', 'ens.ver', 'inf.panel']
    when 'evangelism' then array['evang.corregir', 'evang.marcar_otros', 'evang.ver_salidas', 'evang.zonas']
    when 'captain' then array['com.anuncios', 'ens.ver', 'personas.asistencia', 'inf.panel', 'evang.corregir', 'personas.privados', 'evang.zonas']
    else array[]::text[]
  end
$$;

-- 3. ¿Puedo usar el Modo presentación? Nunca devuelve NULL.
create or replace function public.presentar2_can_present() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.has_perm('presentar.usar'), false)
$$;
revoke all on function public.presentar2_can_present() from public, anon;
grant execute on function public.presentar2_can_present() to authenticated;

-- 4. Las listas del culto: solo quien tiene el permiso (de su iglesia).
alter policy present_sets_select on public.present_sets
  using (church_id = public.current_church_id() and public.presentar2_can_present());
alter policy present_sets_write on public.present_sets
  using (church_id = public.current_church_id() and public.presentar2_can_present())
  with check (church_id = public.current_church_id() and public.presentar2_can_present());

-- 5. Los archivos de la presentación (fotos, videos, música): subir, abrir y borrar, solo con el permiso.
--    La pantalla de salida no los lee de acá: recibe del operador un link firmado.
do $$
begin
  if to_regclass('storage.objects') is not null then
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lamies_present_read') then
      alter policy lamies_present_read on storage.objects
        using (bucket_id = 'present' and (storage.foldername(name))[1] = (public.current_church_id())::text and public.presentar2_can_present());
    end if;
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lamies_present_insert') then
      alter policy lamies_present_insert on storage.objects
        with check (bucket_id = 'present' and (storage.foldername(name))[1] = (public.current_church_id())::text and public.presentar2_can_present());
    end if;
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lamies_present_delete') then
      alter policy lamies_present_delete on storage.objects
        using (bucket_id = 'present' and (storage.foldername(name))[1] = (public.current_church_id())::text and public.presentar2_can_present());
    end if;
  end if;
end $$;

-- 6. Tiempo real: mandar (pasar de diapositiva, poner en negro) solo con el permiso.
--    Escuchar sigue abierto a cualquiera de la iglesia que entró a la app (lamies_present_listen no se toca).
do $$
begin
  if to_regclass('realtime.messages') is not null
     and exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'lamies_present_send') then
    alter policy lamies_present_send on realtime.messages
      with check (extension = 'broadcast' and realtime.topic() = 'presentar:' || (public.current_church_id())::text and public.presentar2_can_present());
  end if;
end $$;
