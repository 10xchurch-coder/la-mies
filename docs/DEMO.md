# La demostración: una iglesia de ejemplo para mostrar La Mies

Es una iglesia inventada, **Iglesia Bautista Esperanza**, con unas 160 personas y más de un año de historia.
Sirve para que un pastor abra un enlace y recorra la app como si fuera su iglesia.
No tiene nada que ver con ninguna iglesia real: los nombres, teléfonos, direcciones y números son inventados.

## El enlace para compartir

- **Como pastor:** `https://10xchurch-coder.github.io/la-mies/demo`
- **Como un hermano de la iglesia:** `https://10xchurch-coder.github.io/la-mies/demo?ver=miembro`

Se puede poner en la página de La Mies o mandar por WhatsApp. El que lo abre entra solo: no escribe correo ni contraseña.
En la computadora ve el escritorio del pastor; en el teléfono, la app como en el celular.

Abajo siempre hay una cinta azul que dice **"Estás viendo una iglesia de ejemplo"**. Desde ahí se puede:

- cambiar entre **Ver como pastor** y **Ver como miembro**;
- tocar **Quiero La Mies para mi iglesia** (abre la página para empezar; si esa página todavía no está publicada, abre un correo a info@iglesiavictoria.com);
- achicar la cinta con la flechita, si tapa algo.

> El enlace empieza a andar cuando se publique la versión web con este cambio.

## Qué puede hacer el visitante

- Entrar a **todas** las pantallas: personas y familias, asistencia, los que faltaron, fidelidad, seguimiento de visitas, discipulado,
  clase de miembros, clases de los chicos, ministerios y turnos, colectivo, mapa de evangelismo, eventos, anuncios, calendario,
  oración, prédicas con apuntes, orden del culto, canciones, finanzas, ofrendas, informes, devocional, chat.
- Leer la Biblia, armar una imagen con un versículo y usar el modo presentación en su propia computadora.

## Qué NO puede hacer

- **Guardar nada.** Si toca "Guardar", "Enviar" o "Borrar", ve el aviso *"Esto es una demostración: acá no se guardan cambios"*.
  Así nadie puede ensuciar la demostración ni escribir algo que vea el próximo visitante.
- Cambiar el correo o la contraseña de la cuenta de ejemplo, activar la verificación en dos pasos ni borrar la cuenta.
- Subir fotos o archivos.
- Mandar avisos, correos o mensajes. Los botones de WhatsApp, llamar y correo no abren nada: muestran un cartel. (Los teléfonos son inventados.)
- Crear invitaciones o códigos para unirse a una iglesia.
- Bajar listas o la copia de los datos.
- Ver algo de una iglesia real. Y las iglesias reales no ven nada de la de ejemplo; tampoco aparece en la lista de la red.

## Cómo se mantiene al día

Todos los días a las 5:10 de la mañana (hora de Argentina) la base corre sola la tarea `lamies-demo`. Esa tarea:

- agrega la asistencia de las reuniones que pasaron, las clases, los turnos, las ofrendas y las salidas del sábado;
- una vez por semana hace que llegue una visita nueva, que algunos empiecen a faltar y que otros vuelvan;
- vuelve a poner, con fecha nueva, anuncios, pedidos de oración, prédicas, mensajes del chat y devocionales;
- deja siempre un evento próximo a futuro (cuando pasa, lo corre seis semanas);
- le pone el candado a las tablas nuevas que se hayan agregado a la app.

Las visitas, los contactos y las veredas recorridas que se van sumando caen siempre dentro de esa zona del centro, sobre calles reales.

Para correrla a mano (SQL Editor de Supabase): `select public.demo_tick();`

## Cómo apagarla y volver a prenderla

En el SQL Editor de Supabase:

```sql
select public.demo_set_enabled(false);  -- apagar: /demo avisa que no está disponible y nadie puede entrar
select public.demo_set_enabled(true);   -- volver a prender
```

Apagarla no borra nada. Los que ya estaban adentro pueden seguir mirando hasta una hora más (y siguen sin poder guardar).

Para que también deje de actualizarse sola: `select cron.unschedule('lamies-demo');`

## Cómo cambiar la llave de entrada

La app le pide a la base con qué cuenta entrar; el visitante nunca ve esa llave. No es un secreto (la cuenta no puede hacer nada),
pero se puede cambiar cuando quieras:

```sql
select public.demo_new_entry_key();
```

## Cómo cargar todo de nuevo en una base nueva

1. Tener cargadas las calles de Posadas (`scripts/import-roads.mjs`) y aplicar las migraciones `0085_demo.sql` y `0086_demo_posadas.sql`.
2. `node scripts/demo-seed.mjs` (escribe los archivos en `supabase/seed/demo/`; siempre salen iguales).
3. Pegar y correr en el SQL Editor, en orden, `01_…sql` hasta `08_…sql`.
4. Correr `supabase/tests/demo_test.sql`: tiene que terminar con `ROLLBACK_OK` y sin fugas (no deja nada guardado).

Las fechas se calculan el día que se carga, así que sirve cualquier día.

## Cómo está protegida (para quien mantiene la app)

- La iglesia de ejemplo está marcada en la tabla `demo_churches`. `is_demo_user()` dice si la cuenta conectada es de ejemplo.
- **Todas** las tablas de `public` tienen un disparador (`aaa_demo_guard`) que rechaza insertar, cambiar o borrar si la cuenta es de ejemplo
  (error `DM001`). Unas pocas tablas que la app escribe sola al mirar (avisos leídos, chat leído, errores, racha de lectura) no dan error: simplemente no guardan.
- Las cuentas de ejemplo llevan una marca que solo la base puede poner. Con esa marca no se les puede cambiar correo, contraseña ni datos, ni borrarlas.
- Archivos y canal en vivo: reglas extra que no dejan subir ni transmitir a las cuentas de ejemplo.
- La app, además, muestra el aviso amable y no intenta abrir WhatsApp ni bajar archivos. Pero la que manda es la base.
- Solo las cuentas `pastor@…` y `miembro@…` sirven para entrar. Las otras 12 cuentas de ejemplo existen para que haya quien "escriba" en el chat; no tienen contraseña conocida.

## Para tener en cuenta

- **El mapa está en el centro de Posadas** (unas 12 x 11 cuadras entre Av. Corrientes y 25 de Mayo, y entre Tucumán y Av. Roque Pérez),
  sobre las calles de verdad, para que se vea un mapa real. Las personas y sus direcciones son inventadas: cada casa se sortea sobre una vereda
  ("Bolívar 1555" no es la casa de nadie de la iglesia) y nunca cae a menos de 15 metros del punto de una persona de una iglesia real.
- En el mapa hay zonas muy recorridas, zonas recorridas a medias y zonas sin tocar, para que se vean los colores.
  Las paradas del colectivo están en esquinas reales.
- En la base, la ciudad de la iglesia de ejemplo dice "Ciudad de ejemplo" (no "Posadas"), para que nadie la confunda con una iglesia real de Posadas.
- Quedaron guardadas 18 calles inventadas del primer mapa (lejos, en La Pampa). No se usan ni se ven; no se borraron porque acá no se borra nada.
- Las fotos están vacías (nadie tiene foto) y las prédicas no tienen video.
- "Entrada de los chicos", "Inactivos", "Sorteos" y "Colectivo en vivo" se ven vacías: son cosas que pasan en el momento.
