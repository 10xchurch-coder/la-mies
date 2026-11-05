# La Mies — spec (what is built, version 0.2)

## Roles
- **Miembro** — goes out, marks houses, sees own + shared contacts, team live view, scoreboard, progress, training.
- **Capitán** — plus: attendance / discipleship / baptism marks, pastor panel (read).
- **Administrador** — plus: all contacts of the church, roles and groups, join code.
- **Administrador de la red** (database flag) — totals across churches via `network_summary()`; screen is Phase 3.

Churches choose how they organize: **colectivos** (bus routes), **grupos**, or **none** (`churches.grouping`).
The app changes the wording accordingly.

## The outing (salida)
1. *Iniciar salida* → permissions (location while using, then Always; notifications) → `start_session()` → background GPS starts.
2. Every 5 s / 6 m a GPS point is stored locally; every 30 s or 8 points they upload (`upload_track_points`), which also updates the member's live position.
3. The app matches the current point to the nearest street segment (within 25 m) and shows **Vereda norte/sur/este/oeste**, detected by GPS; one tap flips it and the correction applies from 20 s before the tap on that street.
4. Every 60 s the covered street sides are recomputed from all points (a side counts after 2 points on the same segment) and uploaded (`upsert_coverage`, idempotent).
5. **Vehicle detection:** ≥ 20 km/h for ≥ 4 consecutive points and ≥ 20 s → `trim_session(cutoff = last walking point, auto)`, tracking stops, notification.
6. *Finalizar* → final upload, `end_session(distance, blocks)` computes presentations / promises / houses for the outing.
7. *Me olvidé de apagarla* (during or after) → pick the time really stopped → `trim_session`: points and coverage after the cutoff are deleted and the affected street sides are recomputed from remaining history.

## Map
- One line per **street side**, offset 3.2 m from the street axis, colored by **when it was last covered** (today green, this week blue, this month light blue, older gray). Never by person.
- Tap a side → popup (who, when, how many times) → full history.
- Houses marked are pins; live members are green dots with their name.

## Marking a house (2 steps)
1. Person: name, age, sex, marital status, children (names + ages), phone.
2. Visit: gospel presented?, how they responded (4 levels), promised to come (sat/sun/not yet), pickup with time, notes, sharing (all my group / only me / chosen people). Administrators always see everything.

## Counted and shown
Presentations, promises, came to church (attendance by captain), discipleship started, baptisms, outings, members out, minutes, km, blocks, houses marked.
**Points:** presentation 1 · promise 3 · came 10. Blocks never count. Baptisms and discipleship are reported, not scored.

## Levels (by finished outings)
Sembrador 1 · Regador 5 · Segador 12 · Obrero fiel 20 · Embajador 40 · Pescador de hombres 80. Weekly streak and badges in `src/lib/levels.ts`.

## Pastor panel
Period: last outing / week / month. Totals, pending pickups (promised but never came), members table, outings list, join code (share / rotate), roles and groups.

