-- ============================================================================
-- La Mies · Revisar una cuenta que se unió sola a una ficha por el celular.
--
-- Cuando alguien crea su cuenta y su celular coincide con una ficha, la cuenta queda unida a esa ficha
-- y la secretaría y el pastor reciben el aviso "Cuenta vinculada por teléfono". Ahora el aviso abre la ficha
-- con un cartel para confirmarlo ("Sí, es la misma persona") o deshacerlo ("No es esta persona").
-- Se puede correr más de una vez.
-- ============================================================================

-- Deshacer la unión: la ficha queda sin cuenta y la cuenta recibe una ficha nueva propia.
create or replace function public.unlink_account(p_contact uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
  v_name text;
  v_phone text;
begin
  if not public.is_staff() then raise exception 'Solo la secretaría o el pastor'; end if;
  select profile_id into v_profile from public.contacts where id = p_contact and church_id = public.current_church_id();
  if v_profile is null then return; end if;
  update public.contacts set profile_id = null where id = p_contact;
  select display_name, phone into v_name, v_phone from public.profiles where id = v_profile;
  insert into public.contacts (church_id, created_by, name, phone, status, profile_id, auto_created, interest, share_mode)
  values (public.current_church_id(), v_profile, coalesce(v_name, 'Sin nombre'), v_phone, 'contact', v_profile, true, 'very', 'group');
  insert into public.audit_log (church_id, actor_id, action, target, details)
  values (public.current_church_id(), auth.uid(), 'unlink_account', p_contact::text, jsonb_build_object('profile', v_profile));
end $$;
revoke all on function public.unlink_account(uuid) from public, anon;
grant execute on function public.unlink_account(uuid) to authenticated;

-- El aviso abre la ficha con el cartel para confirmar.
create or replace function public.notifications_link_review()
returns trigger language plpgsql as $$
begin
  if new.kind = 'link' and new.link like '/contacto/%' and position('?' in new.link) = 0 then
    new.link := new.link || '?vinculo=1';
  end if;
  return new;
end $$;

drop trigger if exists notifications_link_review on public.notifications;
create trigger notifications_link_review before insert on public.notifications
  for each row execute function public.notifications_link_review();

update public.notifications set link = link || '?vinculo=1'
where kind = 'link' and link like '/contacto/%' and position('?' in link) = 0;
