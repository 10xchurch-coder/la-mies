// Segunda mitad de los datos de ejemplo: lo que no son personas. Lo usa demo-seed.mjs.
// Los versículos son de la Reina-Valera 1960, completos.

export function addParts({ people, batch, q, C, P, D, ACCOUNTS, TOWN, ROAD0, EW, NS }) {
  const ck = (n) => `demo_id('c${people.find((p) => p.prof === n).k}')`; // la ficha de una cuenta
  const free = people.filter((p) => p.adult && p.st === 'member' && !p.prof && !p.stop);
  const women = free.filter((p) => p.sex === 'f');
  const men = free.filter((p) => p.sex === 'm');
  const c = (p) => `demo_id('c${p.k}')`;
  const poly = (a, w, b, e) => JSON.stringify([[a, w], [a, e], [b, e], [b, w]].map(([la, ln]) => [+(TOWN.lat + la).toFixed(4), +(TOWN.lng + ln).toFixed(4)]));
  const SUN = `(current_date - extract(dow from current_date)::int)`; // el último domingo (hoy, si hoy es domingo)

  // ---------------- 03 · calles, clases, ministerios, finanzas ----------------
  const teach = [
    [1, null, women[0], false], [1, null, women[1], false], [1, null, women[2], true],
    [2, 11, null, false], [2, null, women[3], false], [2, 13, null, true],
    [3, 2, null, false], [3, 9, null, false], [3, null, women[4], true],
    [4, 12, null, false], [4, null, women[5], false], [4, 14, null, true],
    [5, 4, null, false], [5, 8, null, false], [5, 10, null, true],
  ];
  const mins = [
    [1, 'Música', 'Los que cantan y tocan en las reuniones.', 'music', 10, false, false, [10, men[0], women[6], women[7], men[1]]],
    [2, 'Bienvenida', 'Reciben a la gente en la puerta y juntan la ofrenda.', 'smile', 5, true, false, [5, 2, men[2], women[8]]],
    [3, 'Escuela dominical', 'Maestros y ayudantes de las clases de los chicos.', 'book-open', 9, false, true, [9, 11, 2, 12, 13, women[0], women[1], women[3]]],
    [4, 'Sonido y pantalla', 'Micrófonos, parlantes y la letra de las canciones.', 'monitor', 12, false, false, [12, 14, men[3]]],
    [5, 'Limpieza', 'Dejan el salón listo para cada reunión.', 'home', 13, false, false, [13, women[9], men[4], women[10], men[5]]],
    [6, 'Evangelismo', 'Salen los sábados a visitar el barrio.', 'map-pin', 8, false, false, [8, 6, 7, 4, 14]],
  ];
  const mp = [];
  const mm = [];
  for (const [n, , , , leader, , , list] of mins) {
    for (const who of list) {
      const isProf = typeof who === 'number';
      mp.push(`(demo_id('m${n}'), ${isProf ? ck(who) : c(who)}, ${isProf && who === leader})`);
      if (isProf) mm.push(`(demo_id('m${n}'), ${P(who)}, ${who === leader})`);
    }
  }
  const lessons = [
    [2, 'Conociendo a Jesús', ['Jesús nació en Belén', 'Jesús calma la tormenta', 'Jesús ama a los niños', 'Jesús vive']],
    [3, 'Héroes de la Biblia', ['Noé obedece a Dios', 'José perdona a sus hermanos', 'David y el gigante', 'Daniel ora a Dios', 'Ester es valiente', 'Jonás aprende a obedecer']],
    [4, 'Los Diez Mandamientos', ['Dios primero', 'Honrar a papá y a mamá', 'Decir la verdad', 'Estar contentos con lo que tenemos']],
    [5, 'Vida cristiana', ['Cómo sé que soy salvo', 'Leer la Biblia cada día', 'Cómo orar', 'Contarles a mis amigos']],
  ];
  const verses = [
    [2, 'Génesis 1:1', 'En el principio creó Dios los cielos y la tierra.'],
    [2, 'Salmos 56:3', 'En el día que temo, Yo en ti confío.'],
    [3, 'Salmos 23:1', 'Jehová es mi pastor; nada me faltará.'],
    [3, 'Efesios 6:1', 'Hijos, obedeced en el Señor a vuestros padres, porque esto es justo.'],
    [3, 'Salmos 119:105', 'Lámpara es a mis pies tu palabra, Y lumbrera a mi camino.'],
    [4, 'Juan 3:16', 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.'],
    [4, 'Filipenses 4:13', 'Todo lo puedo en Cristo que me fortalece.'],
    [5, 'Proverbios 3:5-6', 'Fíate de Jehová de todo tu corazón, Y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, Y él enderezará tus veredas.'],
  ];
  batch('03_calles_clases_ministerios_finanzas', `
insert into public.roads (id, name, highway, city, coords, min_lat, min_lng, max_lat, max_lng)
select ${ROAD0} + x.i, n.name, case when x.i in (4, 13) then 'tertiary' else 'residential' end, 'Iglesia de ejemplo', co.j,
  least(a.lat, b.lat), least(a.lng, b.lng), greatest(a.lat, b.lat), greatest(a.lng, b.lng)
from unnest(array[${[...EW, ...NS].map(q).join(', ')}]) with ordinality n(name, ord)
cross join lateral (select (n.ord - 1)::int as i) x
cross join lateral (select case when x.i < 9 then ${TOWN.lat} + (x.i - 4) * ${TOWN.dLat} else ${TOWN.lat} - 4 * ${TOWN.dLat} end as lat,
                           case when x.i < 9 then ${TOWN.lng} - 4 * ${TOWN.dLng} else ${TOWN.lng} + (x.i - 13) * ${TOWN.dLng} end as lng) a
cross join lateral (select case when x.i < 9 then a.lat else ${TOWN.lat} + 4 * ${TOWN.dLat} end as lat,
                           case when x.i < 9 then ${TOWN.lng} + 4 * ${TOWN.dLng} else a.lng end as lng) b
cross join lateral (select jsonb_agg(jsonb_build_array(round((a.lat + (b.lat - a.lat) * s / 8.0)::numeric, 6), round((a.lng + (b.lng - a.lng) * s / 8.0)::numeric, 6)) order by s) as j
                    from generate_series(0, 8) s) co
on conflict (id) do nothing;
insert into public.classes (id, church_id, name, age_min, age_max, days, sort_order) values
  (demo_id('k1'), ${C}, 'Cuna', 0, 3, '{sun}', 10), (demo_id('k2'), ${C}, 'Párvulos', 4, 6, '{sun}', 20), (demo_id('k3'), ${C}, 'Primarios', 7, 9, '{sun}', 30),
  (demo_id('k4'), ${C}, 'Intermedios', 10, 12, '{sun}', 40), (demo_id('k5'), ${C}, 'Adolescentes', 13, 17, '{sun}', 50)
on conflict (id) do nothing;
insert into public.class_students (class_id, contact_id)
select k.id, ct.id from public.classes k join public.contacts ct on ct.church_id = k.church_id and ct.age between k.age_min and k.age_max
where k.church_id = ${C} on conflict do nothing;
insert into public.class_teachers (id, class_id, profile_id, contact_id, is_helper) values
${teach.map(([k, prof, person, helper], i) => `  (demo_id('kt${i}'), demo_id('k${k}'), ${prof ? P(prof) : 'null'}, ${person ? c(person) : 'null'}, ${helper})`).join(',\n')}
on conflict (id) do nothing;
insert into public.materials (id, church_id, series, title, chapter_order, body, class_id, created_by)
select demo_id('mt' || v.k || '-' || (v.o - 1)), ${C}, v.series, v.title, v.o,
  'Lección ' || v.o || ' de "' || v.series || '". Contá la historia con tus palabras, hacé dos o tres preguntas y repasen juntos el versículo de memoria.', demo_id('k' || v.k), ${P(9)}
from (values
${lessons.flatMap(([k, series, titles]) => titles.map((t, i) => `  (${k}, ${q(series)}, ${q(t)}, ${i + 1})`)).join(',\n')}
) v(k, series, title, o) on conflict (id) do nothing;
insert into public.memory_verses (id, church_id, class_id, reference, body, position, created_by) values
${verses.map(([k, ref, body], i) => `  (demo_id('mv${i}'), ${C}, demo_id('k${k}'), ${q(ref)}, ${q(body)}, ${i}, ${P(9)})`).join(',\n')}
on conflict (id) do nothing;
insert into public.ministries (id, church_id, name, description, icon, leader_id, can_take_attendance, is_teaching, sort_order) values
${mins.map(([n, name, desc, icon, leader, att, teachm]) => `  (demo_id('m${n}'), ${C}, ${q(name)}, ${q(desc)}, ${q(icon)}, ${P(leader)}, ${att}, ${teachm}, ${n * 10})`).join(',\n')}
on conflict (id) do nothing;
insert into public.ministry_people (ministry_id, contact_id, is_leader) values
${mp.join(',\n')}
on conflict do nothing;
insert into public.ministry_members (ministry_id, profile_id, is_leader) values
${mm.join(',\n')}
on conflict do nothing;
insert into public.demo_duty_tpl (church_id, ministry_id, slot, task, arrive_time, dow) values
  (${C}, demo_id('m1'), 1, 'Dirigir las canciones', '09:15', 0), (${C}, demo_id('m1'), 2, 'Guitarra o piano', '09:15', 0),
  (${C}, demo_id('m2'), 1, 'Bienvenida en la puerta', '09:30', 0), (${C}, demo_id('m2'), 2, 'Juntar la ofrenda', '09:45', 0),
  (${C}, demo_id('m4'), 1, 'Sonido', '09:00', 0), (${C}, demo_id('m4'), 2, 'Pantalla', '09:15', 0),
  (${C}, demo_id('m5'), 1, 'Limpieza del salón', '08:30', 6)
on conflict do nothing;
insert into public.fin_funds (id, church_id, name, kind, description, opening_balance, opening_date, sort_order) values
  (demo_id('ff1'), ${C}, 'General', 'general', 'Diezmos y ofrendas para los gastos de la iglesia.', 850000, ${D(434)}, 10),
  (demo_id('ff2'), ${C}, 'Misiones', 'missions', 'Lo que se junta para los misioneros.', 120000, ${D(434)}, 20),
  (demo_id('ff3'), ${C}, 'Construcción', 'designated', 'Ahorro para el salón propio.', 2400000, ${D(434)}, 30)
on conflict (id) do nothing;
insert into public.fin_accounts (id, church_id, name, kind, sort_order) values
  (demo_id('fa1'), ${C}, 'Caja', 'cash', 10), (demo_id('fa2'), ${C}, 'Banco', 'bank', 20) on conflict (id) do nothing;
insert into public.fin_categories (id, church_id, name, direction, sort_order) values
  (demo_id('fc1'), ${C}, 'Diezmos y ofrendas', 'in', 10), (demo_id('fc2'), ${C}, 'Ofrenda misionera', 'in', 20),
  (demo_id('fc3'), ${C}, 'Alquiler', 'out', 30), (demo_id('fc4'), ${C}, 'Servicios', 'out', 40), (demo_id('fc5'), ${C}, 'Misioneros', 'out', 50),
  (demo_id('fc6'), ${C}, 'Clases y materiales', 'out', 60), (demo_id('fc7'), ${C}, 'Ayuda a familias', 'out', 70), (demo_id('fc8'), ${C}, 'Limpieza y arreglos', 'out', 80)
on conflict (id) do nothing;
insert into public.fin_recurring (id, church_id, from_fund_id, to_fund_id, amount, day, description, created_by) values
  (demo_id('fr1'), ${C}, demo_id('ff1'), demo_id('ff3'), 100000, 15, 'Ahorro del mes para el salón propio', ${P(5)}) on conflict (id) do nothing;
insert into public.people_settings (church_id, disc_course_name, disc_lessons, member_lessons, member_final, updated_by) values
  (${C}, 'Primeros pasos', '{"Seguro de mi salvación","El bautismo","La Biblia y la oración","La iglesia"}',
   '{"La salvación y el bautismo","Qué es la iglesia","Lo que creemos","Cómo vivimos y servimos"}', 'Recibido como miembro', ${P(1)})
on conflict (church_id) do nothing;
insert into public.bus_route_drivers (group_id, profile_id, church_id) values (demo_id('g1'), ${P(6)}, ${C}), (demo_id('g2'), ${P(7)}, ${C}) on conflict do nothing;
`);

  // ---------------- 04 · la historia (más de un año) y lo que sale de ella ----------------
  batch('04_historia', `
select public.demo_fill(${C}, current_date - 434, current_date - 1);
set local session_replication_role = replica;
insert into public.decisions (id, church_id, contact_id, kind, on_date, created_by, created_at)
select demo_id('de' || ct.id::text || v.kind), ${C}, ct.id, v.kind, v.d, ${P(1)}, v.d + time '12:30'
from public.contacts ct cross join lateral (values ('saved', ct.saved_on), ('baptized', ct.baptized_on), ('member', ct.member_since)) v(kind, d)
where ct.church_id = ${C} and v.d > current_date - 430 and exists (select 1 from public.demo_plan pl where pl.contact_id = ct.id)
on conflict (id) do nothing;
insert into public.follow_up_tasks (id, church_id, contact_id, assigned_to, kind, due_at, done_at, done_by, created_at)
select demo_id('ft' || ct.id::text || v.kind), ${C}, ct.id, g.captain_id, v.kind, ct.created_at + v.due,
  case when ct.created_at + v.due < now() - interval '4 days' and demo_h('ftd' || ct.id::text || v.kind) < 600 then ct.created_at + v.due + interval '20 hours' end,
  case when ct.created_at + v.due < now() - interval '4 days' and demo_h('ftd' || ct.id::text || v.kind) < 600 then g.captain_id end, ct.created_at + interval '2 hours'
from public.contacts ct join public.groups g on g.id = ct.group_id
cross join (values ('call', interval '2 days'), ('visit', interval '7 days')) v(kind, due)
where ct.church_id = ${C} and ct.status = 'visitor' and ct.age >= 18 and ct.created_at > now() - interval '40 days'
on conflict do nothing;
insert into public.follow_up_tasks (id, church_id, contact_id, assigned_to, kind, due_at, created_at)
select demo_id('fta' || ct.id::text), ${C}, ct.id, g.captain_id, 'absent_visit', pl.stop_on + 21, pl.stop_on + 15
from public.demo_plan pl join public.contacts ct on ct.id = pl.contact_id join public.groups g on g.id = ct.group_id
where pl.church_id = ${C} and pl.stop_on <= current_date - 20 and ct.age >= 18
on conflict do nothing;
insert into public.visitor_care (contact_id, church_id, gift_on, gift_by, visit_on, visit_by)
select ct.id, ${C}, case when demo_h('vg' || ct.id::text) < 650 then ct.created_at::date end, case when demo_h('vg' || ct.id::text) < 650 then ${P(3)} end,
  case when demo_h('vv' || ct.id::text) < 350 and ct.created_at < now() - interval '8 days' then ct.created_at::date + 6 end,
  case when demo_h('vv' || ct.id::text) < 350 and ct.created_at < now() - interval '8 days' then g.captain_id end
from public.contacts ct join public.groups g on g.id = ct.group_id
where ct.church_id = ${C} and ct.status = 'visitor' and ct.age >= 18 and ct.created_at > now() - interval '40 days'
on conflict do nothing;
insert into public.visit_cards (id, church_id, contact_id, name, phone, heard, prayer, is_new, created_at)
select demo_id('vc' || ct.id::text), ${C}, ct.id, ct.name, ct.phone, (array['Me invitó un vecino', 'Vi el cartel del salón', 'Vine con una amiga', 'Pasaron por mi casa un sábado'])[1 + demo_h('vh' || ct.id::text) % 4],
  (array['Por mi trabajo', 'Por la salud de mi mamá', 'Por mis hijos', null])[1 + demo_h('vp' || ct.id::text) % 4], true, ct.created_at + interval '20 minutes'
from public.contacts ct where ct.church_id = ${C} and ct.status = 'visitor' and ct.age >= 18 and ct.created_at > now() - interval '40 days'
on conflict (id) do nothing;
with t as (select ct.id, ct.saved_on, row_number() over (order by ct.saved_on desc, ct.id) as rn, 1 + demo_h('dl' || ct.id::text) % 4 as n
           from public.contacts ct where ct.church_id = ${C} and ct.saved_on is not null and ct.age >= 12 and ct.saved_on < current_date - 10),
u as (update public.contacts ct set discipleship_since = t.saved_on + 7,
        discipleship = jsonb_build_object('one', coalesce((select jsonb_object_agg(i::text, (t.saved_on + 7 * i)::text) from generate_series(1, t.n) i where t.saved_on + 7 * i <= current_date), '{}'::jsonb))
      from t where ct.id = t.id and t.rn <= 10 returning ct.id, t.saved_on, t.n, t.rn)
insert into public.disciple_tracks (contact_id, church_id, teacher_contact_id, started_on, last_met_on, finished_on, active, updated_by)
select u.id, ${C}, (array[${ck(4)}, ${ck(9)}, ${ck(2)}, ${ck(6)}])[(1 + u.rn % 4)::int], u.saved_on + 7, least(u.saved_on + 7 * u.n, current_date - 2),
  case when u.n = 4 and u.saved_on + 28 <= current_date then u.saved_on + 28 end, not (u.n = 4 and u.saved_on + 28 <= current_date), ${P(4)}
from u on conflict (contact_id) do nothing;
insert into public.member_class (contact_id, church_id, started_on, done, final_on, final_by, updated_by)
select ct.id, ${C}, ct.member_since - 35, jsonb_build_object('1', (ct.member_since - 28)::text, '2', (ct.member_since - 21)::text, '3', (ct.member_since - 14)::text, '4', (ct.member_since - 7)::text), ct.member_since, ${P(1)}, ${P(1)}
from public.contacts ct where ct.church_id = ${C} and ct.status = 'member' and ct.age >= 14 and ct.member_since > current_date - 150
on conflict (contact_id) do nothing;
insert into public.member_class (contact_id, church_id, started_on, done, updated_by)
select x.id, ${C}, current_date - 24, case when x.rn % 2 = 0 then jsonb_build_object('1', (current_date - 17)::text, '2', (current_date - 10)::text, '3', (current_date - 3)::text) else jsonb_build_object('1', (current_date - 17)::text) end, ${P(1)}
from (select ct.id, row_number() over (order by demo_h('mc' || ct.id::text), ct.id) as rn from public.contacts ct
      where ct.church_id = ${C} and ct.status = 'visitor' and ct.age >= 18 and ct.created_at < now() - interval '90 days') x where x.rn <= 6
on conflict (contact_id) do nothing;
insert into public.memory_verse_done (verse_id, contact_id, church_id, learned_on, marked_by)
select v.id, s.contact_id, ${C}, current_date - (7 + demo_h('ml' || v.id::text || s.contact_id::text) % 120), ${P(9)}
from public.memory_verses v join public.class_students s on s.class_id = v.class_id
where v.church_id = ${C} and demo_h('mv' || v.id::text || s.contact_id::text) < 560 on conflict do nothing;
insert into public.zones (id, church_id, name, color, polygon, assigned, note, created_by) values
  (demo_id('z1'), ${C}, 'Barrio Norte', '#2F8F5B', '${poly(0.0042, -0.0052, 0.0002, 0.0002)}'::jsonb, array[${P(8)}, ${P(6)}], 'Empezar por Los Tilos.', ${P(8)}),
  (demo_id('z2'), ${C}, 'Barrio Sur', '#C2410C', '${poly(-0.0002, -0.0002, -0.0042, 0.0052)}'::jsonb, array[${P(7)}, ${P(14)}], null, ${P(8)})
on conflict (id) do nothing;
insert into public.bus_stops (id, church_id, group_id, household_id, sort_order, address, lat, lng, created_by)
select demo_id('bs' || x.hid::text), ${C}, x.gid, x.hid, row_number() over (partition by x.gid order by x.lng), x.address, x.lat, x.lng, ${P(6)}
from (select distinct hm.household_id as hid, ct.group_id as gid, ct.address, ct.lat, ct.lng
      from public.contacts ct join public.household_members hm on hm.contact_id = ct.id where ct.church_id = ${C} and ct.bus_rider) x
on conflict do nothing;
`);

  // ---------------- 05 · culto y comunidad ----------------
  const songs = [
    ['Gracias, Señor', 'Do', 'Gracias, Señor, por este día,\npor tu cuidado y tu amor.\nGracias, Señor, por tu alegría,\ngracias por ser mi Salvador.\n\nTe canto hoy con todo el corazón,\nporque tu amor no tiene fin.\nTe canto hoy, mi Dios y mi Señor,\ny vivo solo para ti.'],
    ['En tus manos estoy', 'Sol', 'En tus manos estoy, nada temeré.\nEn tus manos estoy, siempre confiaré.\n\nSi el camino es largo, vos venís conmigo.\nSi la noche es fría, sos mi buen amigo.\n\nEn tus manos estoy, nada temeré.\nEn tus manos estoy, siempre confiaré.'],
    ['La mies es mucha', 'Re', 'La mies es mucha, hay que salir,\nhay tanta gente sin oír.\nSeñor, enviame, quiero ir,\nde tu gran amor decir.\n\nPor cada calle, por cada hogar,\ntu buena nueva voy a llevar.'],
    ['Venimos a tu casa', 'La', 'Venimos a tu casa con alegría,\nvenimos a tu casa a adorar.\nGrandes y chicos, toda la familia,\njuntos te queremos alabar.\n\nSanto, santo es el Señor.\nDigno, digno de loor.'],
    ['Tu palabra es luz', 'Mi', 'Tu palabra es luz en mi camino,\ntu palabra es verdad.\nLa guardo en mi corazón,\nla quiero cada día más.\n\nHablame, Señor, que quiero escuchar.\nGuiame, Señor, te quiero obedecer.'],
    ['Fiel es mi Dios', 'Do', 'Fiel es mi Dios, nunca falló.\nFiel es mi Dios, me sostendrá.\nCada mañana su amor renovó.\nFiel es mi Dios, y fiel será.'],
  ];
  const plan = [
    ['prayer', 'Oración de apertura', null, null, 4, 'Daniel Acosta'], ['song', songs[3][0], 3, null, 10, 'Gustavo Romero'], ['song', songs[0][0], 0, null, 10, 'Gustavo Romero'],
    ['notices', 'Anuncios de la semana', null, null, 3, 'Marta Quiroga'], ['offering', 'Ofrenda', null, null, 5, 'Rubén Sosa'], ['song', songs[5][0], 5, null, 10, 'Gustavo Romero'],
    ['reading', 'Lectura bíblica', null, 'Salmos 23', 2, 'Lucía Benítez'], ['sermon', 'Prédica', null, null, 1, 'Ricardo Villalba'], ['song', songs[1][0], 1, null, 10, 'Gustavo Romero'],
    ['prayer', 'Oración final', null, null, 1, 'Ricardo Villalba'],
  ];
  const planJson = (tag) => `jsonb_build_array(${plan.map(([type, title, song, ref, who, name], i) => `jsonb_build_object('id', '${tag}${i}', 'type', '${type}', 'title', ${q(title)}, 'songId', ${song == null ? 'null' : `demo_id('so${song}')::text`}, 'ref', ${q(ref)}, 'whoId', ${P(who)}::text, 'whoName', ${q(name)}, 'note', null)`).join(',\n  ')})`;
  const sermons = [
    ['El buen pastor', 'Salmos 23', 'Dios cuida a los suyos como un pastor cuida a sus ovejas.', 'El Señor es mi ___.\nCon él nada me ___.\nÉl me guía por sendas de ___.\nAunque pase por el valle, no ___ mal alguno.'],
    ['Nacer de nuevo', 'Juan 3:1-16', 'Ser religioso no alcanza: hay que nacer de nuevo.', 'Nicodemo era un hombre muy ___.\nJesús le dijo: te es necesario nacer de ___.\nDios amó tanto al mundo que dio a su ___.\nEl que cree en él tiene vida ___.'],
    ['La casa sobre la roca', 'Mateo 7:24-27', 'No alcanza con oír: hay que hacer lo que Jesús dice.', 'Los dos hombres ___ la palabra.\nSolo uno la puso en ___.\nLa tormenta llega para ___.\nLa roca es ___.'],
    ['Venid a mí', 'Mateo 11:28-30', 'Jesús invita a los cansados a descansar en él.', 'Jesús llama a los ___ y cargados.\nÉl promete hacernos ___.\nSu yugo es ___.\nSu carga es ___.'],
    ['La mies es mucha', 'Mateo 9:35-38', 'Jesús vio a la gente y tuvo compasión. Nosotros también tenemos que ir.', 'Jesús recorría las ciudades y las ___.\nAl ver a la gente tuvo ___.\nLa mies es mucha, pero los obreros son ___.\nRoguemos al Señor que envíe ___.'],
    ['Una fe que obra', 'Santiago 2:14-26', 'La fe verdadera se nota en lo que hacemos.', 'La fe sin obras está ___.\nAbraham mostró su fe cuando ___.\nNo nos salvan las obras: nos salva ___.\nPero el que es salvo quiere ___.'],
    ['El hijo que volvió', 'Lucas 15:11-24', 'El Padre espera con los brazos abiertos al que vuelve.', 'El hijo menor pidió su ___.\nLejos de casa lo perdió ___.\nVolvió en sí y dijo: me levantaré e iré a mi ___.\nEl padre corrió y lo ___.'],
    ['No se afanen', 'Mateo 6:25-34', 'El Padre sabe lo que necesitamos.', 'Miren las ___ del cielo.\nNuestro Padre sabe lo que ___.\nBusquemos primero el reino de ___.\nCada día tiene su propio ___.'],
    ['Firmes en la prueba', 'Santiago 1:2-12', 'Dios usa las pruebas para hacernos crecer.', 'La prueba produce ___.\nSi nos falta sabiduría, hay que ___.\nHay que pedir con ___.\nEl que resiste recibirá la corona de ___.'],
    ['Sal y luz', 'Mateo 5:13-16', 'El creyente se tiene que notar donde vive y trabaja.', 'Ustedes son la ___ de la tierra.\nUstedes son la ___ del mundo.\nUna luz no se pone debajo de un ___.\nQue vean nuestras buenas obras y den gloria al ___.'],
    ['La oración que Dios escucha', 'Lucas 18:9-14', 'Dios recibe al humilde y resiste al orgulloso.', 'Dos hombres subieron al templo a ___.\nEl fariseo confiaba en sí ___.\nEl publicano pidió ___.\nEl que se humilla será ___.'],
    ['Id y haced discípulos', 'Mateo 28:16-20', 'La tarea que Jesús nos dejó, y su promesa de estar con nosotros.', 'Toda potestad le fue dada a ___.\nLa orden es ir y hacer ___.\nHay que bautizar y ___.\nÉl está con nosotros todos los ___.'],
  ];
  const news = [
    [2, 1, 'Cena de matrimonios', 'Ya están abiertas las inscripciones para la cena de matrimonios. Anotate desde Eventos. Hay lugar para 60 personas.'],
    [9, 3, 'Limpieza general del salón', 'El sábado a las 8:30 hacemos limpieza general. Traé guantes y ganas. Después compartimos unos mates.'],
    [16, 1, 'Clase de miembros', 'El domingo que viene empieza una clase de miembros nueva, después del culto de la mañana. Hablá con el pastor si querés participar.'],
    [23, 3, 'Ofrenda misionera', 'Este domingo juntamos la ofrenda misionera del mes. Gracias por dar con alegría.'],
    [30, 4, 'Salida de evangelismo', 'El sábado salimos a visitar el Barrio Norte. Nos juntamos en el salón a las 9:30.'],
    [37, 1, 'Bautismos', 'El último domingo del mes hay bautismos. Si creíste en Cristo y todavía no te bautizaste, hablá con el pastor.'],
    [44, 3, 'Ropa de abrigo', 'Estamos juntando ropa de abrigo para dos familias del barrio. Dejala en la entrada del salón.'],
    [51, 1, 'Reunión de maestros', 'El miércoles, después de la reunión de oración, nos quedamos los maestros para armar el trimestre.'],
  ];
  const prayers = [
    [1, 2, 'church', false, 'Por la operación de mi mamá, que es el jueves.', null, null],
    [3, 13, 'church', false, 'Por mi nieto, que empiece a venir a la iglesia.', null, null],
    [5, 12, 'church', false, 'Estoy buscando trabajo. Pidan conmigo que el Señor abra una puerta.', 3, 'Entré a trabajar en una ferretería. ¡Gracias por orar!'],
    [8, 9, 'church', false, 'Por los chicos de la clase de Primarios, que entiendan el evangelio.', null, null],
    [12, 14, 'church', false, 'Por mis exámenes de la facultad.', 6, 'Aprobé los dos. Gracias, hermanos.'],
    [15, 2, 'pastor', false, 'Pastor, ore por mi esposo, está pasando un tiempo difícil en el trabajo.', null, null],
    [20, 6, 'church', false, 'Por las familias que visitamos el sábado, que vengan el domingo.', 13, 'Dos de las familias vinieron el domingo.'],
    [27, 11, 'church', true, 'Por una decisión importante que tengo que tomar.', null, null],
    [34, 5, 'church', false, 'Por el salón propio: que el Señor provea el terreno.', null, null],
    [41, 10, 'church', false, 'Por mi papá, que está internado.', 36, 'Ya está en casa y recuperándose bien.'],
    [48, 3, 'church', false, 'Por los misioneros y sus familias.', null, null],
  ];
  const chat = [
    [0.4, 3, 'Buen día, hermanos. Les recuerdo que el miércoles hay reunión de oración a las 20.'], [0.3, 10, 'Buen día. Ahí estaremos.'],
    [2.3, 6, 'El colectivo de la Ruta Norte sale 9:10 el domingo. Avisen si alguien más necesita que lo pasemos a buscar.'], [2.2, 2, 'Gracias, Hugo. Nosotros vamos por nuestra cuenta.'],
    [5.3, 8, 'Hermosa salida la de ayer. Visitamos 24 casas y dos familias prometieron venir.'], [5.2, 1, '¡Gloria a Dios! Gracias a todos los que salieron.'], [5.1, 13, 'Estuve orando por ustedes toda la mañana.'],
    [9.6, 9, 'Maestros: ya están cargadas las lecciones del mes en la app.'], [9.5, 11, '¡Gracias, Sofía!'],
    [13.2, 5, 'Se cumplió la meta de la ofrenda misionera de este mes. Gracias por dar.'],
    [17.5, 12, '¿Alguien tiene un alargue para prestar el domingo? El nuestro se rompió.'], [17.4, 14, 'Yo llevo uno.'],
    [21.3, 4, 'No se olviden de orar por los hermanos que están enfermos. La lista está en Oración.'],
    [25.2, 7, 'La Ruta Sur trajo 14 personas hoy. ¡Sigamos invitando!'],
  ];
  batch('05_culto_y_comunidad', `
insert into public.songs (id, church_id, title, author, lyrics, song_key, position, created_by) values
${songs.map(([t, key, lyr], i) => `  (demo_id('so${i}'), ${C}, ${q(t)}, 'Canción de ejemplo', ${q(lyr)}, ${q(key)}, ${i}, ${P(10)})`).join(',\n')}
on conflict (id) do nothing;
insert into public.service_plans (id, church_id, service_date, title, items, people, created_by)
select demo_id('sp' || d::text), ${C}, d, 'Culto del domingo a la mañana',
  ${planJson('i')},
  array[${[1, 2, 3, 4, 5, 10].map(P).join(', ')}], ${P(1)}
from (values (${SUN} - 7), (${SUN})) v(d) on conflict (id) do nothing;
insert into public.sermons (id, church_id, title, preacher, preached_on, passage, summary, notes_outline, created_by, created_at)
select demo_id('sr' || v.i::text), ${C}, v.title, case when v.i % 4 = 3 then 'Daniel Acosta' else 'Ricardo Villalba' end, ${SUN} - 7 * v.i, v.passage, v.summary, v.outline, ${P(1)}, (${SUN} - 7 * v.i) + time '15:00'
from (values
${sermons.map(([t, p, s, o], i) => `  (${i}, ${q(t)}, ${q(p)}, ${q(s)}, ${q(o)})`).join(',\n')}
) v(i, title, passage, summary, outline) on conflict (id) do nothing;
insert into public.sermon_notes (sermon_id, user_id, answers, notes) values
  (demo_id('sr1'), ${P(2)}, '["religioso","nuevo","Hijo","eterna"]'::jsonb, 'Contarle esto a mi vecina.'),
  (demo_id('sr2'), ${P(2)}, '["oyeron","práctica","todos"]'::jsonb, null)
on conflict do nothing;
insert into public.announcements (id, church_id, author_id, title, body, audience, sent_to, created_at) values
${news.map(([d, who, t, b], i) => `  (demo_id('an${i}'), ${C}, ${P(who)}, ${q(t)}, ${q(b)}, 'all', 14, now() - interval '${d} days')`).join(',\n')}
on conflict (id) do nothing;
insert into public.prayer_requests (id, church_id, user_id, body, visibility, anonymous, answered_at, answer_note, created_at) values
${prayers.map(([d, who, vis, anon, body, ansD, ans], i) => `  (demo_id('pr${i}'), ${C}, ${P(who)}, ${q(body)}, '${vis}', ${anon}, ${ansD == null ? 'null' : `now() - interval '${ansD} days'`}, ${q(ans)}, now() - interval '${d} days')`).join(',\n')}
on conflict (id) do nothing;
insert into public.prayer_prayed (request_id, user_id)
select r.id, p.id from public.prayer_requests r join public.profiles p on p.church_id = r.church_id and p.id <> r.user_id
where r.church_id = ${C} and r.visibility = 'church' and demo_h('pp' || r.id::text || p.id::text) < 420 on conflict do nothing;
insert into public.bible_questions (id, church_id, user_id, body, status, answer, answered_by, answered_at, created_at) values
  (demo_id('bq0'), ${C}, ${P(14)}, '¿Qué quiere decir "nacer de nuevo"?', 'answered', 'Es lo que Dios hace en una persona cuando cree en Cristo: le da una vida nueva. No es algo que hacemos nosotros; es un regalo. Leé Juan 3 y lo charlamos el domingo.', ${P(1)}, now() - interval '6 days', now() - interval '8 days'),
  (demo_id('bq1'), ${C}, null, '¿Por qué nos bautizamos si ya somos salvos?', 'answered', 'El bautismo no salva. Es obedecer a Jesús y contarles a todos que creímos en él.', ${P(1)}, now() - interval '18 days', now() - interval '20 days'),
  (demo_id('bq2'), ${C}, ${P(2)}, '¿Cómo puedo enseñarles a orar a mis hijos?', 'new', null, null, null, now() - interval '2 days'),
  (demo_id('bq3'), ${C}, null, '¿Qué versículo puedo leer cuando tengo miedo?', 'new', null, null, null, now() - interval '1 days')
on conflict (id) do nothing;
insert into public.suggestions (id, church_id, user_id, body, anonymous, status, reply, created_at) values
  (demo_id('sg0'), ${C}, ${P(12)}, '¿Podemos poner un cartel más grande en la entrada? De noche no se ve.', false, 'done', 'Buena idea. Ya lo encargamos.', now() - interval '25 days'),
  (demo_id('sg1'), ${C}, ${P(2)}, 'Estaría bueno tener una merienda para las mamás una vez por mes.', false, 'seen', null, now() - interval '9 days'),
  (demo_id('sg2'), ${C}, null, 'Que el culto de la noche empiece puntual, por favor.', true, 'new', null, now() - interval '3 days')
on conflict (id) do nothing;
insert into public.church_chat_messages (id, church_id, user_id, body, created_at, kind) values
${chat.map(([d, who, body], i) => `  (demo_id('ch${i}'), ${C}, ${P(who)}, ${q(body)}, now() - interval '${Math.round(d * 24)} hours', 'text')`).join(',\n')}
on conflict (id) do nothing;
insert into public.ministry_messages (id, church_id, ministry_id, user_id, kind, body, created_at) values
  (demo_id('mg0'), ${C}, demo_id('m2'), ${P(5)}, 'announcement', 'Este domingo esperamos visitas. Lleguen 9:30 para recibir a todos con tiempo.', now() - interval '3 days'),
  (demo_id('mg1'), ${C}, demo_id('m2'), ${P(2)}, 'message', 'Listo, ahí voy a estar.', now() - interval '70 hours'),
  (demo_id('mg2'), ${C}, demo_id('m3'), ${P(9)}, 'announcement', 'Maestros: repasen el versículo de memoria con los chicos antes de la lección.', now() - interval '5 days'),
  (demo_id('mg3'), ${C}, demo_id('m3'), ${P(11)}, 'message', 'Los Párvulos ya saben Génesis 1:1 de memoria.', now() - interval '4 days'),
  (demo_id('mg4'), ${C}, demo_id('m1'), ${P(10)}, 'message', 'Ensayo el viernes a las 20. Vemos dos canciones nuevas.', now() - interval '2 days'),
  (demo_id('mg5'), ${C}, demo_id('m6'), ${P(8)}, 'announcement', 'El sábado visitamos el Barrio Norte. Traigan folletos.', now() - interval '4 days')
on conflict (id) do nothing;
insert into public.dm_messages (id, church_id, sender_id, recipient_id, kind, body, read_at, created_at) values
  (demo_id('dm0'), ${C}, ${P(9)}, ${P(2)}, 'text', 'Lucía, ¿podés cubrirme en Primarios el domingo que viene?', now() - interval '46 hours', now() - interval '2 days'),
  (demo_id('dm1'), ${C}, ${P(2)}, ${P(9)}, 'text', 'Sí, contá conmigo. ¿Qué lección toca?', now() - interval '45 hours', now() - interval '46 hours'),
  (demo_id('dm2'), ${C}, ${P(9)}, ${P(2)}, 'text', 'David y el gigante. Está cargada en la app. ¡Gracias!', null, now() - interval '5 hours'),
  (demo_id('dm3'), ${C}, ${P(3)}, ${P(1)}, 'text', 'Pastor, ya están los informes del mes en la app.', null, now() - interval '9 hours'),
  (demo_id('dm4'), ${C}, ${P(5)}, ${P(1)}, 'text', 'Pastor, el lunes paso a dejarle los comprobantes.', now() - interval '3 days', now() - interval '4 days')
on conflict (id) do nothing;
insert into public.pastor_messages (id, church_id, member_id, sender_id, body, read_at, created_at) values
  (demo_id('pm0'), ${C}, ${P(2)}, ${P(2)}, 'Pastor, ¿podemos hablar el domingo después del culto? Es por mi esposo.', now() - interval '6 days', now() - interval '7 days'),
  (demo_id('pm1'), ${C}, ${P(2)}, ${P(1)}, 'Claro, Lucía. Los espero a los dos. Estoy orando por ustedes.', now() - interval '6 days', now() - interval '160 hours'),
  (demo_id('pm2'), ${C}, ${P(2)}, ${P(2)}, 'Gracias, pastor.', null, now() - interval '20 hours'),
  (demo_id('pm3'), ${C}, ${P(14)}, ${P(14)}, 'Pastor, quiero bautizarme. ¿Qué tengo que hacer?', null, now() - interval '30 hours')
on conflict (id) do nothing;
insert into public.notifications (id, church_id, user_id, kind, title, body, link, created_at, read_at)
select demo_id('nt' || v.n::text || u.id::text), ${C}, u.id, v.kind, v.title, v.body, v.link, now() - v.ago, case when v.n > 2 then now() - v.ago + interval '3 hours' end
from (values (${P(1)}), (${P(2)})) u(id) cross join (values
  (1, 'announcement', 'Cena de matrimonios', 'Ya están abiertas las inscripciones.', '/anuncios', interval '2 days'),
  (2, 'duty', 'El domingo servís en bienvenida', 'Bienvenida en la puerta. Llegá a las 09:30.', '/ministerios', interval '1 day'),
  (3, 'prayer', 'Pedido de oración nuevo', 'Por mi nieto, que empiece a venir a la iglesia.', '/oracion', interval '3 days'),
  (4, 'event', 'Falta poco para la cena de matrimonios', 'Revisá el horario y qué hay que llevar.', '/eventos', interval '5 days'),
  (5, 'announcement', 'Limpieza general del salón', 'El sábado a las 8:30.', '/anuncios', interval '9 days')
) v(n, kind, title, body, link, ago) on conflict (id) do nothing;
insert into public.missionaries (id, church_id, name, field, bio, position) values
  (demo_id('mi0'), ${C}, 'Familia Altamirano', 'Norte de Santa Cruz', 'Una familia de ejemplo. Abrieron una obra nueva hace tres años y ya se reúnen cuarenta personas.', 0),
  (demo_id('mi1'), ${C}, 'Familia Olmedo', 'Pueblos del monte chaqueño', 'Una familia de ejemplo. Visitan cinco parajes por mes y reparten Biblias.', 1)
on conflict (id) do nothing;
insert into public.missionary_reports (id, church_id, missionary_id, month, title, summary, created_by, created_at)
select demo_id('mr' || m.n::text || k::text), ${C}, demo_id('mi' || m.n::text), (date_trunc('month', current_date) - make_interval(months => k))::date,
  case k when 0 then 'Carta de este mes' else 'Carta del mes pasado' end, m.txt, ${P(3)}, now() - make_interval(days => 4 + 30 * k)
from (values (0, 'Este mes se bautizaron tres personas. Empezamos una clase de chicos los sábados. Oren por un lugar más grande para reunirnos.'),
             (1, 'Visitamos dos parajes nuevos. Una familia entera creyó en Cristo. Oren por la camioneta, que necesita arreglo.')) m(n, txt)
cross join generate_series(0, 1) k on conflict (id) do nothing;
insert into public.reading_log (user_id, on_date)
select p.id, current_date - g from public.profiles p cross join generate_series(0, 40) g
where p.church_id = ${C} and (g <= demo_h('rs' || p.id::text) % 20 or demo_h('rl' || p.id::text || g::text) < 450) on conflict do nothing;
insert into public.bible_plans (profile_id, plan, started_on, done) values
  (${P(2)}, 'new90', current_date - 20, array(select generate_series(1, 19))), (${P(1)}, 'bible', current_date - 60, array(select generate_series(1, 58)))
on conflict (profile_id) do nothing;
insert into public.daily_likes (church_id, on_date, user_id)
select ${C}, current_date - g, p.id from public.profiles p cross join generate_series(0, 6) g
where p.church_id = ${C} and demo_h('lk' || p.id::text || g::text) < 500 on conflict do nothing;
insert into public.daily_comments (id, church_id, on_date, user_id, body, created_at) values
  (demo_id('dcm0'), ${C}, current_date, ${P(13)}, 'Amén. Justo lo que necesitaba leer hoy.', now() - interval '2 hours'),
  (demo_id('dcm1'), ${C}, current_date, ${P(10)}, 'Gracias por el devocional.', now() - interval '1 hours'),
  (demo_id('dcm2'), ${C}, current_date - 1, ${P(2)}, 'Lo leímos en familia en el desayuno.', now() - interval '26 hours')
on conflict (id) do nothing;
`);

  // ---------------- 06 · eventos ----------------
  batch('06_eventos', `
insert into public.events (id, church_id, title, starts_at, ends_at, all_day, place, description, weekly, yearly, source_id, created_by) values
  (demo_id('ev1'), ${C}, 'Reunión de jóvenes', (current_date - 60 - extract(dow from current_date - 60)::int + 6 + time '19:00') at time zone 'America/Argentina/Buenos_Aires', null, false, 'Salón de la iglesia', 'Juegos, canciones y un mensaje corto. Traé un amigo.', true, false, 'demo:jovenes', ${P(4)}),
  (demo_id('ev2'), ${C}, 'Ensayo de música', (current_date - 60 - extract(dow from current_date - 60)::int + 5 + time '20:00') at time zone 'America/Argentina/Buenos_Aires', null, false, 'Salón de la iglesia', null, true, false, 'demo:ensayo', ${P(10)}),
  (demo_id('ev3'), ${C}, 'Aniversario de la iglesia', (date_trunc('year', current_date) + interval '4 months 9 days 10 hours') at time zone 'America/Argentina/Buenos_Aires', null, true, 'Salón de la iglesia', 'Culto especial y almuerzo a la canasta.', false, true, 'demo:aniversario', ${P(1)}),
  (demo_id('ev4'), ${C}, 'Culto de Navidad', (date_trunc('year', current_date) + interval '11 months 23 days 20 hours 30 minutes') at time zone 'America/Argentina/Buenos_Aires', null, false, 'Salón de la iglesia', 'Cantata de los chicos y mensaje de Navidad.', false, true, 'demo:navidad', ${P(1)})
on conflict (id) do nothing;
insert into public.events (id, church_id, title, starts_at, ends_at, all_day, place, description, source_id, created_by, cost, transport, bring, program, contact_name, contact_phone,
  registration, reg_price, reg_capacity, reg_deadline, reg_ask_ride, reg_ask_lodging, faq, pay_info) values
  (demo_id('ev5'), ${C}, 'Campamento de familias', (current_date - 38 + time '09:00') at time zone 'America/Argentina/Buenos_Aires', (current_date - 36 + time '17:00') at time zone 'America/Argentina/Buenos_Aires', false,
   'Predio El Algarrobo', 'Tres días para descansar, jugar y escuchar la Palabra en familia.', 'demo:campamento', ${P(4)}, '$45.000 por adulto · chicos $20.000', 'Sale un colectivo del salón a las 8:00.',
   'Ropa de cama, repelente, Biblia y mate.', 'Viernes: llegada y fogón.' || chr(10) || 'Sábado: juegos, pileta y reunión a la noche.' || chr(10) || 'Domingo: culto y almuerzo de despedida.', 'Daniel Acosta', '+54 9 1005 55-0004',
   true, 45000, 80, current_date - 45, true, false, '¿Pueden ir chicos solos? Solo con un adulto a cargo.', 'Se paga en efectivo en la secretaría (datos de ejemplo).'),
  (demo_id('ev6'), ${C}, 'Cena de matrimonios', (current_date + 23 + time '20:30') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '23:30') at time zone 'America/Argentina/Buenos_Aires', false,
   'Salón de la iglesia', 'Una noche para los matrimonios: cena, un mensaje y un tiempo para charlar. Hay cuidado de chicos.', 'demo:proximo', ${P(1)}, '$18.000 por pareja', null,
   'Nada: solo vengan los dos.', '20:30 Recepción' || chr(10) || '21:00 Cena' || chr(10) || '22:00 Mensaje' || chr(10) || '23:00 Postre y sorteo', 'Marta Quiroga', '+54 9 1005 55-0003',
   true, 18000, 60, current_date + 18, false, false, '¿Hay cuidado de chicos? Sí, en el aula de Primarios.', 'Se paga en efectivo en la secretaría (datos de ejemplo).')
on conflict (id) do nothing;
insert into public.event_ticket_types (id, church_id, event_id, name, price, sort) values
  (demo_id('tt1'), ${C}, demo_id('ev5'), 'Adulto', 45000, 0), (demo_id('tt2'), ${C}, demo_id('ev5'), 'Chico (hasta 12)', 20000, 1),
  (demo_id('tt3'), ${C}, demo_id('ev6'), 'Pareja', 18000, 0)
on conflict (id) do nothing;
insert into public.event_registrations (id, event_id, occurs_on, church_id, user_id, name, phone, people, needs_ride, paid_amount, paid_note, created_at, ticket_code, checked_in_at, checked_in_by, ticket_type_id, source)
select demo_id('rg5' || ct.id::text), demo_id('ev5'), current_date - 38, ${C}, ct.profile_id, ct.name, ct.phone, 1, demo_h('rr' || ct.id::text) < 300,
  case when ct.age <= 12 then 20000 else 45000 end * case when demo_h('rp' || ct.id::text) < 850 then 1 else 0 end, case when demo_h('rp' || ct.id::text) < 850 then 'Efectivo' end,
  now() - make_interval(days => 45 + demo_h('rc' || ct.id::text) % 20), upper(left(md5('lmd:tk' || ct.id::text), 6)),
  case when demo_h('ri' || ct.id::text) < 880 then (current_date - 38 + time '09:20') at time zone 'America/Argentina/Buenos_Aires' + make_interval(mins => demo_h('rm' || ct.id::text) % 90) end,
  case when demo_h('ri' || ct.id::text) < 880 then ${P(3)} end, demo_id(case when ct.age <= 12 then 'tt2' else 'tt1' end), 'app'
from public.contacts ct join public.demo_plan pl on pl.contact_id = ct.id
where ct.church_id = ${C} and ct.created_at < now() - interval '60 days' and demo_h('rg' || pl.hk) < 300 and pl.hk ~ '^\\d+$'
on conflict (id) do nothing;
insert into public.event_registrations (id, event_id, occurs_on, church_id, user_id, name, phone, people, paid_amount, paid_note, created_at, ticket_code, ticket_type_id, source)
select demo_id('rg6' || ct.id::text), demo_id('ev6'), current_date + 23, ${C}, ct.profile_id, ct.name, ct.phone, 2,
  case when demo_h('qp' || ct.id::text) < 550 then 18000 else 0 end, case when demo_h('qp' || ct.id::text) < 550 then 'Efectivo' end,
  now() - make_interval(days => demo_h('qc' || ct.id::text) % 12), upper(left(md5('lmd:tq' || ct.id::text), 6)), demo_id('tt3'), 'app'
from public.contacts ct where ct.church_id = ${C} and ct.marital = 'married' and ct.sex = 'm' and ct.status = 'member' and demo_h('rq' || ct.id::text) < 520
on conflict (id) do nothing;
insert into public.event_speakers (id, church_id, event_id, name, role, bio, sort) values
  (demo_id('es1'), ${C}, demo_id('ev5'), 'Daniel Acosta', 'Pastor asistente', 'Predica en las reuniones de la noche.', 0),
  (demo_id('es2'), ${C}, demo_id('ev6'), 'Ricardo Villalba', 'Pastor', 'Mensaje: "Un hogar sobre la roca".', 0)
on conflict (id) do nothing;
insert into public.event_sessions (id, church_id, event_id, starts_at, ends_at, title, place, speaker_id) values
  (demo_id('en1'), ${C}, demo_id('ev5'), (current_date - 38 + time '20:00') at time zone 'America/Argentina/Buenos_Aires', (current_date - 38 + time '21:30') at time zone 'America/Argentina/Buenos_Aires', 'Fogón y bienvenida', 'Fogón', demo_id('es1')),
  (demo_id('en2'), ${C}, demo_id('ev5'), (current_date - 37 + time '20:00') at time zone 'America/Argentina/Buenos_Aires', (current_date - 37 + time '21:30') at time zone 'America/Argentina/Buenos_Aires', 'Reunión de la noche', 'Salón grande', demo_id('es1')),
  (demo_id('en3'), ${C}, demo_id('ev6'), (current_date + 23 + time '22:00') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '22:45') at time zone 'America/Argentina/Buenos_Aires', 'Mensaje para los matrimonios', 'Salón de la iglesia', demo_id('es2'))
on conflict (id) do nothing;
insert into public.event_session_attendance (session_id, registration_id, event_id, church_id, scanned_at, scanned_by)
select demo_id('en2'), r.id, r.event_id, ${C}, (current_date - 37 + time '19:50') at time zone 'America/Argentina/Buenos_Aires', ${P(3)}
from public.event_registrations r where r.event_id = demo_id('ev5') and r.checked_in_at is not null and demo_h('sa' || r.id::text) < 800 on conflict do nothing;
insert into public.event_team (event_id, profile_id, church_id, role, kind) values
  (demo_id('ev5'), ${P(4)}, ${C}, 'Coordinador', 'organizer'), (demo_id('ev5'), ${P(3)}, ${C}, 'Inscripciones', 'organizer'),
  (demo_id('ev6'), ${P(3)}, ${C}, 'Inscripciones', 'organizer'), (demo_id('ev6'), ${P(13)}, ${C}, 'Cocina', 'volunteer'), (demo_id('ev6'), ${P(2)}, ${C}, 'Cuidado de chicos', 'volunteer'), (demo_id('ev6'), ${P(12)}, ${C}, 'Sonido', 'volunteer')
on conflict do nothing;
insert into public.event_tasks (id, church_id, event_id, title, done, assignee_id, due_on) values
  (demo_id('et1'), ${C}, demo_id('ev5'), 'Reservar el predio', true, ${P(4)}, current_date - 80), (demo_id('et2'), ${C}, demo_id('ev5'), 'Contratar el colectivo', true, ${P(6)}, current_date - 50),
  (demo_id('et3'), ${C}, demo_id('ev5'), 'Comprar la comida', true, ${P(13)}, current_date - 40),
  (demo_id('et4'), ${C}, demo_id('ev6'), 'Definir el menú', true, ${P(13)}, current_date + 2), (demo_id('et5'), ${C}, demo_id('ev6'), 'Armar la lista de canciones', true, ${P(10)}, current_date + 5),
  (demo_id('et6'), ${C}, demo_id('ev6'), 'Comprar los regalos del sorteo', false, ${P(3)}, current_date + 15), (demo_id('et7'), ${C}, demo_id('ev6'), 'Decorar el salón', false, ${P(2)}, current_date + 22),
  (demo_id('et8'), ${C}, demo_id('ev6'), 'Confirmar quién cuida a los chicos', false, ${P(9)}, current_date + 16)
on conflict (id) do nothing;
insert into public.event_shifts (id, church_id, event_id, profile_id, place, starts_at, ends_at, note) values
  (demo_id('eh1'), ${C}, demo_id('ev6'), ${P(13)}, 'Cocina', (current_date + 23 + time '18:30') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '21:30') at time zone 'America/Argentina/Buenos_Aires', null),
  (demo_id('eh2'), ${C}, demo_id('ev6'), ${P(2)}, 'Cuidado de chicos', (current_date + 23 + time '20:15') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '23:30') at time zone 'America/Argentina/Buenos_Aires', 'Aula de Primarios'),
  (demo_id('eh3'), ${C}, demo_id('ev6'), ${P(12)}, 'Sonido', (current_date + 23 + time '19:45') at time zone 'America/Argentina/Buenos_Aires', (current_date + 23 + time '23:30') at time zone 'America/Argentina/Buenos_Aires', null)
on conflict (id) do nothing;
insert into public.event_updates (id, church_id, event_id, body, created_by, created_at) values
  (demo_id('eu1'), ${C}, demo_id('ev5'), 'El colectivo sale 8:00 en punto. No se olviden el repelente.', ${P(4)}, now() - interval '40 days'),
  (demo_id('eu2'), ${C}, demo_id('ev6'), 'Ya van más de la mitad de los lugares. Anótense esta semana.', ${P(3)}, now() - interval '2 days')
on conflict (id) do nothing;
`);

  // ---------------- 07 · devocionales (RV1960) y cierre ----------------
  const devos = [
    ['Mateo 9:37-38', 'Entonces dijo a sus discípulos: A la verdad la mies es mucha, mas los obreros pocos. Rogad, pues, al Señor de la mies, que envíe obreros a su mies.', 'Hay mucho por hacer, y Dios quiere usarte.',
      'Jesús miró a la gente y vio una cosecha lista. No vio un problema: vio personas que necesitaban a Dios.\n\nLo primero que pidió no fue salir corriendo. Pidió orar. El que ora por obreros termina siendo uno.',
      'Pensá en tu cuadra. ¿Cuántos vecinos conocen el evangelio? Jesús dijo: "Por tanto, id, y haced discípulos a todas las naciones, bautizándolos en el nombre del Padre, y del Hijo, y del Espíritu Santo" (Mateo 28:19). Empezá por orar por una persona con nombre y apellido, y esta semana contale lo que Cristo hizo por vos.', 'Señor de la mies, mandá obreros. Y empezá conmigo. Amén.'],
    ['Salmos 23:1', 'Jehová es mi pastor; nada me faltará.', 'Si él te cuida, no te va a faltar lo que de verdad necesitás.',
      'Una oveja no se cuida sola. Necesita un pastor que la guíe, la alimente y la defienda.\n\nDavid había sido pastor. Sabía de qué hablaba. Y dijo: el Señor es MI pastor.',
      'No dice "nada voy a querer". Dice "nada me faltará". Dios no promete darte todo lo que pedís, pero sí todo lo que te hace falta. Hoy, cuando aparezca una preocupación, decilo en voz alta: "Jehová es mi pastor".', 'Señor, gracias por cuidarme. Hoy confío en vos. Amén.'],
    ['Filipenses 4:6-7', 'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias. Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.', 'Cambiá la preocupación por oración.',
      'La preocupación da vueltas en la cabeza y no arregla nada. La oración lleva el problema a quien sí puede.\n\nDios no promete sacarte el problema hoy. Promete darte su paz mientras tanto.',
      'Fijate en el orden: primero orar, con gracias, y después llega la paz. Hacé una lista corta de lo que hoy te quita el sueño. Contale cada cosa a Dios y dale gracias por algo concreto. La Biblia dice: "echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros" (1 Pedro 5:7).', 'Padre, te dejo mis cargas. Dame tu paz. Amén.'],
    ['Juan 3:16', 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.', 'Dios te amó primero, y lo demostró.',
      'El amor de Dios no fue una palabra: fue un regalo. Dio a su Hijo.\n\n"Todo aquel" te incluye a vos. No hay que ganárselo. Hay que creer.',
      'La salvación es un regalo: "Porque por gracia sois salvos por medio de la fe; y esto no de vosotros, pues es don de Dios; no por obras, para que nadie se gloríe" (Efesios 2:8-9). Si ya creíste, dale gracias. Y pensá a quién le podés contar este versículo hoy.', 'Gracias, Señor, por amarme así. Ayudame a contarlo. Amén.'],
    ['Proverbios 3:5-6', 'Fíate de Jehová de todo tu corazón, Y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, Y él enderezará tus veredas.', 'Confiá en Dios más que en lo que a vos te parece.',
      'Muchas veces creemos saber qué conviene. Pero no vemos todo el camino. Dios sí.\n\nReconocerlo en todos los caminos es preguntarle antes de decidir, no después.',
      '¿Hay una decisión que venís tomando solo? El trabajo, la plata, los hijos. Hoy ponela delante de Dios. Buscá qué dice su Palabra y pedí consejo a un hermano maduro. Él promete enderezar el camino.', 'Señor, no quiero apoyarme en mi idea. Guiame vos. Amén.'],
    ['Mateo 11:28', 'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.', 'El descanso no es un lugar: es una Persona.',
      'Jesús no dijo "vayan a descansar". Dijo "vengan a mí".\n\nHay un cansancio que no se va durmiendo: el de la culpa, el de cargar todo solo. Ese cansancio se lo llevás a él.',
      'Si estás cansado, no esperes a estar mejor para orar. Vení como estás. Contale qué te pesa. Jesús no rechaza al que viene. Hoy apartá diez minutos, apagá el teléfono y hablá con él.', 'Señor Jesús, vengo a vos cansado. Dame tu descanso. Amén.'],
    ['Josué 1:9', 'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas.', 'No sos valiente porque sos fuerte, sino porque Dios va con vos.',
      'Josué tenía una tarea enorme y un pueblo difícil. Dios no le dijo que iba a ser fácil. Le dijo que iba a estar con él.\n\nEl valor del creyente no sale de mirarse a sí mismo. Sale de saber quién lo acompaña.',
      '¿Qué te da miedo esta semana? Una charla, un estudio médico, un trabajo nuevo. Dios promete lo mismo: "No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia" (Isaías 41:10).', 'Señor, gracias porque vas conmigo. Dame valor. Amén.'],
    ['Salmos 119:105', 'Lámpara es a mis pies tu palabra, Y lumbrera a mi camino.', 'La Biblia alumbra el paso de hoy.',
      'Una lámpara no muestra todo el camino. Muestra dónde poner el pie ahora.\n\nDios no siempre te muestra el año entero. Pero su Palabra alcanza para el paso de hoy.',
      'El que no lee camina a oscuras. Elegí una hora fija para leer, aunque sean diez minutos. Empezá por un Evangelio. "Toda la Escritura es inspirada por Dios, y útil para enseñar, para redargüir, para corregir, para instruir en justicia" (2 Timoteo 3:16).', 'Señor, abrí mis ojos cuando leo tu Palabra. Amén.'],
    ['Romanos 8:28', 'Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.', 'Dios usa hasta lo que duele.',
      'No dice que todo es bueno. Dice que Dios hace que todo ayude a bien.\n\nComo en una receta: la harina sola no es rica, pero el que cocina sabe para qué la usa.',
      'Quizás hoy no entendés lo que te pasa. José tampoco entendía cuando lo vendieron sus hermanos, y años después vio el plan de Dios. Dale gracias aunque todavía no veas el final, y seguí haciendo lo correcto.', 'Padre, confío en que vos sabés lo que hacés. Amén.'],
    ['1 Juan 1:9', 'Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados, y limpiarnos de toda maldad.', 'No escondas el pecado: confesalo.',
      'Esconder el pecado es como tapar una herida sucia. No se cura.\n\nConfesar es decirle a Dios lo mismo que él ya sabe, sin excusas.',
      'Dios promete dos cosas: perdonar y limpiar. No te perdona de mala gana: es fiel y justo, porque Cristo ya pagó. Si hay algo sin arreglar, hacelo hoy. Y si ofendiste a alguien, andá y pedile perdón.', 'Señor, te confieso mi pecado. Gracias por perdonarme. Amén.'],
    ['Mateo 6:33', 'Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.', 'Poné a Dios primero y él se ocupa de lo demás.',
      'Jesús hablaba de la comida y de la ropa: lo de todos los días. No dijo que no importan. Dijo qué va primero.\n\nCuando Dios ocupa el primer lugar, lo demás se ordena.',
      'Mirá tu semana. ¿Qué lugar tienen la reunión, la oración, servir a otros? Lo primero se nota en la agenda y en la billetera. Hacé un cambio concreto: uno solo, pero hoy.', 'Señor, quiero buscarte primero. Ordená mi vida. Amén.'],
    ['Hebreos 10:25', 'no dejando de congregarnos, como algunos tienen por costumbre, sino exhortándonos; y tanto más, cuanto veis que aquel día se acerca.', 'No estás hecho para vivir la fe solo.',
      'Una brasa sola se apaga. Junto a otras, sigue encendida.\n\nIr a la reunión no es un trámite. Es donde te animan y donde vos animás a otro.',
      'David dijo: "Yo me alegré con los que me decían: A la casa de Jehová iremos" (Salmos 122:1). Este domingo no vayas solo a recibir. Buscá a alguien que faltó, mandale un mensaje e invitalo a volver.', 'Señor, gracias por mi iglesia. Usame para animar a alguien. Amén.'],
    ['2 Corintios 5:17', 'De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.', 'En Cristo no sos una versión mejorada: sos nuevo.',
      'Dios no remienda la vida vieja. Da una nueva.\n\nTu pasado ya no te define. Lo que te define es estar en Cristo.',
      'Si el enemigo te recuerda lo que fuiste, recordale lo que Cristo hizo. Y viví como nuevo: dejá hoy un hábito de la vida vieja y empezá uno de la nueva, como leer la Biblia o pedir perdón rápido.', 'Gracias, Señor, por hacerme nuevo. Ayudame a vivir así. Amén.'],
    ['Isaías 40:31', 'pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.', 'Esperar en Dios no es perder tiempo: es cargar fuerzas.',
      'Hasta los jóvenes se cansan. Pero hay una fuerza que no sale de nosotros.\n\nEsperar a Jehová es confiar en él mientras seguís caminando.',
      'A veces Dios te hace volar, a veces correr y muchas veces solo caminar sin aflojar. Las tres cosas son su fuerza. Si hoy solo podés caminar, caminá. "Jehová es mi luz y mi salvación; ¿de quién temeré? Jehová es la fortaleza de mi vida; ¿de quién he de atemorizarme?" (Salmos 27:1).', 'Señor, espero en vos. Renová mis fuerzas hoy. Amén.'],
  ];
  batch('07_devocionales_y_cierre', `
insert into public.daily_content (id, church_id, on_date, reference, verse, message, devotional, background, created_by, study, prayer)
select demo_id('dv' || g::text), ${C}, current_date - g, v.reference, v.verse, v.message, v.devotional, 'auto', ${P(1)}, v.study, v.prayer
from generate_series(0, 20) g join (values
${devos.map(([ref, verse, msg, dev, study, prayer], i) => `  (${i}, ${q(ref)}, ${q(verse)}, ${q(msg)}, ${q(dev)}, ${q(study)}, ${q(prayer)})`).join(',\n')}
) v(i, reference, verse, message, devotional, study, prayer) on v.i = (20 - g) % ${devos.length}
on conflict (church_id, on_date) do nothing;
update public.demo_churches set seeded_at = now() where church_id = ${C} and seeded_at is null;
select public.demo_echo(${C}, current_date);
`);

  // ---------------- 08 · informes semanales de los últimos domingos ----------------
  batch('08_informes', `
set local session_replication_role = origin;
select public.run_weekly_report(${C}, (${SUN} - 7 * g + time '21:00')::timestamp) from generate_series(1, 6) g;
`);
}
