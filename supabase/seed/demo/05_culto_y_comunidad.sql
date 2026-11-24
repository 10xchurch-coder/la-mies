-- 05_culto_y_comunidad · datos de ejemplo (generado por scripts/demo-seed.mjs; no editar a mano)
begin;
set local session_replication_role = replica;
insert into public.songs (id, church_id, title, author, lyrics, song_key, position, created_by) values
  (demo_id('so0'), demo_c(), 'Gracias, Señor', 'Canción de ejemplo', 'Gracias, Señor, por este día,
por tu cuidado y tu amor.
Gracias, Señor, por tu alegría,
gracias por ser mi Salvador.

Te canto hoy con todo el corazón,
porque tu amor no tiene fin.
Te canto hoy, mi Dios y mi Señor,
y vivo solo para ti.', 'Do', 0, demo_p(10)),
  (demo_id('so1'), demo_c(), 'En tus manos estoy', 'Canción de ejemplo', 'En tus manos estoy, nada temeré.
En tus manos estoy, siempre confiaré.

Si el camino es largo, vos venís conmigo.
Si la noche es fría, sos mi buen amigo.

En tus manos estoy, nada temeré.
En tus manos estoy, siempre confiaré.', 'Sol', 1, demo_p(10)),
  (demo_id('so2'), demo_c(), 'La mies es mucha', 'Canción de ejemplo', 'La mies es mucha, hay que salir,
hay tanta gente sin oír.
Señor, enviame, quiero ir,
de tu gran amor decir.

Por cada calle, por cada hogar,
tu buena nueva voy a llevar.', 'Re', 2, demo_p(10)),
  (demo_id('so3'), demo_c(), 'Venimos a tu casa', 'Canción de ejemplo', 'Venimos a tu casa con alegría,
venimos a tu casa a adorar.
Grandes y chicos, toda la familia,
juntos te queremos alabar.

Santo, santo es el Señor.
Digno, digno de loor.', 'La', 3, demo_p(10)),
  (demo_id('so4'), demo_c(), 'Tu palabra es luz', 'Canción de ejemplo', 'Tu palabra es luz en mi camino,
tu palabra es verdad.
La guardo en mi corazón,
la quiero cada día más.

Hablame, Señor, que quiero escuchar.
Guiame, Señor, te quiero obedecer.', 'Mi', 4, demo_p(10)),
  (demo_id('so5'), demo_c(), 'Fiel es mi Dios', 'Canción de ejemplo', 'Fiel es mi Dios, nunca falló.
Fiel es mi Dios, me sostendrá.
Cada mañana su amor renovó.
Fiel es mi Dios, y fiel será.', 'Do', 5, demo_p(10))
on conflict (id) do nothing;
insert into public.service_plans (id, church_id, service_date, title, items, people, created_by)
select demo_id('sp' || d::text), demo_c(), d, 'Culto del domingo a la mañana',
  jsonb_build_array(jsonb_build_object('id', 'i0', 'type', 'prayer', 'title', 'Oración de apertura', 'songId', null, 'ref', null, 'whoId', demo_p(4)::text, 'whoName', 'Daniel Acosta', 'note', null),
  jsonb_build_object('id', 'i1', 'type', 'song', 'title', 'Venimos a tu casa', 'songId', demo_id('so3')::text, 'ref', null, 'whoId', demo_p(10)::text, 'whoName', 'Gustavo Romero', 'note', null),
  jsonb_build_object('id', 'i2', 'type', 'song', 'title', 'Gracias, Señor', 'songId', demo_id('so0')::text, 'ref', null, 'whoId', demo_p(10)::text, 'whoName', 'Gustavo Romero', 'note', null),
  jsonb_build_object('id', 'i3', 'type', 'notices', 'title', 'Anuncios de la semana', 'songId', null, 'ref', null, 'whoId', demo_p(3)::text, 'whoName', 'Marta Quiroga', 'note', null),
  jsonb_build_object('id', 'i4', 'type', 'offering', 'title', 'Ofrenda', 'songId', null, 'ref', null, 'whoId', demo_p(5)::text, 'whoName', 'Rubén Sosa', 'note', null),
  jsonb_build_object('id', 'i5', 'type', 'song', 'title', 'Fiel es mi Dios', 'songId', demo_id('so5')::text, 'ref', null, 'whoId', demo_p(10)::text, 'whoName', 'Gustavo Romero', 'note', null),
  jsonb_build_object('id', 'i6', 'type', 'reading', 'title', 'Lectura bíblica', 'songId', null, 'ref', 'Salmos 23', 'whoId', demo_p(2)::text, 'whoName', 'Lucía Benítez', 'note', null),
  jsonb_build_object('id', 'i7', 'type', 'sermon', 'title', 'Prédica', 'songId', null, 'ref', null, 'whoId', demo_p(1)::text, 'whoName', 'Ricardo Villalba', 'note', null),
  jsonb_build_object('id', 'i8', 'type', 'song', 'title', 'En tus manos estoy', 'songId', demo_id('so1')::text, 'ref', null, 'whoId', demo_p(10)::text, 'whoName', 'Gustavo Romero', 'note', null),
  jsonb_build_object('id', 'i9', 'type', 'prayer', 'title', 'Oración final', 'songId', null, 'ref', null, 'whoId', demo_p(1)::text, 'whoName', 'Ricardo Villalba', 'note', null)),
  array[demo_p(1), demo_p(2), demo_p(3), demo_p(4), demo_p(5), demo_p(10)], demo_p(1)
from (values ((current_date - extract(dow from current_date)::int) - 7), ((current_date - extract(dow from current_date)::int))) v(d) on conflict (id) do nothing;
insert into public.sermons (id, church_id, title, preacher, preached_on, passage, summary, notes_outline, created_by, created_at)
select demo_id('sr' || v.i::text), demo_c(), v.title, case when v.i % 4 = 3 then 'Daniel Acosta' else 'Ricardo Villalba' end, (current_date - extract(dow from current_date)::int) - 7 * v.i, v.passage, v.summary, v.outline, demo_p(1), ((current_date - extract(dow from current_date)::int) - 7 * v.i) + time '15:00'
from (values
  (0, 'El buen pastor', 'Salmos 23', 'Dios cuida a los suyos como un pastor cuida a sus ovejas.', 'El Señor es mi ___.
Con él nada me ___.
Él me guía por sendas de ___.
Aunque pase por el valle, no ___ mal alguno.'),
  (1, 'Nacer de nuevo', 'Juan 3:1-16', 'Ser religioso no alcanza: hay que nacer de nuevo.', 'Nicodemo era un hombre muy ___.
Jesús le dijo: te es necesario nacer de ___.
Dios amó tanto al mundo que dio a su ___.
El que cree en él tiene vida ___.'),
  (2, 'La casa sobre la roca', 'Mateo 7:24-27', 'No alcanza con oír: hay que hacer lo que Jesús dice.', 'Los dos hombres ___ la palabra.
Solo uno la puso en ___.
La tormenta llega para ___.
La roca es ___.'),
  (3, 'Venid a mí', 'Mateo 11:28-30', 'Jesús invita a los cansados a descansar en él.', 'Jesús llama a los ___ y cargados.
Él promete hacernos ___.
Su yugo es ___.
Su carga es ___.'),
  (4, 'La mies es mucha', 'Mateo 9:35-38', 'Jesús vio a la gente y tuvo compasión. Nosotros también tenemos que ir.', 'Jesús recorría las ciudades y las ___.
Al ver a la gente tuvo ___.
La mies es mucha, pero los obreros son ___.
Roguemos al Señor que envíe ___.'),
  (5, 'Una fe que obra', 'Santiago 2:14-26', 'La fe verdadera se nota en lo que hacemos.', 'La fe sin obras está ___.
Abraham mostró su fe cuando ___.
No nos salvan las obras: nos salva ___.
Pero el que es salvo quiere ___.'),
  (6, 'El hijo que volvió', 'Lucas 15:11-24', 'El Padre espera con los brazos abiertos al que vuelve.', 'El hijo menor pidió su ___.
Lejos de casa lo perdió ___.
Volvió en sí y dijo: me levantaré e iré a mi ___.
El padre corrió y lo ___.'),
  (7, 'No se afanen', 'Mateo 6:25-34', 'El Padre sabe lo que necesitamos.', 'Miren las ___ del cielo.
Nuestro Padre sabe lo que ___.
Busquemos primero el reino de ___.
Cada día tiene su propio ___.'),
  (8, 'Firmes en la prueba', 'Santiago 1:2-12', 'Dios usa las pruebas para hacernos crecer.', 'La prueba produce ___.
Si nos falta sabiduría, hay que ___.
Hay que pedir con ___.
El que resiste recibirá la corona de ___.'),
  (9, 'Sal y luz', 'Mateo 5:13-16', 'El creyente se tiene que notar donde vive y trabaja.', 'Ustedes son la ___ de la tierra.
Ustedes son la ___ del mundo.
Una luz no se pone debajo de un ___.
Que vean nuestras buenas obras y den gloria al ___.'),
  (10, 'La oración que Dios escucha', 'Lucas 18:9-14', 'Dios recibe al humilde y resiste al orgulloso.', 'Dos hombres subieron al templo a ___.
El fariseo confiaba en sí ___.
El publicano pidió ___.
El que se humilla será ___.'),
  (11, 'Id y haced discípulos', 'Mateo 28:16-20', 'La tarea que Jesús nos dejó, y su promesa de estar con nosotros.', 'Toda potestad le fue dada a ___.
La orden es ir y hacer ___.
Hay que bautizar y ___.
Él está con nosotros todos los ___.')
) v(i, title, passage, summary, outline) on conflict (id) do nothing;
insert into public.sermon_notes (sermon_id, user_id, answers, notes) values
  (demo_id('sr1'), demo_p(2), '["religioso","nuevo","Hijo","eterna"]'::jsonb, 'Contarle esto a mi vecina.'),
  (demo_id('sr2'), demo_p(2), '["oyeron","práctica","todos"]'::jsonb, null)
on conflict do nothing;
insert into public.announcements (id, church_id, author_id, title, body, audience, sent_to, created_at) values
  (demo_id('an0'), demo_c(), demo_p(1), 'Cena de matrimonios', 'Ya están abiertas las inscripciones para la cena de matrimonios. Anotate desde Eventos. Hay lugar para 60 personas.', 'all', 14, now() - interval '2 days'),
  (demo_id('an1'), demo_c(), demo_p(3), 'Limpieza general del salón', 'El sábado a las 8:30 hacemos limpieza general. Traé guantes y ganas. Después compartimos unos mates.', 'all', 14, now() - interval '9 days'),
  (demo_id('an2'), demo_c(), demo_p(1), 'Clase de miembros', 'El domingo que viene empieza una clase de miembros nueva, después del culto de la mañana. Hablá con el pastor si querés participar.', 'all', 14, now() - interval '16 days'),
  (demo_id('an3'), demo_c(), demo_p(3), 'Ofrenda misionera', 'Este domingo juntamos la ofrenda misionera del mes. Gracias por dar con alegría.', 'all', 14, now() - interval '23 days'),
  (demo_id('an4'), demo_c(), demo_p(4), 'Salida de evangelismo', 'El sábado salimos a visitar el Barrio Norte. Nos juntamos en el salón a las 9:30.', 'all', 14, now() - interval '30 days'),
  (demo_id('an5'), demo_c(), demo_p(1), 'Bautismos', 'El último domingo del mes hay bautismos. Si creíste en Cristo y todavía no te bautizaste, hablá con el pastor.', 'all', 14, now() - interval '37 days'),
  (demo_id('an6'), demo_c(), demo_p(3), 'Ropa de abrigo', 'Estamos juntando ropa de abrigo para dos familias del barrio. Dejala en la entrada del salón.', 'all', 14, now() - interval '44 days'),
  (demo_id('an7'), demo_c(), demo_p(1), 'Reunión de maestros', 'El miércoles, después de la reunión de oración, nos quedamos los maestros para armar el trimestre.', 'all', 14, now() - interval '51 days')
on conflict (id) do nothing;
insert into public.prayer_requests (id, church_id, user_id, body, visibility, anonymous, answered_at, answer_note, created_at) values
  (demo_id('pr0'), demo_c(), demo_p(2), 'Por la operación de mi mamá, que es el jueves.', 'church', false, null, null, now() - interval '1 days'),
  (demo_id('pr1'), demo_c(), demo_p(13), 'Por mi nieto, que empiece a venir a la iglesia.', 'church', false, null, null, now() - interval '3 days'),
  (demo_id('pr2'), demo_c(), demo_p(12), 'Estoy buscando trabajo. Pidan conmigo que el Señor abra una puerta.', 'church', false, now() - interval '3 days', 'Entré a trabajar en una ferretería. ¡Gracias por orar!', now() - interval '5 days'),
  (demo_id('pr3'), demo_c(), demo_p(9), 'Por los chicos de la clase de Primarios, que entiendan el evangelio.', 'church', false, null, null, now() - interval '8 days'),
  (demo_id('pr4'), demo_c(), demo_p(14), 'Por mis exámenes de la facultad.', 'church', false, now() - interval '6 days', 'Aprobé los dos. Gracias, hermanos.', now() - interval '12 days'),
  (demo_id('pr5'), demo_c(), demo_p(2), 'Pastor, ore por mi esposo, está pasando un tiempo difícil en el trabajo.', 'pastor', false, null, null, now() - interval '15 days'),
  (demo_id('pr6'), demo_c(), demo_p(6), 'Por las familias que visitamos el sábado, que vengan el domingo.', 'church', false, now() - interval '13 days', 'Dos de las familias vinieron el domingo.', now() - interval '20 days'),
  (demo_id('pr7'), demo_c(), demo_p(11), 'Por una decisión importante que tengo que tomar.', 'church', true, null, null, now() - interval '27 days'),
  (demo_id('pr8'), demo_c(), demo_p(5), 'Por el salón propio: que el Señor provea el terreno.', 'church', false, null, null, now() - interval '34 days'),
  (demo_id('pr9'), demo_c(), demo_p(10), 'Por mi papá, que está internado.', 'church', false, now() - interval '36 days', 'Ya está en casa y recuperándose bien.', now() - interval '41 days'),
  (demo_id('pr10'), demo_c(), demo_p(3), 'Por los misioneros y sus familias.', 'church', false, null, null, now() - interval '48 days')
on conflict (id) do nothing;
insert into public.prayer_prayed (request_id, user_id)
select r.id, p.id from public.prayer_requests r join public.profiles p on p.church_id = r.church_id and p.id <> r.user_id
where r.church_id = demo_c() and r.visibility = 'church' and demo_h('pp' || r.id::text || p.id::text) < 420 on conflict do nothing;
insert into public.bible_questions (id, church_id, user_id, body, status, answer, answered_by, answered_at, created_at) values
  (demo_id('bq0'), demo_c(), demo_p(14), '¿Qué quiere decir "nacer de nuevo"?', 'answered', 'Es lo que Dios hace en una persona cuando cree en Cristo: le da una vida nueva. No es algo que hacemos nosotros; es un regalo. Leé Juan 3 y lo charlamos el domingo.', demo_p(1), now() - interval '6 days', now() - interval '8 days'),
  (demo_id('bq1'), demo_c(), null, '¿Por qué nos bautizamos si ya somos salvos?', 'answered', 'El bautismo no salva. Es obedecer a Jesús y contarles a todos que creímos en él.', demo_p(1), now() - interval '18 days', now() - interval '20 days'),
  (demo_id('bq2'), demo_c(), demo_p(2), '¿Cómo puedo enseñarles a orar a mis hijos?', 'new', null, null, null, now() - interval '2 days'),
  (demo_id('bq3'), demo_c(), null, '¿Qué versículo puedo leer cuando tengo miedo?', 'new', null, null, null, now() - interval '1 days')
on conflict (id) do nothing;
insert into public.suggestions (id, church_id, user_id, body, anonymous, status, reply, created_at) values
  (demo_id('sg0'), demo_c(), demo_p(12), '¿Podemos poner un cartel más grande en la entrada? De noche no se ve.', false, 'done', 'Buena idea. Ya lo encargamos.', now() - interval '25 days'),
  (demo_id('sg1'), demo_c(), demo_p(2), 'Estaría bueno tener una merienda para las mamás una vez por mes.', false, 'seen', null, now() - interval '9 days'),
  (demo_id('sg2'), demo_c(), null, 'Que el culto de la noche empiece puntual, por favor.', true, 'new', null, now() - interval '3 days')
on conflict (id) do nothing;
insert into public.church_chat_messages (id, church_id, user_id, body, created_at, kind) values
  (demo_id('ch0'), demo_c(), demo_p(3), 'Buen día, hermanos. Les recuerdo que el miércoles hay reunión de oración a las 20.', now() - interval '7 hours', 'text'),
  (demo_id('ch1'), demo_c(), demo_p(10), 'Buen día. Ahí estaremos.', now() - interval '10 hours', 'text'),
  (demo_id('ch2'), demo_c(), demo_p(6), 'El colectivo de la Ruta Norte sale 9:10 el domingo. Avisen si alguien más necesita que lo pasemos a buscar.', now() - interval '53 hours', 'text'),
  (demo_id('ch3'), demo_c(), demo_p(2), 'Gracias, Hugo. Nosotros vamos por nuestra cuenta.', now() - interval '55 hours', 'text'),
  (demo_id('ch4'), demo_c(), demo_p(8), 'Hermosa salida la de ayer. Visitamos 24 casas y dos familias prometieron venir.', now() - interval '122 hours', 'text'),
  (demo_id('ch5'), demo_c(), demo_p(1), '¡Gloria a Dios! Gracias a todos los que salieron.', now() - interval '125 hours', 'text'),
  (demo_id('ch6'), demo_c(), demo_p(13), 'Estuve orando por ustedes toda la mañana.', now() - interval '127 hours', 'text'),
  (demo_id('ch7'), demo_c(), demo_p(9), 'Maestros: ya están cargadas las lecciones del mes en la app.', now() - interval '228 hours', 'text'),
  (demo_id('ch8'), demo_c(), demo_p(11), '¡Gracias, Sofía!', now() - interval '230 hours', 'text'),
  (demo_id('ch9'), demo_c(), demo_p(5), 'Se cumplió la meta de la ofrenda misionera de este mes. Gracias por dar.', now() - interval '317 hours', 'text'),
  (demo_id('ch10'), demo_c(), demo_p(12), '¿Alguien tiene un alargue para prestar el domingo? El nuestro se rompió.', now() - interval '418 hours', 'text'),
  (demo_id('ch11'), demo_c(), demo_p(14), 'Yo llevo uno.', now() - interval '420 hours', 'text'),
  (demo_id('ch12'), demo_c(), demo_p(4), 'No se olviden de orar por los hermanos que están enfermos. La lista está en Oración.', now() - interval '511 hours', 'text'),
  (demo_id('ch13'), demo_c(), demo_p(7), 'La Ruta Sur trajo 14 personas hoy. ¡Sigamos invitando!', now() - interval '605 hours', 'text')
on conflict (id) do nothing;
insert into public.ministry_messages (id, church_id, ministry_id, user_id, kind, body, created_at) values
  (demo_id('mg0'), demo_c(), demo_id('m2'), demo_p(5), 'announcement', 'Este domingo esperamos visitas. Lleguen 9:30 para recibir a todos con tiempo.', now() - interval '3 days'),
  (demo_id('mg1'), demo_c(), demo_id('m2'), demo_p(2), 'message', 'Listo, ahí voy a estar.', now() - interval '70 hours'),
  (demo_id('mg2'), demo_c(), demo_id('m3'), demo_p(9), 'announcement', 'Maestros: repasen el versículo de memoria con los chicos antes de la lección.', now() - interval '5 days'),
  (demo_id('mg3'), demo_c(), demo_id('m3'), demo_p(11), 'message', 'Los Párvulos ya saben Génesis 1:1 de memoria.', now() - interval '4 days'),
  (demo_id('mg4'), demo_c(), demo_id('m1'), demo_p(10), 'message', 'Ensayo el viernes a las 20. Vemos dos canciones nuevas.', now() - interval '2 days'),
  (demo_id('mg5'), demo_c(), demo_id('m6'), demo_p(8), 'announcement', 'El sábado visitamos el Barrio Norte. Traigan folletos.', now() - interval '4 days')
on conflict (id) do nothing;
insert into public.dm_messages (id, church_id, sender_id, recipient_id, kind, body, read_at, created_at) values
  (demo_id('dm0'), demo_c(), demo_p(9), demo_p(2), 'text', 'Lucía, ¿podés cubrirme en Primarios el domingo que viene?', now() - interval '46 hours', now() - interval '2 days'),
  (demo_id('dm1'), demo_c(), demo_p(2), demo_p(9), 'text', 'Sí, contá conmigo. ¿Qué lección toca?', now() - interval '45 hours', now() - interval '46 hours'),
  (demo_id('dm2'), demo_c(), demo_p(9), demo_p(2), 'text', 'David y el gigante. Está cargada en la app. ¡Gracias!', null, now() - interval '5 hours'),
  (demo_id('dm3'), demo_c(), demo_p(3), demo_p(1), 'text', 'Pastor, ya están los informes del mes en la app.', null, now() - interval '9 hours'),
  (demo_id('dm4'), demo_c(), demo_p(5), demo_p(1), 'text', 'Pastor, el lunes paso a dejarle los comprobantes.', now() - interval '3 days', now() - interval '4 days')
on conflict (id) do nothing;
insert into public.pastor_messages (id, church_id, member_id, sender_id, body, read_at, created_at) values
  (demo_id('pm0'), demo_c(), demo_p(2), demo_p(2), 'Pastor, ¿podemos hablar el domingo después del culto? Es por mi esposo.', now() - interval '6 days', now() - interval '7 days'),
  (demo_id('pm1'), demo_c(), demo_p(2), demo_p(1), 'Claro, Lucía. Los espero a los dos. Estoy orando por ustedes.', now() - interval '6 days', now() - interval '160 hours'),
  (demo_id('pm2'), demo_c(), demo_p(2), demo_p(2), 'Gracias, pastor.', null, now() - interval '20 hours'),
  (demo_id('pm3'), demo_c(), demo_p(14), demo_p(14), 'Pastor, quiero bautizarme. ¿Qué tengo que hacer?', null, now() - interval '30 hours')
on conflict (id) do nothing;
insert into public.notifications (id, church_id, user_id, kind, title, body, link, created_at, read_at)
select demo_id('nt' || v.n::text || u.id::text), demo_c(), u.id, v.kind, v.title, v.body, v.link, now() - v.ago, case when v.n > 2 then now() - v.ago + interval '3 hours' end
from (values (demo_p(1)), (demo_p(2))) u(id) cross join (values
  (1, 'announcement', 'Cena de matrimonios', 'Ya están abiertas las inscripciones.', '/anuncios', interval '2 days'),
  (2, 'duty', 'El domingo servís en bienvenida', 'Bienvenida en la puerta. Llegá a las 09:30.', '/ministerios', interval '1 day'),
  (3, 'prayer', 'Pedido de oración nuevo', 'Por mi nieto, que empiece a venir a la iglesia.', '/oracion', interval '3 days'),
  (4, 'event', 'Falta poco para la cena de matrimonios', 'Revisá el horario y qué hay que llevar.', '/eventos', interval '5 days'),
  (5, 'announcement', 'Limpieza general del salón', 'El sábado a las 8:30.', '/anuncios', interval '9 days')
) v(n, kind, title, body, link, ago) on conflict (id) do nothing;
insert into public.missionaries (id, church_id, name, field, bio, position) values
  (demo_id('mi0'), demo_c(), 'Familia Altamirano', 'Norte de Santa Cruz', 'Una familia de ejemplo. Abrieron una obra nueva hace tres años y ya se reúnen cuarenta personas.', 0),
  (demo_id('mi1'), demo_c(), 'Familia Olmedo', 'Pueblos del monte chaqueño', 'Una familia de ejemplo. Visitan cinco parajes por mes y reparten Biblias.', 1)
on conflict (id) do nothing;
insert into public.missionary_reports (id, church_id, missionary_id, month, title, summary, created_by, created_at)
select demo_id('mr' || m.n::text || k::text), demo_c(), demo_id('mi' || m.n::text), (date_trunc('month', current_date) - make_interval(months => k))::date,
  case k when 0 then 'Carta de este mes' else 'Carta del mes pasado' end, m.txt, demo_p(3), now() - make_interval(days => 4 + 30 * k)
from (values (0, 'Este mes se bautizaron tres personas. Empezamos una clase de chicos los sábados. Oren por un lugar más grande para reunirnos.'),
             (1, 'Visitamos dos parajes nuevos. Una familia entera creyó en Cristo. Oren por la camioneta, que necesita arreglo.')) m(n, txt)
cross join generate_series(0, 1) k on conflict (id) do nothing;
insert into public.reading_log (user_id, on_date)
select p.id, current_date - g from public.profiles p cross join generate_series(0, 40) g
where p.church_id = demo_c() and (g <= demo_h('rs' || p.id::text) % 20 or demo_h('rl' || p.id::text || g::text) < 450) on conflict do nothing;
insert into public.bible_plans (profile_id, plan, started_on, done) values
  (demo_p(2), 'new90', current_date - 20, array(select generate_series(1, 19))), (demo_p(1), 'bible', current_date - 60, array(select generate_series(1, 58)))
on conflict (profile_id) do nothing;
insert into public.daily_likes (church_id, on_date, user_id)
select demo_c(), current_date - g, p.id from public.profiles p cross join generate_series(0, 6) g
where p.church_id = demo_c() and demo_h('lk' || p.id::text || g::text) < 500 on conflict do nothing;
insert into public.daily_comments (id, church_id, on_date, user_id, body, created_at) values
  (demo_id('dcm0'), demo_c(), current_date, demo_p(13), 'Amén. Justo lo que necesitaba leer hoy.', now() - interval '2 hours'),
  (demo_id('dcm1'), demo_c(), current_date, demo_p(10), 'Gracias por el devocional.', now() - interval '1 hours'),
  (demo_id('dcm2'), demo_c(), current_date - 1, demo_p(2), 'Lo leímos en familia en el desayuno.', now() - interval '26 hours')
on conflict (id) do nothing;
commit;
