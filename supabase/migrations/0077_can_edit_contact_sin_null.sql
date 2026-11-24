-- can_edit_contact devolvía NULL (ni sí ni no) cuando la persona no tenía a nadie asignado.
-- Las funciones que hacen "if not can_edit_contact(c) then raise" dejaban pasar ese NULL. Ahora siempre es verdadero o falso.
create or replace function public.can_edit_contact(c public.contacts)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(c.church_id = public.current_church_id() and (
    c.created_by = auth.uid()
    or c.follow_up_user_id = auth.uid()
    or c.profile_id = auth.uid()
    or public.has_perm('personas.editar')
    or (public.i_have_role('captain') and (
          (c.group_id is not null and c.group_id = public.current_group_id())
          or exists (select 1 from public.profiles p where p.id = c.created_by and p.group_id = public.current_group_id())))
  ), false)
$function$;
