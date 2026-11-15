-- Cuántas veces participó cada persona en una reunión, una clase o las salidas de evangelismo
-- en los últimos días. Las listas para tomar asistencia lo usan para poner arriba a los más fieles.
create or replace function public.attendance_counts(p_kind text, p_ref uuid default null, p_days integer default 90)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_church uuid := public.current_church_id(); v_tz text; v_since date; v_out jsonb;
begin
  select coalesce(timezone, 'America/Argentina/Buenos_Aires') into v_tz from public.churches where id = v_church;
  v_since := (now() at time zone v_tz)::date - greatest(coalesce(p_days, 90), 1);

  if p_kind = 'service' then
    if not public.can_take_attendance() then return '{}'::jsonb; end if;
    select jsonb_object_agg(q.contact_id, q.n) into v_out from (
      select a.contact_id, count(distinct a.attended_on)::int n from public.attendances a
      where a.church_id = v_church and a.service_id = p_ref and a.attended_on >= v_since group by a.contact_id) q;

  elsif p_kind = 'class' then
    if not (public.has_perm('ens.ver') or public.can_teach_class(p_ref)) then return '{}'::jsonb; end if;
    select jsonb_object_agg(q.contact_id, q.n) into v_out from (
      select ca.contact_id, count(distinct ca.on_date)::int n from public.class_attendance ca
      where ca.church_id = v_church and ca.class_id = p_ref and ca.present and ca.on_date >= v_since group by ca.contact_id) q;

  elsif p_kind = 'outing' then
    if not (public.can_take_attendance() or public.is_captain_or_admin()) then return '{}'::jsonb; end if;
    -- Los días que salió: marcado a mano o con la app (el mismo día cuenta una sola vez).
    select jsonb_object_agg(q.contact_id, q.n) into v_out from (
      select d.contact_id, count(distinct d.day)::int n from (
        select o.contact_id, o.went_on as day from public.outing_attendance o where o.church_id = v_church and o.went_on >= v_since
        union
        select c.id, (s.started_at at time zone v_tz)::date from public.sessions s
          join public.contacts c on c.profile_id = s.user_id and c.church_id = v_church and not c.archived
          where s.church_id = v_church and (s.ended_at is null or s.counts) and (s.started_at at time zone v_tz)::date >= v_since
      ) d group by d.contact_id) q;
  end if;

  return coalesce(v_out, '{}'::jsonb);
end $$;
revoke all on function public.attendance_counts(text, uuid, integer) from public, anon;
grant execute on function public.attendance_counts(text, uuid, integer) to authenticated;
