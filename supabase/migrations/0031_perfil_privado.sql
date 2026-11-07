-- 0031: los demás ya no pueden leer el teléfono, domicilio, ubicación ni token de avisos de un perfil
-- directamente. Lo propio se lee con my_profile() y lo de los hermanos (para líderes) con profiles_private().
-- Se aplica cuando todos los teléfonos ya tienen la actualización que usa esas funciones.
revoke select on public.profiles from authenticated;
grant select (id, church_id, group_id, role, is_network_admin, display_name, share_default, biometric_lock,
              created_at, updated_at, takes_attendance, disabled_at, deletion_requested_at, title,
              directory_visible, finance_role, rules_accepted_at)
  on public.profiles to authenticated;
