-- "Mis contactos para seguir": de dónde salió cada persona (vino a una reunión, la conocieron en la calle,
-- la cargaron a mano), cuándo, y una nota para no perder el hilo.
alter table public.contacts add column if not exists follow_note text;

create or replace function public.follow_context(p_ids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with tz as (select coalesce((select timezone from public.churches where id = public.current_church_id()), 'America/Argentina/Buenos_Aires') z)
  select coalesce(jsonb_object_agg(c.id, jsonb_build_object(
    'status', c.status,
    'created_on', (c.created_at at time zone tz.z)::date,
    'added_by', (select p.display_name from public.profiles p where p.id = c.created_by),
    'added_by_me', c.created_by = auth.uid(),
    'from_outing', c.session_id is not null,
    'street', coalesce(c.address_hint, c.address),
    'times', (select count(distinct a.attended_on) from public.attendances a where a.contact_id = c.id),
    'first_on', (select min(a.attended_on) from public.attendances a where a.contact_id = c.id),
    'last_on', la.attended_on,
    'last_service', la.name,
    'note', c.follow_note,
    'last_note', (select v.note from public.contact_visits v where v.contact_id = c.id and nullif(trim(v.note), '') is not null order by v.visited_at desc limit 1)
  )), '{}'::jsonb)
  from public.contacts c
  cross join tz
  left join lateral (
    select a.attended_on, s.name from public.attendances a left join public.church_services s on s.id = a.service_id
    where a.contact_id = c.id order by a.attended_on desc, a.created_at desc limit 1) la on true
  where c.id = any(p_ids) and c.church_id = public.current_church_id()
    and (c.follow_up_user_id = auth.uid() or c.created_by = auth.uid()
         or public.has_perm('personas.editar') or public.has_perm('personas.ver_todas')
         or exists (select 1 from public.follow_up_tasks t where t.contact_id = c.id and t.assigned_to = auth.uid()))
$$;
revoke all on function public.follow_context(uuid[]) from public, anon;
grant execute on function public.follow_context(uuid[]) to authenticated;

create or replace function public.set_follow_note(p_contact uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.contacts c set follow_note = nullif(trim(p_note), ''), updated_at = now()
  where c.id = p_contact and c.church_id = public.current_church_id()
    and (c.follow_up_user_id = auth.uid() or c.created_by = auth.uid() or public.has_perm('personas.editar')
         or exists (select 1 from public.follow_up_tasks t where t.contact_id = c.id and t.assigned_to = auth.uid()));
  if not found then raise exception 'No tenés permiso para anotar en esta persona'; end if;
end $$;
revoke all on function public.set_follow_note(uuid, text) from public, anon;
grant execute on function public.set_follow_note(uuid, text) to authenticated;
