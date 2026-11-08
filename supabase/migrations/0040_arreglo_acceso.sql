-- 0040: arreglo urgente de acceso.
--  1) Las apps instaladas con la versión de la tienda (antes de su primera actualización) leen el perfil con select *,
--     y al ocultar teléfono y dirección (0031) quedaban trabadas en "Unirme a mi iglesia". Se vuelven a habilitar
--     esas columnas hasta que todos tengan una versión nueva de la tienda; ahí se oculta de nuevo.
--  2) Los anuncios: la regla de lectura usaba una función que los miembros no podían ejecutar, y la lista fallaba.
grant select (phone, home_lat, home_lng, home_address, push_token) on public.profiles to authenticated;

create or replace function public.i_receive_announcement(p_aud text, p_church uuid, p_ministry uuid, p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_church = public.current_church_id()
     and auth.uid() in (select public.announcement_recipients(p_aud, p_church, p_ministry, p_group))
$$;
revoke all on function public.i_receive_announcement(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.i_receive_announcement(text, uuid, uuid, uuid) to authenticated;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using (church_id = public.current_church_id()
         and (public.has_perm('com.anuncios') or author_id = auth.uid()
              or public.i_receive_announcement(audience, church_id, ministry_id, group_id)));
