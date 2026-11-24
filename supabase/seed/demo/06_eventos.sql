-- 06_eventos · datos de ejemplo (generado por scripts/demo-seed.mjs; no editar a mano)
begin;
set local session_replication_role = replica;
insert into public.events (id, church_id, title, starts_at, ends_at, all_day, place, description, weekly, yearly, source_id, created_by) values
  (demo_id('ev1'), demo_c(), 'Reunión de jóvenes', (current_date - 60 - extract(dow from current_date - 60)::int + 6 + time '19:00') at time zone 'America/Argentina/Buenos_Aires', null, false, 'Salón de la iglesia', 'Juegos, canciones y un mensaje corto. Traé un amigo.', true, false, 'demo:jovenes', demo_p(4)),
  (demo_id('ev2'), demo_c(), 'Ensayo de música', (current_date - 60 - extract(dow from current_date - 60)::int + 5 + time '20:00') at time zone 'America/Argentina/Buenos_Aires', null, false, 'Salón de la iglesia', null, true, false, 'demo:ensayo', demo_p(10)),
  (demo_id('ev3'), demo_c(), 'Aniversario de la iglesia', (date_trunc('year', current_date) + interval '4 months 9 days 10 hours') at time zone 'America/Argentina/Buenos_Aires', null, true, 'Salón de la iglesia', 'Culto especial y almuerzo a la canasta.', false, true, 'demo:aniversario', demo_p(1)),
  (demo_id('ev4'), demo_c(), 'Culto de Navidad', (date_trunc('year', current_date) + interval '11 months 23 days 20 hours 30 minutes') at time zone 'America/Argentina/Buenos_Aires', null, false, 'Salón de la iglesia', 'Cantata de los chicos y mensaje de Navidad.', false, true, 'demo:navidad', demo_p(1))
on conflict (id) do nothing;
insert into public.events (id, church_id, title, starts_at, ends_at, all_day, place, description, source_id, created_by, cost, transport, bring, program, contact_name, contact_phone,
  registration, reg_price, reg_capacity, reg_deadline, reg_ask_ride, reg_ask_lodging, faq, pay_info) values
  (demo_id('ev5'), demo_c(), 'Campamento de familias', (current_date - 38 + time '09:00') at time zone 'America/Argentina/Buenos_Aires', (current_date - 36 + time '17:00') at time zone 'America/Argentina/Buenos_Aires', false,
   'Predio El Algarrobo', 'Tres días para descansar, jugar y escuchar la Palabra en familia.', 'demo:campamento', demo_p(4), '$45.000 por adulto · chicos $20.000', 'Sale un colectivo del salón a las 8:00.',
   'Ropa de cama, repelente, Biblia y mate.', 'Viernes: llegada y fogón.' || chr(10) || 'Sábado: juegos, pileta y reunión a la noche.' || chr(10) || 'Domingo: culto y almuerzo de despedida.', 'Daniel Acosta', '+54 9 1005 55-0004',
   true, 45000, 80, current_date - 45, true, false, '¿Pueden ir chicos solos? Solo con un adulto a cargo.', 'Se paga en efectivo en la secretaría (datos de ejemplo).'),
  (demo_id('ev6'), demo_c(), 'Cena de matrimonios', (current_date + 23 + time '20:30') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '23:30') at time zone 'America/Argentina/Buenos_Aires', false,
   'Salón de la iglesia', 'Una noche para los matrimonios: cena, un mensaje y un tiempo para charlar. Hay cuidado de chicos.', 'demo:proximo', demo_p(1), '$18.000 por pareja', null,
   'Nada: solo vengan los dos.', '20:30 Recepción' || chr(10) || '21:00 Cena' || chr(10) || '22:00 Mensaje' || chr(10) || '23:00 Postre y sorteo', 'Marta Quiroga', '+54 9 1005 55-0003',
   true, 18000, 60, current_date + 18, false, false, '¿Hay cuidado de chicos? Sí, en el aula de Primarios.', 'Se paga en efectivo en la secretaría (datos de ejemplo).')
