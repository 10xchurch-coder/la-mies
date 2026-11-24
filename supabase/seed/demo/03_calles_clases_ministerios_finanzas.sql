-- 03_calles_clases_ministerios_finanzas · datos de ejemplo (generado por scripts/demo-seed.mjs; no editar a mano)
begin;
set local session_replication_role = replica;
insert into public.roads (id, name, highway, city, coords, min_lat, min_lng, max_lat, max_lng)
select 8800000000001 + x.i, n.name, case when x.i in (4, 13) then 'tertiary' else 'residential' end, 'Iglesia de ejemplo', co.j,
  least(a.lat, b.lat), least(a.lng, b.lng), greatest(a.lat, b.lat), greatest(a.lng, b.lng)
from unnest(array['Los Ceibos', 'Las Acacias', 'El Jacarandá', 'Los Lapachos', 'Av. de la Esperanza', 'Los Aromos', 'Las Magnolias', 'El Timbó', 'Los Tilos', 'Los Zorzales', 'Las Calandrias', 'El Hornero', 'Los Teros', 'Av. del Arroyo', 'Las Golondrinas', 'El Benteveo', 'Los Cardenales', 'Las Torcazas']) with ordinality n(name, ord)
cross join lateral (select (n.ord - 1)::int as i) x
cross join lateral (select case when x.i < 9 then -37.45 + (x.i - 4) * 0.001 else -37.45 - 4 * 0.001 end as lat,
                           case when x.i < 9 then -66.6 - 4 * 0.00126 else -66.6 + (x.i - 13) * 0.00126 end as lng) a
cross join lateral (select case when x.i < 9 then a.lat else -37.45 + 4 * 0.001 end as lat,
                           case when x.i < 9 then -66.6 + 4 * 0.00126 else a.lng end as lng) b
cross join lateral (select jsonb_agg(jsonb_build_array(round((a.lat + (b.lat - a.lat) * s / 8.0)::numeric, 6), round((a.lng + (b.lng - a.lng) * s / 8.0)::numeric, 6)) order by s) as j
                    from generate_series(0, 8) s) co
on conflict (id) do nothing;
insert into public.classes (id, church_id, name, age_min, age_max, days, sort_order) values
  (demo_id('k1'), demo_c(), 'Cuna', 0, 3, '{sun}', 10), (demo_id('k2'), demo_c(), 'Párvulos', 4, 6, '{sun}', 20), (demo_id('k3'), demo_c(), 'Primarios', 7, 9, '{sun}', 30),
  (demo_id('k4'), demo_c(), 'Intermedios', 10, 12, '{sun}', 40), (demo_id('k5'), demo_c(), 'Adolescentes', 13, 17, '{sun}', 50)
on conflict (id) do nothing;
insert into public.class_students (class_id, contact_id)
select k.id, ct.id from public.classes k join public.contacts ct on ct.church_id = k.church_id and ct.age between k.age_min and k.age_max
where k.church_id = demo_c() on conflict do nothing;
insert into public.class_teachers (id, class_id, profile_id, contact_id, is_helper) values
  (demo_id('kt0'), demo_id('k1'), null, demo_id('c2'), false),
  (demo_id('kt1'), demo_id('k1'), null, demo_id('c12'), false),
  (demo_id('kt2'), demo_id('k1'), null, demo_id('c15'), true),
  (demo_id('kt3'), demo_id('k2'), demo_p(11), null, false),
  (demo_id('kt4'), demo_id('k2'), null, demo_id('c18'), false),
  (demo_id('kt5'), demo_id('k2'), demo_p(13), null, true),
  (demo_id('kt6'), demo_id('k3'), demo_p(2), null, false),
  (demo_id('kt7'), demo_id('k3'), demo_p(9), null, false),
  (demo_id('kt8'), demo_id('k3'), null, demo_id('c27'), true),
  (demo_id('kt9'), demo_id('k4'), demo_p(12), null, false),
  (demo_id('kt10'), demo_id('k4'), null, demo_id('c34'), false),
  (demo_id('kt11'), demo_id('k4'), demo_p(14), null, true),
  (demo_id('kt12'), demo_id('k5'), demo_p(4), null, false),
  (demo_id('kt13'), demo_id('k5'), demo_p(8), null, false),
  (demo_id('kt14'), demo_id('k5'), demo_p(10), null, true)
on conflict (id) do nothing;
insert into public.materials (id, church_id, series, title, chapter_order, body, class_id, created_by)
select demo_id('mt' || v.k || '-' || (v.o - 1)), demo_c(), v.series, v.title, v.o,
  'Lección ' || v.o || ' de "' || v.series || '". Contá la historia con tus palabras, hacé dos o tres preguntas y repasen juntos el versículo de memoria.', demo_id('k' || v.k), demo_p(9)
