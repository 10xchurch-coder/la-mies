-- 01_iglesia_y_cuentas · datos de ejemplo (generado por scripts/demo-seed.mjs; no editar a mano)
begin;
set local session_replication_role = replica;
create or replace function public.demo_c() returns uuid language sql immutable as $f$ select 'de300000-0000-4000-8000-000000000001'::uuid $f$;
create or replace function public.demo_p(n integer) returns uuid language sql immutable as $f$ select ('de300000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid $f$;
revoke all on function public.demo_c() from public, anon, authenticated;
revoke all on function public.demo_p(integer) from public, anon, authenticated;
insert into public.churches (id, name, city, country, timezone, grouping, tracking_since, giving, inactive_months, fin_track_donors, certificate_pastor, absence_dow, absence_hour, reminder_dow, reminder_hour, created_at)
values (demo_c(), 'Iglesia Bautista Esperanza', 'Ciudad de ejemplo', 'AR', 'America/Argentina/Buenos_Aires', 'bus_routes', current_date - 430,
  '{"titular":"Iglesia Bautista Esperanza (ejemplo)","banco":"Banco de ejemplo","alias":"ESTO.ES.UN.EJEMPLO","nota":"Datos de ejemplo. No es una cuenta real."}'::jsonb,
  null, true, 'Ricardo Villalba', 0, 21, 1, 9, now() - interval '520 days')
on conflict (id) do nothing;
insert into public.demo_churches (church_id, pastor_id, member_id, note)
values (demo_c(), demo_p(1), demo_p(2), 'Iglesia de ejemplo para mostrar La Mies') on conflict (church_id) do nothing;
insert into public.admin_church_settings (church_id, my_giving_on, motto, setup_pending, setup_step, setup_done_at)
values (demo_c(), true, 'Una iglesia de ejemplo para conocer La Mies', false, 0, now() - interval '500 days') on conflict (church_id) do nothing;
insert into public.church_services (id, church_id, name, dow, time, main, active, sort_order) values
  (demo_id('s1'), demo_c(), 'Domingo a la mañana', 0, '10:00', true, true, 10),
  (demo_id('s2'), demo_c(), 'Domingo a la noche', 0, '19:30', true, true, 20),
  (demo_id('s3'), demo_c(), 'Miércoles de oración', 3, '20:00', false, true, 30)
on conflict (id) do nothing;
insert into public.groups (id, church_id, name, captain_id) values
  (demo_id('g1'), demo_c(), 'Ruta Norte', demo_p(6)), (demo_id('g2'), demo_c(), 'Ruta Sur', demo_p(7))
on conflict (id) do nothing;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.mail || '@demo.lamies.invalid',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 10)), now() - interval '400 days',
  '{"provider":"email","providers":["email"],"lamies_demo":true}'::jsonb, '{}'::jsonb, now() - interval '400 days', now(), '', '', '', '', '', '', '', '', false, false
from (values (demo_p(1), 'pastor'), (demo_p(2), 'miembro'), (demo_p(3), 'cuenta03'), (demo_p(4), 'cuenta04'), (demo_p(5), 'cuenta05'), (demo_p(6), 'cuenta06'), (demo_p(7), 'cuenta07'), (demo_p(8), 'cuenta08'), (demo_p(9), 'cuenta09'), (demo_p(10), 'cuenta10'), (demo_p(11), 'cuenta11'), (demo_p(12), 'cuenta12'), (demo_p(13), 'cuenta13'), (demo_p(14), 'cuenta14')) v(id, mail)
on conflict (id) do nothing;
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false), 'email', now(), u.created_at, now()
from auth.users u where u.raw_app_meta_data ? 'lamies_demo' and not exists (select 1 from auth.identities i where i.user_id = u.id);
insert into public.profiles (id, church_id, group_id, role, display_name, title, directory_visible, finance_role, rules_accepted_at, biometric_lock, takes_attendance, created_at)
select v.id, demo_c(), case v.n when 6 then demo_id('g1') when 7 then demo_id('g2') end, v.role::public.member_role, v.name, v.title, true, v.fin, now() - interval '390 days', false, v.n in (3, 6, 7), now() - interval '400 days'
from (values (1, demo_p(1), 'admin', 'Ricardo Villalba', 'Pastor', null),
  (2, demo_p(2), 'member', 'Lucía Benítez', null, null),
  (3, demo_p(3), 'secretary', 'Marta Quiroga', 'Secretaria', null),
  (4, demo_p(4), 'assistant_pastor', 'Daniel Acosta', 'Pastor asistente', null),
  (5, demo_p(5), 'deacon', 'Rubén Sosa', 'Tesorero', 'treasurer'),
  (6, demo_p(6), 'captain', 'Hugo Maidana', 'Jefe de ruta', null),
  (7, demo_p(7), 'captain', 'Carina Ojeda', 'Jefa de ruta', null),
  (8, demo_p(8), 'evangelism', 'Tomás Giménez', 'Evangelismo', null),
  (9, demo_p(9), 'member', 'Sofía Cabrera', 'Maestra', null),
  (10, demo_p(10), 'member', 'Gustavo Romero', 'Música', null),
  (11, demo_p(11), 'member', 'Noelia Paz', 'Maestra', null),
  (12, demo_p(12), 'member', 'Leandro Ledesma', null, null),
  (13, demo_p(13), 'member', 'Elena Figueroa', null, null),
  (14, demo_p(14), 'member', 'Julián Vera', null, null)) v(n, id, role, name, title, fin)
on conflict (id) do nothing;
select public.demo_new_entry_key();
-- La zona de ejemplo: las calles reales del centro de Posadas que ya están en la tabla roads (hay que tenerlas cargadas).
do $z$ begin if public.demo_build_area() < 300 then raise exception 'Faltan las calles del centro de Posadas en la tabla roads (correr scripts/import-roads.mjs)'; end if; end $z$;
commit;
