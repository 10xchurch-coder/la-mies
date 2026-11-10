-- 0043: "Eliminar mi cuenta" borra la cuenta y los datos personales en el momento (pedido de Apple).
-- Lo que la persona cargó para la iglesia (fichas de personas visitadas, asistencias, visitas) queda
-- a nombre de un administrador de la iglesia. Su propia ficha de miembro queda anónima.

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_heir uuid;
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  select * into v_p from public.profiles where id = v_uid;
  -- Desde acá trabajamos "como el sistema": las protecciones que impiden cambiar el creador de una ficha
  -- miran auth.uid(), y acá sí hay que pasar las fichas al administrador.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  if v_p.church_id is not null then
    -- Otro administrador recibe lo que esta persona cargó para la iglesia.
    select id into v_heir from public.profiles
     where church_id = v_p.church_id and id <> v_uid and role::text = 'admin'
     order by created_at limit 1;
    if v_heir is null and v_p.role::text = 'admin' then
      raise exception 'Sos el único administrador de la iglesia. Antes de borrar tu cuenta, dale el rol de administrador a otra persona.';
    end if;
    if v_heir is null then
      select id into v_heir from public.profiles
       where church_id = v_p.church_id and id <> v_uid and role::text in ('secretary', 'assistant_pastor')
       order by created_at limit 1;
    end if;

    -- Su ficha de miembro: sin datos personales y archivada.
    update public.contacts set
      name = 'Cuenta eliminada', phone = null, email = null, address = null, address_hint = null,
      lat = null, lng = null, photo_path = null, birthdate = null, dni = null,
      spouse_name = null, spouse_id = null, profile_id = null, archived = true, updated_at = now()
    where profile_id = v_uid;

    if v_heir is not null then
      update public.contacts set created_by = v_heir where created_by = v_uid;
      update public.attendances set recorded_by = v_heir where recorded_by = v_uid;
      update public.contact_visits set user_id = v_heir where user_id = v_uid;
    end if;

    insert into public.audit_log (church_id, actor_id, action, target)
    values (v_p.church_id, null, 'delete_my_account', v_uid::text);
    -- Los avisos viejos de "pidió eliminar su cuenta" ya no hacen falta.
    delete from public.notifications where kind = 'account' and link = '/admin/cuentas'
      and body like coalesce(v_p.display_name, '') || ' pidió eliminar su cuenta%';
  end if;

  -- Borra el usuario: el perfil y todo lo personal (salidas, recorridos, comentarios, notas, avisos) se borra en cascada.
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
