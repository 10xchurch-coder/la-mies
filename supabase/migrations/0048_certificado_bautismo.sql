-- 0048: certificado de bautismo. Aparece solo cuando se anota la fecha de un bautismo hecho en la iglesia.
alter table public.churches add column if not exists certificate_pastor text;
update public.churches set certificate_pastor = 'Pastor Benjamin George' where certificate_pastor is null and name ilike '%victoria%';

-- Datos del certificado. Lo puede pedir la propia persona o el personal de la iglesia.
create or replace function public.baptism_certificate(p_contact uuid)
returns table (contact_id uuid, full_name text, baptized_on date, church_name text, city text, pastor text, number text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.baptized_on, ch.name, ch.city, coalesce(ch.certificate_pastor, 'Pastor'),
         'B-' || to_char(c.baptized_on, 'YYYY') || '-' || upper(substr(replace(c.id::text, '-', ''), 1, 6))
  from public.contacts c join public.churches ch on ch.id = c.church_id
  where c.id = p_contact and c.baptized_on is not null and c.baptized_here
    and c.church_id = public.current_church_id() and not c.archived
    and (c.profile_id = auth.uid() or public.is_staff())
$$;
grant execute on function public.baptism_certificate(uuid) to authenticated;

-- El mío (si tengo uno), para mostrarlo en "Yo".
create or replace function public.my_baptism_certificate_id() returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.contacts c
  where c.profile_id = auth.uid() and c.baptized_on is not null and c.baptized_here and not c.archived
  order by c.baptized_on desc limit 1
$$;
grant execute on function public.my_baptism_certificate_id() to authenticated;

-- Aviso a la persona cuando se anota su bautismo.
create or replace function public.baptism_certificate_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and new.baptized_on is not null and new.baptized_here
     and (tg_op = 'INSERT' or old.baptized_on is distinct from new.baptized_on or not coalesce(old.baptized_here, false)) then
    perform public.notify(new.profile_id, 'certificate', 'Tu certificado de bautismo está listo',
      'Tocá para verlo, descargarlo o imprimirlo.', '/certificado/' || new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists contacts_baptism_certificate on public.contacts;
create trigger contacts_baptism_certificate after insert or update of baptized_on, baptized_here on public.contacts
  for each row execute function public.baptism_certificate_notify();
