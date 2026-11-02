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