## Version 0.2 — the whole church
- **Tabs:** Mapa · Personas · Iglesia · Prédicas · Yo.
- **Roles:** Miembro · Capitán · Secretaría (loads members, links accounts, classes, rosters, sermons, giving; cannot name admins) · Pastor/admin.
- **Outing type** chosen at start: Evangelismo (green/blue) or Volantes (orange). Coverage is stored per type; map filter Todo / Evangelismo / Volantes.
- **People** (`contacts`): status contacto / visita / miembro, photo, address, route (colectivo), linked account. Anyone adds; only staff mark members. Members are visible to the whole church; visit notes stay private to those allowed.
- **Account linking:** `join_church(code, name, phone)` links to an existing card by the last 8 phone digits, otherwise creates one; staff link manually with `link_account`.
- **Attendance:** `church_services` (Jóvenes, Oración, Culto sáb 19:00, Culto dom 10:00; only the two cultos count for faithfulness). Taken by captains, staff and members of a ministry with `can_take_attendance` (Recepción). Tap faces; quick-add a visitor.
- **Faithfulness:** % of main services in the last 4/12/26 weeks → Nunca falta ≥95 · Casi siempre ≥80 · Seguido ≥45 · A veces ≥20 · Muy de vez en cuando >0 · Dejó de venir · Nunca vino.
- **Journey:** contactado → visitado → prometió → vino → discipulado → escuela dominical → sábado y domingo → miembro → bautismo → evangeliza → sirve en un ministerio (`person_journey`); funnel screen shows who reached each stage but not the next.
- **Classes:** Cuna 0–2, Niños 2–6, Niños 6–12 (sábado y domingo). Teachers and helpers per class; schedule per date (teacher, helper, material); "Alternar maestros" and "Material en orden"; attendance with a note per student.
- **Materials:** series (book) → chapters, text and/or file (PDF, etc.).
- **Ministries:** Enseñanza, Recepción, Oración, Limpieza, Desayuno. Members, leader/co-leaders, group chat (realtime), leader announcements (push to all), recommendations, duty roster with "repeat N weeks".
- **Notifications:** in-app inbox + Expo push (pg_net). Hourly pg_cron job: Monday 9:00 duties and classes (names the chapter); Sunday 17:00 absences to the pastor (members) and each bus captain (his route).
- **Sermons:** YouTube link + audio upload (≤50 MB), in-app player, download.
- **Giving:** alias, CBU, titular, CUIT, banco with copy buttons; staff edit.
- **GPS retention:** raw points deleted 30 days after the outing; street-side coverage kept forever.

## Version 0.3 — tablets and web
- Runs on iPad / Android tablets (two-column lists, attendance grid up to 8 per row) and in the browser (same code, Leaflet map on web, no GPS outings or Face ID on web). Hosted with EAS Hosting (`eas deploy`).
- Attendance takers: staff can flag any account "Puede tomar asistencia" (`profiles.takes_attendance`).

## Not built yet
Weekly report email/PDF · network dashboard screen · photos/documents in chat · 2FA for admins.


## v0.4 — Devocional, seguridad y ficha

- **Versículo del día** (RV1960) como tarjeta vertical con fondo de color o foto, lista para compartir como historia de WhatsApp/Instagram (imagen en el teléfono, texto en la web). Pestaña Iglesia y "Yo → Devocional".
- **Devocional diario**: el pastor o la secretaría cargan, por fecha, cita + versículo + frase corta + lectura (Iglesia → Devocionales). Si un día no tiene nada, se muestra un versículo general (40 incluidos, rotan por día del año).
- **Racha de lectura**: abrir el devocional cuenta como leído; racha actual, mejor racha, total y premios a los 7, 30 y 365 días seguidos. Tablero "Lectores de la Palabra" por iglesia.
- **Contraseñas**: 10+ caracteres con letras y números, sin nombre/correo ni contraseñas comunes (revisión en la app con medidor de fuerza). Campo con ojo para verla.
- **Verificación en dos pasos (TOTP)**: cada persona la activa en "Seguridad de mi cuenta" con Google Authenticator u otra app (QR o clave). Al entrar se pide el código de 6 números.
- **Recuperar contraseña**: el correo lleva a la web (`/recuperar`) donde se escribe la nueva.
- **Cuentas** (pastor/secretaría): lista con correo, rol, si tiene dos pasos, último ingreso; mandar correo para cambiar contraseña; el pastor puede **desactivar** una cuenta (pierde acceso al instante, sin borrar datos).
- **Ficha**: DNI opcional; casilla **Bautizado** ("bautismo después de poner la fe en Cristo; el de bebé no cuenta"); filtro "Sin bautizar" en Personas (miembros y visitas).
- **Mapa**: colores por período reducidos a tres (esta semana / este mes / más de un mes). El estilo Simple en la web usa OpenStreetMap en gris (sin clave).
- **Web**: publicada en GitHub Pages (`https://10xchurch-coder.github.io/la-mies/`) por GitHub Actions en cada cambio.

Pendiente de configurar en Supabase (Authentication → URL Configuration): Site URL = `https://10xchurch-coder.github.io/la-mies/` y Redirect URLs `https://10xchurch-coder.github.io/la-mies/**`, para que los links de correo abran la web y no den error.