from (values
  (2, 'Conociendo a Jesús', 'Jesús nació en Belén', 1),
  (2, 'Conociendo a Jesús', 'Jesús calma la tormenta', 2),
  (2, 'Conociendo a Jesús', 'Jesús ama a los niños', 3),
  (2, 'Conociendo a Jesús', 'Jesús vive', 4),
  (3, 'Héroes de la Biblia', 'Noé obedece a Dios', 1),
  (3, 'Héroes de la Biblia', 'José perdona a sus hermanos', 2),
  (3, 'Héroes de la Biblia', 'David y el gigante', 3),
  (3, 'Héroes de la Biblia', 'Daniel ora a Dios', 4),
  (3, 'Héroes de la Biblia', 'Ester es valiente', 5),
  (3, 'Héroes de la Biblia', 'Jonás aprende a obedecer', 6),
  (4, 'Los Diez Mandamientos', 'Dios primero', 1),
  (4, 'Los Diez Mandamientos', 'Honrar a papá y a mamá', 2),
  (4, 'Los Diez Mandamientos', 'Decir la verdad', 3),
  (4, 'Los Diez Mandamientos', 'Estar contentos con lo que tenemos', 4),
  (5, 'Vida cristiana', 'Cómo sé que soy salvo', 1),
  (5, 'Vida cristiana', 'Leer la Biblia cada día', 2),
  (5, 'Vida cristiana', 'Cómo orar', 3),
  (5, 'Vida cristiana', 'Contarles a mis amigos', 4)
) v(k, series, title, o) on conflict (id) do nothing;
insert into public.memory_verses (id, church_id, class_id, reference, body, position, created_by) values
  (demo_id('mv0'), demo_c(), demo_id('k2'), 'Génesis 1:1', 'En el principio creó Dios los cielos y la tierra.', 0, demo_p(9)),
  (demo_id('mv1'), demo_c(), demo_id('k2'), 'Salmos 56:3', 'En el día que temo, Yo en ti confío.', 1, demo_p(9)),
  (demo_id('mv2'), demo_c(), demo_id('k3'), 'Salmos 23:1', 'Jehová es mi pastor; nada me faltará.', 2, demo_p(9)),
  (demo_id('mv3'), demo_c(), demo_id('k3'), 'Efesios 6:1', 'Hijos, obedeced en el Señor a vuestros padres, porque esto es justo.', 3, demo_p(9)),
  (demo_id('mv4'), demo_c(), demo_id('k3'), 'Salmos 119:105', 'Lámpara es a mis pies tu palabra, Y lumbrera a mi camino.', 4, demo_p(9)),
  (demo_id('mv5'), demo_c(), demo_id('k4'), 'Juan 3:16', 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.', 5, demo_p(9)),
  (demo_id('mv6'), demo_c(), demo_id('k4'), 'Filipenses 4:13', 'Todo lo puedo en Cristo que me fortalece.', 6, demo_p(9)),
  (demo_id('mv7'), demo_c(), demo_id('k5'), 'Proverbios 3:5-6', 'Fíate de Jehová de todo tu corazón, Y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, Y él enderezará tus veredas.', 7, demo_p(9))
on conflict (id) do nothing;
insert into public.ministries (id, church_id, name, description, icon, leader_id, can_take_attendance, is_teaching, sort_order) values
  (demo_id('m1'), demo_c(), 'Música', 'Los que cantan y tocan en las reuniones.', 'music', demo_p(10), false, false, 10),
  (demo_id('m2'), demo_c(), 'Bienvenida', 'Reciben a la gente en la puerta y juntan la ofrenda.', 'smile', demo_p(5), true, false, 20),
  (demo_id('m3'), demo_c(), 'Escuela dominical', 'Maestros y ayudantes de las clases de los chicos.', 'book-open', demo_p(9), false, true, 30),
  (demo_id('m4'), demo_c(), 'Sonido y pantalla', 'Micrófonos, parlantes y la letra de las canciones.', 'monitor', demo_p(12), false, false, 40),
  (demo_id('m5'), demo_c(), 'Limpieza', 'Dejan el salón listo para cada reunión.', 'home', demo_p(13), false, false, 50),
  (demo_id('m6'), demo_c(), 'Evangelismo', 'Salen los sábados a visitar el barrio.', 'map-pin', demo_p(8), false, false, 60)
on conflict (id) do nothing;
insert into public.ministry_people (ministry_id, contact_id, is_leader) values
(demo_id('m1'), demo_id('c26'), true),
(demo_id('m1'), demo_id('c5'), false),
(demo_id('m1'), demo_id('c40'), false),
(demo_id('m1'), demo_id('c57'), false),
(demo_id('m1'), demo_id('c23'), false),
(demo_id('m2'), demo_id('c13'), true),
(demo_id('m2'), demo_id('c6'), false),
(demo_id('m2'), demo_id('c30'), false),
(demo_id('m2'), demo_id('c63'), false),
(demo_id('m3'), demo_id('c22'), true),
(demo_id('m3'), demo_id('c29'), false),
(demo_id('m3'), demo_id('c6'), false),
(demo_id('m3'), demo_id('c33'), false),
(demo_id('m3'), demo_id('c37'), false),
(demo_id('m3'), demo_id('c2'), false),
(demo_id('m3'), demo_id('c12'), false),
(demo_id('m3'), demo_id('c18'), false),
(demo_id('m4'), demo_id('c33'), true),
(demo_id('m4'), demo_id('c38'), false),
(demo_id('m4'), demo_id('c39'), false),
(demo_id('m5'), demo_id('c37'), true),
(demo_id('m5'), demo_id('c76'), false),
(demo_id('m5'), demo_id('c56'), false),
(demo_id('m5'), demo_id('c86'), false),
(demo_id('m5'), demo_id('c62'), false),
(demo_id('m6'), demo_id('c17'), true),
(demo_id('m6'), demo_id('c14'), false),
(demo_id('m6'), demo_id('c16'), false),
(demo_id('m6'), demo_id('c11'), false),
(demo_id('m6'), demo_id('c38'), false)
on conflict do nothing;
insert into public.ministry_members (ministry_id, profile_id, is_leader) values
(demo_id('m1'), demo_p(10), true),
(demo_id('m2'), demo_p(5), true),
(demo_id('m2'), demo_p(2), false),
(demo_id('m3'), demo_p(9), true),
(demo_id('m3'), demo_p(11), false),
(demo_id('m3'), demo_p(2), false),
(demo_id('m3'), demo_p(12), false),
(demo_id('m3'), demo_p(13), false),
(demo_id('m4'), demo_p(12), true),
(demo_id('m4'), demo_p(14), false),
(demo_id('m5'), demo_p(13), true),
(demo_id('m6'), demo_p(8), true),
(demo_id('m6'), demo_p(6), false),
(demo_id('m6'), demo_p(7), false),
(demo_id('m6'), demo_p(4), false),
(demo_id('m6'), demo_p(14), false)
on conflict do nothing;
insert into public.demo_duty_tpl (church_id, ministry_id, slot, task, arrive_time, dow) values
  (demo_c(), demo_id('m1'), 1, 'Dirigir las canciones', '09:15', 0), (demo_c(), demo_id('m1'), 2, 'Guitarra o piano', '09:15', 0),
  (demo_c(), demo_id('m2'), 1, 'Bienvenida en la puerta', '09:30', 0), (demo_c(), demo_id('m2'), 2, 'Juntar la ofrenda', '09:45', 0),
  (demo_c(), demo_id('m4'), 1, 'Sonido', '09:00', 0), (demo_c(), demo_id('m4'), 2, 'Pantalla', '09:15', 0),
  (demo_c(), demo_id('m5'), 1, 'Limpieza del salón', '08:30', 6)
on conflict do nothing;
insert into public.fin_funds (id, church_id, name, kind, description, opening_balance, opening_date, sort_order) values
  (demo_id('ff1'), demo_c(), 'General', 'general', 'Diezmos y ofrendas para los gastos de la iglesia.', 850000, current_date - 434, 10),
  (demo_id('ff2'), demo_c(), 'Misiones', 'missions', 'Lo que se junta para los misioneros.', 120000, current_date - 434, 20),
  (demo_id('ff3'), demo_c(), 'Construcción', 'designated', 'Ahorro para el salón propio.', 2400000, current_date - 434, 30)
on conflict (id) do nothing;
insert into public.fin_accounts (id, church_id, name, kind, sort_order) values
  (demo_id('fa1'), demo_c(), 'Caja', 'cash', 10), (demo_id('fa2'), demo_c(), 'Banco', 'bank', 20) on conflict (id) do nothing;
insert into public.fin_categories (id, church_id, name, direction, sort_order) values
  (demo_id('fc1'), demo_c(), 'Diezmos y ofrendas', 'in', 10), (demo_id('fc2'), demo_c(), 'Ofrenda misionera', 'in', 20),
  (demo_id('fc3'), demo_c(), 'Alquiler', 'out', 30), (demo_id('fc4'), demo_c(), 'Servicios', 'out', 40), (demo_id('fc5'), demo_c(), 'Misioneros', 'out', 50),
  (demo_id('fc6'), demo_c(), 'Clases y materiales', 'out', 60), (demo_id('fc7'), demo_c(), 'Ayuda a familias', 'out', 70), (demo_id('fc8'), demo_c(), 'Limpieza y arreglos', 'out', 80)
on conflict (id) do nothing;
insert into public.fin_recurring (id, church_id, from_fund_id, to_fund_id, amount, day, description, created_by) values
  (demo_id('fr1'), demo_c(), demo_id('ff1'), demo_id('ff3'), 100000, 15, 'Ahorro del mes para el salón propio', demo_p(5)) on conflict (id) do nothing;
insert into public.people_settings (church_id, disc_course_name, disc_lessons, member_lessons, member_final, updated_by) values
  (demo_c(), 'Primeros pasos', '{"Seguro de mi salvación","El bautismo","La Biblia y la oración","La iglesia"}',
   '{"La salvación y el bautismo","Qué es la iglesia","Lo que creemos","Cómo vivimos y servimos"}', 'Recibido como miembro', demo_p(1))
on conflict (church_id) do nothing;
insert into public.bus_route_drivers (group_id, profile_id, church_id) values (demo_id('g1'), demo_p(6), demo_c()), (demo_id('g2'), demo_p(7), demo_c()) on conflict do nothing;
commit;
