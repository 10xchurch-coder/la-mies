-- 0050: el celular es obligatorio al unirse a una iglesia.
-- Es lo único con lo que la app reconoce a alguien que la iglesia ya cargó, y así evita fichas duplicadas.
-- (Se valida con los mismos últimos 8 dígitos que usa para vincular.)
create or replace function public.join_church(p_code text, p_display_name text, p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
  v_match uuid;
  v_n integer;
begin
  if length(v_digits) < 8 then
    raise exception 'Escribí tu número de celular completo (con código de área). Así te encontramos si la iglesia ya te tiene cargado.' using errcode = 'P0001';
  end if;
  v_profile := public.join_church(p_code, p_display_name);
  if nullif(p_phone, '') is not null then
    perform set_config('lamies.bypass_guard', 'on', true);
    update public.profiles set phone = p_phone where id = v_profile.id;
  end if;
  if exists (select 1 from public.contacts where profile_id = v_profile.id) then return v_profile; end if;

  if length(v_digits) = 8 then
    select count(*), min(id::text)::uuid into v_n, v_match from public.contacts
    where church_id = v_profile.church_id and profile_id is null
      and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = v_digits;
    if v_n = 1 then
      update public.contacts set profile_id = v_profile.id where id = v_match;
      -- Aviso a la secretaría y al pastor para que confirmen que es la persona correcta.
      insert into public.notifications (church_id, user_id, kind, title, body, link)
      select v_profile.church_id, p.id, 'link', 'Cuenta vinculada por teléfono',
             v_profile.display_name || ' creó su cuenta y quedó unida a la ficha de '
               || (select name from public.contacts where id = v_match) || '. Revisá que sea la misma persona.',
             '/contacto/' || v_match
      from public.profiles p
      where p.church_id = v_profile.church_id and p.role::text in ('admin', 'secretary') and p.id <> v_profile.id;
      return v_profile;
    end if;
  end if;
  -- No hay ficha: se crea una para que aparezca en la lista (la secretaría la puede unir después).
  insert into public.contacts (church_id, created_by, name, phone, status, profile_id, auto_created, interest, share_mode)
  values (v_profile.church_id, v_profile.id, v_profile.display_name, nullif(p_phone, ''), 'contact', v_profile.id, true, 'very', 'group');
  return v_profile;
end $$;