## v0.5 — Modo oscuro, familia y devocionales de noviembre

- **Modo oscuro**: interruptor en Ajustes → Apariencia. Se guarda en el teléfono; la primera vez sigue al sistema. Toda la app (mapa incluido) cambia de colores sin reiniciar.
- **Ficha corta por tipo de persona**: *Miembro* muestra solo teléfono, ruta (si tiene), cónyuge e hijos, y el bautismo solo si falta; *Contacto* agrega "prometió venir", discipulado, bautismo y seguimiento; *Visita* agrega cuántas veces vino y la fidelidad. Miembro desde, discipulado, bautismo, seguimiento y cuenta en la app se ven y se cambian en **Editar**.
- **Un contacto pasa a visita solo** cuando se lo marca presente en una reunión (al tomar asistencia o desde su ficha).
- **Bautismo**: al marcar Bautizado se elige "En esta iglesia" (con fecha) o "Antes de llegar" (la ficha dice "Sí", sin fecha).
- **Fecha de nacimiento** para visitas y miembros (edad calculada sola); en contactos de la calle alcanza con la edad. El mismo campo acepta `7` (edad) o `12/03/2018` (fecha). Los hijos también.
- **Estado civil**: se agregan Separado/a y Divorciado/a. Casado/a o En pareja muestra el campo **Cónyuge** con sugerencias de fichas ya cargadas; al elegir una, las dos fichas quedan vinculadas (familia) y los hijos de una se ven en la otra.
- **Rutas**: en toda la app se dice "Ruta" (El Porvenir, etc.) en lugar de "Colectivo"; filtro "Todas las rutas".
- **Maestros por ficha**: los turnos de las clases se asignan a miembros (no hace falta que tengan la app). Si tienen cuenta, el aviso del lunes les llega igual. Cargados los turnos de octubre y noviembre 2026 de Cuna, Niños 2–6 y Niños 6–12 (`supabase/seed/turnos_clases_oct_nov_2026.sql`).
- **Devocional en diapositivas**: versículo → frase del día → lectura corta → "Devocional completo" a pantalla completa (estudio de 5–10 minutos con los pasajes en texto completo) que termina con una oración. En el editor, un título va entre `**` `**`.
- **Devocionales de noviembre 2026** (5 al 30) cargados para la iglesia: Palabra (sem. 1), oración (sem. 2), la mies (sem. 3–4), gratitud, confianza y perseverancia (`supabase/seed/devocionales_noviembre_2026.sql`).
- Base: migración `0010_familia_bautismo_turnos.sql` (aplicada).

## v0.5.1 / próxima versión — Ministerios por ficha

- **Mapa en Android**: arreglado. La app ahora sabe que la clave de Google Maps está por una marca en `extra.googleMapsAndroid` (Expo no deja leer la clave misma).
- **Integrantes sin app**: en Ministerio → Gente → "Agregar integrante" se elige a cualquier miembro o visita por su ficha. Los que no usan la app aparecen con la etiqueta "Sin la app"; los que la usan, además, tienen el chat y los avisos. Cuando a una ficha se le vincula una cuenta, entra sola al chat de sus ministerios. Tabla `ministry_people` (migración `0011`, aplicada), sincronizada con `ministry_members`.
- **Turnos de ministerio**: una sola lista para elegir a la persona (primero los del ministerio); si usa la app le llega el aviso del lunes, si no, se le avisa a mano.
- **Ficha y Fidelidad**: los ministerios de una persona se ven en su ficha aunque no use la app; el filtro "Sirve en un ministerio" también los cuenta.
- **Chat del ministerio en Android**: el mensaje "Todavía no hay mensajes" salía espejado (parecía otro idioma); ahora se muestra fuera de la lista. El texto que se escribe se lee bien en modo oscuro.

## v0.6 — Versículo con foto, comentarios del día y capacitación nueva