on conflict (id) do nothing;
insert into public.event_ticket_types (id, church_id, event_id, name, price, sort) values
  (demo_id('tt1'), demo_c(), demo_id('ev5'), 'Adulto', 45000, 0), (demo_id('tt2'), demo_c(), demo_id('ev5'), 'Chico (hasta 12)', 20000, 1),
  (demo_id('tt3'), demo_c(), demo_id('ev6'), 'Pareja', 18000, 0)
on conflict (id) do nothing;
insert into public.event_registrations (id, event_id, occurs_on, church_id, user_id, name, phone, people, needs_ride, paid_amount, paid_note, created_at, ticket_code, checked_in_at, checked_in_by, ticket_type_id, source)
select demo_id('rg5' || ct.id::text), demo_id('ev5'), current_date - 38, demo_c(), ct.profile_id, ct.name, ct.phone, 1, demo_h('rr' || ct.id::text) < 300,
  case when ct.age <= 12 then 20000 else 45000 end * case when demo_h('rp' || ct.id::text) < 850 then 1 else 0 end, case when demo_h('rp' || ct.id::text) < 850 then 'Efectivo' end,
  now() - make_interval(days => 45 + demo_h('rc' || ct.id::text) % 20), upper(left(md5('lmd:tk' || ct.id::text), 6)),
  case when demo_h('ri' || ct.id::text) < 880 then (current_date - 38 + time '09:20') at time zone 'America/Argentina/Buenos_Aires' + make_interval(mins => demo_h('rm' || ct.id::text) % 90) end,
  case when demo_h('ri' || ct.id::text) < 880 then demo_p(3) end, demo_id(case when ct.age <= 12 then 'tt2' else 'tt1' end), 'app'
from public.contacts ct join public.demo_plan pl on pl.contact_id = ct.id
where ct.church_id = demo_c() and ct.created_at < now() - interval '60 days' and demo_h('rg' || pl.hk) < 300 and pl.hk ~ '^\d+$'
on conflict (id) do nothing;
insert into public.event_registrations (id, event_id, occurs_on, church_id, user_id, name, phone, people, paid_amount, paid_note, created_at, ticket_code, ticket_type_id, source)
select demo_id('rg6' || ct.id::text), demo_id('ev6'), current_date + 23, demo_c(), ct.profile_id, ct.name, ct.phone, 2,
  case when demo_h('qp' || ct.id::text) < 550 then 18000 else 0 end, case when demo_h('qp' || ct.id::text) < 550 then 'Efectivo' end,
  now() - make_interval(days => demo_h('qc' || ct.id::text) % 12), upper(left(md5('lmd:tq' || ct.id::text), 6)), demo_id('tt3'), 'app'
from public.contacts ct where ct.church_id = demo_c() and ct.marital = 'married' and ct.sex = 'm' and ct.status = 'member' and demo_h('rq' || ct.id::text) < 520
on conflict (id) do nothing;
insert into public.event_speakers (id, church_id, event_id, name, role, bio, sort) values
  (demo_id('es1'), demo_c(), demo_id('ev5'), 'Daniel Acosta', 'Pastor asistente', 'Predica en las reuniones de la noche.', 0),
  (demo_id('es2'), demo_c(), demo_id('ev6'), 'Ricardo Villalba', 'Pastor', 'Mensaje: "Un hogar sobre la roca".', 0)
on conflict (id) do nothing;
insert into public.event_sessions (id, church_id, event_id, starts_at, ends_at, title, place, speaker_id) values
  (demo_id('en1'), demo_c(), demo_id('ev5'), (current_date - 38 + time '20:00') at time zone 'America/Argentina/Buenos_Aires', (current_date - 38 + time '21:30') at time zone 'America/Argentina/Buenos_Aires', 'Fogón y bienvenida', 'Fogón', demo_id('es1')),
  (demo_id('en2'), demo_c(), demo_id('ev5'), (current_date - 37 + time '20:00') at time zone 'America/Argentina/Buenos_Aires', (current_date - 37 + time '21:30') at time zone 'America/Argentina/Buenos_Aires', 'Reunión de la noche', 'Salón grande', demo_id('es1')),
  (demo_id('en3'), demo_c(), demo_id('ev6'), (current_date + 23 + time '22:00') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '22:45') at time zone 'America/Argentina/Buenos_Aires', 'Mensaje para los matrimonios', 'Salón de la iglesia', demo_id('es2'))