- **Abre en Iglesia** (o en el Mapa si hay una salida en curso). Encabezado: el nombre de la iglesia, abajo "Más como Cristo cada día" y el saludo según la hora ("Buen día / Buenas tardes / Buenas noches, Nombre").
- **Versículo del día con foto de fondo**: una foto distinta cada día (42 fotos de Unsplash, licencia libre, en `src/lib/backgrounds.ts`; el fondo `auto` es el de siempre). Arriba "Versículo del día" chiquito y la cita, después el versículo y la frase. El admin puede elegir un color o subir su foto.
- **Pantalla completa**: al tocar la tarjeta se abre el devocional en diapositivas que se pasan con el dedo (versículo, frase, lectura de hoy, devocional completo). Cada una se comparte como imagen (foto, nombre de la iglesia y RV1960); el devocional completo también como texto.
- **Comentarios del día**: un solo chat por día para toda la iglesia. Se comenta solo el mismo día (hora de la iglesia); los días anteriores se pueden leer. Corazón con contador. Tablas `daily_comments` y `daily_likes` (migración `0012`, aplicada, con tiempo real).
- **Días anteriores**: hasta 31 días para atrás, con su foto.
- **Sesión en Android**: la sesión guardada se podía romper cuando dos lecturas/escrituras se cruzaban, y la app quedaba sin poder leer ("todavía no hay versículo para hoy"). Se reescribió el guardado (`secureStoreCore.ts`, con cola y clave propia) y la sesión se renueva sola al abrir la app.
- **Ofrendar**: el titular ya no tiene "Copiar" (solo CBU y alias).
- **Capacitación**: "Tips para recordar" arriba; "Presentación del evangelio" → "Cómo presentar el evangelio" (los Diez Mandamientos, al estilo de Ray Comfort, con los versículos completos); "Objeciones comunes" con las 10 más frecuentes en la calle. Se quitaron "Antes de salir" y "Al tocar la puerta". Se ordena por `sort_order`.
- **Prédicas**: se cargaron las 30 prédicas del canal de YouTube (mayo a noviembre 2026) con su link, pasaje y fecha (`supabase/seed/predicas_youtube_2026.sql`).
- **Foto según el versículo**: el fondo puede ser `u:<id de Unsplash>` = una foto elegida para ese versículo (por ejemplo, un farol en un sendero para Salmos 119:105). Noviembre ya tiene la suya en 23 de los 26 días que quedan (`supabase/seed/fotos_versiculos_noviembre_2026.sql`); los demás siguen con la foto del día. En Devocionales el admin ve la opción "Foto del versículo".
- **Se actualiza sola**: la pestaña Iglesia vuelve a cargar el versículo cuando la app vuelve a primer plano (o la pestaña del navegador se vuelve a mirar) y cuando cambia el día con la app abierta. Antes, un aparato que había quedado abierto desde el día anterior seguía mostrando el versículo de ayer.

## v0.6.1
- **Comentarios del día**: al abrirlos, la pantalla parpadeaba sin parar (la lista se volvía a cargar en bucle). Arreglado.

## Próxima versión (ya en la web)
- **Crear cuenta**: al tocar "Crear cuenta" se pasa a una pantalla limpia "Te mandamos un correo" (con el correo), y a los 6 segundos vuelve sola a Entrar con el correo ya escrito. El nombre, el celular y el código se guardan con la cuenta: al entrar después de validar el correo, la persona queda unida a su iglesia sola (si el código no sirve, ve el formulario ya lleno). Si el correo ya tenía cuenta, lo avisa y sugiere "¿Olvidaste tu contraseña?".
- **Web después de publicar**: si alguien tenía la app abierta mientras se publicaba una versión nueva, al tocar otra pestaña salía "Algo salió mal · Loading module … failed". Ahora la página se recarga sola (y si no puede, muestra "Hay una versión nueva · Actualizar"); además la publicación deja los archivos de la versión anterior.
- **Sin sesión no se ve nada de la iglesia**: abrir un link directo (por ejemplo el del devocional compartido por WhatsApp) en un navegador donde la persona no había entrado mostraba un versículo general (no el de la iglesia), sin devocional, y el corazón daba "permission denied". Ahora cualquier pantalla sin sesión va a Entrar; con sesión pero sin iglesia, a unirse.