on conflict (id) do nothing;
insert into public.event_session_attendance (session_id, registration_id, event_id, church_id, scanned_at, scanned_by)
select demo_id('en2'), r.id, r.event_id, demo_c(), (current_date - 37 + time '19:50') at time zone 'America/Argentina/Buenos_Aires', demo_p(3)
from public.event_registrations r where r.event_id = demo_id('ev5') and r.checked_in_at is not null and demo_h('sa' || r.id::text) < 800 on conflict do nothing;
insert into public.event_team (event_id, profile_id, church_id, role, kind) values
  (demo_id('ev5'), demo_p(4), demo_c(), 'Coordinador', 'organizer'), (demo_id('ev5'), demo_p(3), demo_c(), 'Inscripciones', 'organizer'),
  (demo_id('ev6'), demo_p(3), demo_c(), 'Inscripciones', 'organizer'), (demo_id('ev6'), demo_p(13), demo_c(), 'Cocina', 'volunteer'), (demo_id('ev6'), demo_p(2), demo_c(), 'Cuidado de chicos', 'volunteer'), (demo_id('ev6'), demo_p(12), demo_c(), 'Sonido', 'volunteer')
on conflict do nothing;
insert into public.event_tasks (id, church_id, event_id, title, done, assignee_id, due_on) values
  (demo_id('et1'), demo_c(), demo_id('ev5'), 'Reservar el predio', true, demo_p(4), current_date - 80), (demo_id('et2'), demo_c(), demo_id('ev5'), 'Contratar el colectivo', true, demo_p(6), current_date - 50),
  (demo_id('et3'), demo_c(), demo_id('ev5'), 'Comprar la comida', true, demo_p(13), current_date - 40),
  (demo_id('et4'), demo_c(), demo_id('ev6'), 'Definir el menú', true, demo_p(13), current_date + 2), (demo_id('et5'), demo_c(), demo_id('ev6'), 'Armar la lista de canciones', true, demo_p(10), current_date + 5),
  (demo_id('et6'), demo_c(), demo_id('ev6'), 'Comprar los regalos del sorteo', false, demo_p(3), current_date + 15), (demo_id('et7'), demo_c(), demo_id('ev6'), 'Decorar el salón', false, demo_p(2), current_date + 22),
  (demo_id('et8'), demo_c(), demo_id('ev6'), 'Confirmar quién cuida a los chicos', false, demo_p(9), current_date + 16)
on conflict (id) do nothing;
insert into public.event_shifts (id, church_id, event_id, profile_id, place, starts_at, ends_at, note) values
  (demo_id('eh1'), demo_c(), demo_id('ev6'), demo_p(13), 'Cocina', (current_date + 23 + time '18:30') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '21:30') at time zone 'America/Argentina/Buenos_Aires', null),
  (demo_id('eh2'), demo_c(), demo_id('ev6'), demo_p(2), 'Cuidado de chicos', (current_date + 23 + time '20:15') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '23:30') at time zone 'America/Argentina/Buenos_Aires', 'Aula de Primarios'),
  (demo_id('eh3'), demo_c(), demo_id('ev6'), demo_p(12), 'Sonido', (current_date + 23 + time '19:45') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '23:30') at time zone 'America/Argentina/Buenos_Aires', null)
on conflict (id) do nothing;
insert into public.event_updates (id, church_id, event_id, body, created_by, created_at) values
  (demo_id('eu1'), demo_c(), demo_id('ev5'), 'El colectivo sale 8:00 en punto. No se olviden el repelente.', demo_p(4), now() - interval '40 days'),
  (demo_id('eu2'), demo_c(), demo_id('ev6'), 'Ya van más de la mitad de los lugares. Anótense esta semana.', demo_p(3), now() - interval '2 days')
on conflict (id) do nothing;
commit;
