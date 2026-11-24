# La app en inglés

Fecha: 24 de noviembre de 2026. Reemplaza la nota anterior (que era solo la cuenta y el plan).

## En una frase

En Ajustes hay una opción **Idioma / Language** (Español / English). Al tocarla, toda la app cambia en el momento, sin cerrarla. También hay un botoncito para cambiar de idioma en Entrar y en Crear cuenta. El idioma queda guardado en el teléfono.

**Estado (24 de noviembre de 2026, segunda pasada):** el programa ya se corrió en `main` y todas las pantallas pasan por el traductor. En la rama `feat/ingles2` se tradujeron los textos de las pantallas nuevas (hoy son 5.115 textos, todos con inglés), se arreglaron a mano los casos anotados más abajo y se miró la app en inglés a lo ancho de un teléfono.

## Cómo funciona

1. **El castellano sigue escrito en el código**, como siempre. No hay nombres raros para cada texto.
2. Cada texto que ve la gente queda envuelto así: `tx('Guardar')`. Si la app está en castellano, devuelve lo mismo. Si está en inglés, busca "Guardar" en la lista y devuelve "Save". **Si un texto no está en la lista, se ve en castellano** (nunca queda un hueco ni un error).
3. **La lista en inglés** es `src/i18n/en.json`: a la izquierda el texto en castellano, a la derecha el inglés.
4. Los textos con datos adentro usan huecos con nombre: `` `Faltaron ${n} personas` `` pasa a ser `tx('Faltaron {n} personas', { n })`. En inglés el hueco puede ir en otro lugar: `"{n} people were absent"`.
5. **Singular y plural:** donde el código ya elige ("persona" / "personas"), se traduce cada palabra. Además, la traducción puede elegir sola: `"{n} {n|person|people}"` pone "person" si n es 1 y "people" si no.
6. **Una palabra con dos sentidos** ("Salida" es una salida de evangelismo, pero en la puerta de un evento es por donde se sale): en ese archivo la clave lleva un contexto, `tx('Salida##puerta')`. Lo de después de `##` no se muestra nunca. Se anota en `scripts/i18n-config.json`, en `contexts`.
7. **Cambio al instante:** `app/_layout.tsx` vuelve a dibujar toda la app cuando cambia el idioma (el mismo truco que ya se usaba para el modo oscuro). Por eso, si alguien cambia el idioma con un formulario a medio llenar, lo escrito en esa pantalla se pierde. En Entrar y en Crear cuenta el botón está arriba, antes de los campos.
8. **La lista en inglés no hace más lenta la app.** Se baja recién cuando alguien elige inglés (en la web es un archivo aparte).

Archivos nuevos:

| Archivo | Qué es |
|---|---|
| `src/lib/i18n.ts` | El ayudante: `t` / `tx`, `txList`, `txLocale`. No depende de nada, así se puede probar solo. |
| `src/lib/i18nStore.ts` | Guarda el idioma en el teléfono y carga la lista cuando hace falta. |
| `src/components/LangChoice.tsx` | La tarjeta de Ajustes y el botón de Entrar / Crear cuenta. |
| `src/i18n/en.json` | Los textos en inglés. |
| `src/i18n/claves.json` | La lista de todos los textos en castellano que la app pide (la arma el programa). |
| `src/i18n/faltan.json` | Los que todavía no tienen inglés (hoy está vacío). |
| `scripts/i18n-codemod.mjs` | El programa que envuelve los textos en `tx(...)`. |
| `scripts/i18n-extract.mjs` | El programa que arma `claves.json` y `faltan.json`. |
| `scripts/i18n-lib.mjs`, `scripts/i18n-config.json` | El motor de los dos programas y sus ajustes. |
| `docs/INGLES-revisar.txt` | Lo que el programa no se animó a tocar (para mirar a mano). |
| `tests/i18n.test.ts` | Las pruebas. |

Archivos de siempre que se tocaron a mano (pocos): `app/_layout.tsx`, `app/ajustes.tsx`, `app/login.tsx`, `app/registro.tsx`, `src/lib/format.ts`, `src/lib/bible.ts`.

### Fechas, números y plata

- `src/lib/format.ts` es **el único lugar** que decide cómo se escriben: "sáb 24 oct" / "Sat, Oct 24", "2,3 km" / "2.3 km", "$ 1.234,50" / "$ 1,234.50".
- Las pantallas que arman fechas por su cuenta con `toLocaleDateString('es-AR', ...)`: el programa les cambia `'es-AR'` por `txLocale()` (son 29 lugares).
- Las listas de días y meses sueltas ("enero", "lunes") pasan a `txList([...])`, que traduce cada nombre cuando se lee.
- **Lo que no cambia:** las fechas que se **escriben** siguen siendo día/mes/año (23/05/1990) en los dos idiomas, y las horas siguen de 0 a 24. Cambiar el orden a la manera de Estados Unidos haría que alguien cargue mal un cumpleaños sin darse cuenta.
- **La plata que se escribe:** en castellano no cambió nada. En inglés, "1,500" y "1,500.50" se leen como mil quinientos (la coma separa los miles), y "1.500,50" se sigue entendiendo.

### La Biblia

- En inglés, los nombres de los libros salen en inglés ("John") y, **si la persona nunca eligió una versión**, se abre la King James. Si ya había elegido una, no se toca.
- Los devocionales y los planes de lectura no cambian: los escribe la iglesia en castellano.

## Pasos para dejarlo andando (los hace el encargado, en `main`)

Con las demás ramas ya unidas:

```bash
git merge feat/ingles

node scripts/i18n-codemod.mjs          # envuelve los textos (toca unos 265 archivos)
node scripts/i18n-codemod.mjs --dry    # tiene que decir "Archivos que cambiarían: 0"
npx tsc --noEmit                       # tiene que pasar
npm test                               # tiene que pasar; avisa si faltan textos en inglés
node scripts/i18n-extract.mjs          # actualiza claves.json y deja lo nuevo en src/i18n/faltan.json
npx expo export --platform web         # tiene que armar

git add -A && git commit
```

Si `tsc` falla en un archivo después del programa:

1. Mirar el texto que marca el error.
2. Agregarlo en `scripts/i18n-config.json`, en `skipTexts`, bajo el nombre del archivo: `"app/tal.tsx": ["El texto"]`. (O poner el comentario `// i18n-skip` en esa línea.)
3. `git checkout app/tal.tsx` y volver a correr `node scripts/i18n-codemod.mjs`.

Después hay que **probar la app en inglés en un teléfono de verdad** antes de publicarla (ver "Lo que no se probó").

## Después de cada cambio futuro

Las pantallas nuevas se siguen escribiendo **en castellano, como siempre**. Antes de publicar:

```bash
node scripts/i18n-codemod.mjs     # envuelve lo nuevo (lo que ya estaba no lo toca)
node scripts/i18n-extract.mjs     # dice cuántos textos faltan en inglés
```

Para traducir lo que falta: abrir `src/i18n/faltan.json`, escribir el inglés al lado de cada texto, y correr:

```bash
node scripts/i18n-extract.mjs --agregar src/i18n/faltan.json
node scripts/i18n-extract.mjs --limpiar   # opcional: saca de en.json lo que la app ya no usa
```

Si no se hace, no se rompe nada: lo nuevo se ve en castellano dentro de la app en inglés, y `npm test` lo avisa ("Inglés: faltan N textos").

Reglas para traducir: inglés simple de Estados Unidos, con las palabras de una iglesia bautista: culto → *service*, hermanos → *members* (o *brethren*), colectivo → *bus*, seguimiento → *follow-up*, prédica → *sermon*, ofrenda → *offering*, salida de evangelismo → *soul-winning outing*, jefe de ruta → *route captain*, ficha → *profile*, vereda → *sidewalk*. **Los huecos `{así}` no se traducen ni se borran** (hay una prueba que falla si falta uno).

## Qué envuelve el programa y qué no

Lee cada archivo de `app/` y `src/` con el compilador de TypeScript (con los tipos) y decide texto por texto.

**Sí envuelve:**

- El texto suelto de las pantallas y los atributos que se muestran (`title`, `label`, `placeholder`, `text`, `subtitle`, `hint`, `accessibilityLabel`, etc.).
- Los avisos (`Alert.alert`, confirmaciones), los mensajes de error que se le muestran a la persona y los textos de botones.
- Las frases armadas con pedazos: `<Text>Faltaron {n} personas</Text>` y `` `Hola ${nombre}` `` quedan como una sola frase con huecos (solo si los pedazos son textos o números; lo sabe por los tipos).
- **Tablas que están fuera de una función** (`features.ts`, `desk.ts`, `perms.ts`, `format.ts`…): `label: 'Asistencia'` pasa a `get label() { return tx('Asistencia'); }`. Así el texto se traduce **cuando se lee**, no cuando se abre la app, y cambia con el idioma.
- **Valores que son a la vez clave y texto** (por ejemplo los grupos de funciones, "Tarjeta / Llavero / Pulsera"): el valor no se toca (se sigue comparando y guardando igual) y se traduce solo donde se muestra: `{tx(grupo)}`. El programa lo descubre por el tipo.

**No toca:** rutas, claves, valores de la base, permisos, consultas, nombres de archivo, estilos, lo que va a `console`, lo que está dentro de una llamada a `supabase`, los tipos, los nombres de los libros de la Biblia, el contenido (`src/lib/*Data.ts`, `biblePlan.ts`, `bibleStudy.ts`, `importPeople.ts`, `content/`) ni nada de `tests/`.

**Por seguridad tampoco toca** (y lo anota en `docs/INGLES-revisar.txt`):

- Un texto que en algún archivo se compara con `===`, `case`, `includes` o `startsWith` (por ejemplo el error `'cancelado'` del lector de chips).
- Un mensaje de error que coincide con una búsqueda (`/permiso/i.test(mensaje)`).
- Textos fuera de una función que no son una propiedad (una constante suelta, una lista de valores).
- Palabras sueltas en minúscula que podrían ser una clave.

Se puede correr las veces que haga falta: **la segunda vez no cambia nada**.

## Cómo sumar otro idioma (por ejemplo portugués)

1. En `src/lib/i18n.ts`: agregar `'pt'` al tipo `Lang`, a `isLang` y a la lista `LANGS` (`{ id: 'pt', name: 'Português' }`).
2. En `src/lib/i18nStore.ts`, en `ensureDict`: agregar la línea que carga `../i18n/pt.json`.
3. Copiar `src/i18n/claves.json` como base, traducir, y guardar como `src/i18n/pt.json` (mismo formato que `en.json`).
4. En `src/lib/i18n.ts`, `txLocale`: devolver `'pt-BR'`. En `src/lib/format.ts`: sumar los días y meses cortos y revisar los lugares que hoy preguntan "¿es inglés?".
5. En `tests/i18n.test.ts`: repetir la prueba de los huecos para `pt.json`.

Las pantallas no se tocan: ya están envueltas.

## Lo que sigue en castellano (dicho claro)

1. **Los avisos que llegan al teléfono y a la campanita.** Los arma la base de datos, en castellano. Son 46 funciones (recordatorios, informe semanal, cumpleaños, anuncios, colectivo, turnos, mensajes…).
   *Camino recomendado:* guardar el idioma de cada persona en su perfil (una columna nueva `profiles.lang`), y que la función `notify` reciba una clave y los datos en vez del texto ya armado; el texto se arma en el teléfono al mostrarlo, con la misma lista `en.json`. Para el aviso que aparece con la app cerrada hace falta además que la base tenga las frases en los dos idiomas (una tabla chica). Es un trabajo aparte y hay que hacerlo función por función.
2. **Los errores que vienen de la base** ("Solo el pastor o el tesorero…"): unos 275 mensajes. *Camino recomendado:* agregarlos a `en.json` con su texto exacto y pasar el mensaje por `tx()` en `errorMessage` (`src/lib/supabase.ts`); sirve para los que no llevan datos adentro.
3. **Los correos** (confirmar cuenta, cambiar contraseña): salen de las plantillas de Supabase, en castellano.
4. **El contenido:** devocionales, capacitación, crecimiento, planes de lectura (las lecturas dicen "Génesis 1–4"), lecciones, anuncios y todo lo que escribe la gente.
5. **La página pública de la iglesia y las tiendas** (App Store, Google Play), y las páginas de privacidad.
6. **Las hojas para imprimir armadas como página web** (el resumen de ofrendas del año) y los nombres de las columnas de la copia de datos.
7. **Parte de lo anotado en `docs/INGLES-revisar.txt`** (90 renglones; casi todos son valores que está bien no tocar). Lo que seguro queda en castellano: los nombres de los lugares guardados de "Ubicación en familia" que ya están en la base, los días cortos ("sáb 24/10") en las diapositivas de anuncios, "sí/no" dentro de la copia de datos, la planilla modelo para importar (los títulos van en castellano, que es lo que la app reconoce seguro) y los títulos de los planes de lectura. Las listas que figuran ahí (motivos de denuncia, "¿Cómo nos conociste?", tipos de chip, grupos de funciones) en general **sí** se traducen al mostrarse; están anotadas para que alguien lo confirme mirando la pantalla.
8. **Lo que se guarda con nombre por defecto** (por ejemplo "Culto del domingo" al crear una lista, o los mensajes de WhatsApp de seguimiento): quien usa la app en inglés los crea en inglés; lo ya guardado no cambia.
9. La voz que lee la Biblia sigue la versión de la Biblia, no el idioma de la app.

## Medidas

| Qué | Antes | Después |
|---|---|---|
| Lo que baja la web al abrir (los dos archivos de arranque) | 7.636.286 bytes (2.235.028 comprimido) | 7.660.573 bytes (2.239.680 comprimido): **+0,3 %** |
| Lista en inglés (se baja solo si alguien elige inglés) | — | 310.978 bytes (104.196 comprimido) |
| Textos distintos | — | 5.115 (29.342 palabras), **todos con inglés** |
| Lugares envueltos | — | unos 7.200 |
| Para revisar a mano | — | 90 renglones |

## Segunda pasada: lo que se arregló a mano y lo que hay que saber

**Errores de verdad que tenía el cambio automático (ya arreglados):**

- **El menú de opciones en iPhone** (`src/components/ActionSheet.tsx`) sacaba el botón "Cancelar" comparando el texto. En inglés el texto era "Cancel", no lo encontraba, y el botón salía dos veces. Ahora compara con los dos.
- **Importar personas** (`src/lib/importSmart.ts`): el valor "no miembro" de una planilla había quedado envuelto. Se le sacó.
- **Tablas que quedaban fijas en el idioma en que se abrió la app**: formas de dar la ofrenda, parentescos, países de "Empezar", y las opciones de columnas de los dos importadores. Ahora leen el texto cada vez.

**Regla nueva del programa:** los textos dentro de `['a', 'b'].includes(x)` y de `new Set([...])` ya no se envuelven.

**Lo que el programa no puede ver (hay que mirarlo a mano en cada pantalla nueva):**

1. Un texto envuelto en una pantalla y comparado **en otro archivo** (como el "Cancelar" de arriba).
2. Una tabla armada fuera de una función **copiando** etiquetas de otra (`OPCIONES = TABLA.map((x) => ({ label: x.label }))`). Hay que escribir `get label() { return x.label; }`.
3. Frases armadas solo con palabritas cortas (`${dia} de ${mes}`, `${a} y ${b}`): no las toma. Se envuelven a mano (ya se hizo con las 8 que había).

**Ajustes nuevos en `scripts/i18n-config.json`:**

- `identityLists`: archivos donde las listas sueltas son valores para comparar (títulos de planilla, abreviaturas de libros). Ni se tocan ni se anotan.
- `extraKeys`: textos que se traducen con `tx(variable)` y que el programa no puede adivinar (por ejemplo "débil", "fuerte", "buena" de la contraseña). Sin esto, `--limpiar` los borraría de `en.json`.

**Cambiar de idioma sin perder lo escrito:** sin sesión (Entrar, Crear cuenta, Empezar) el cambio de idioma ya no vuelve a armar la app; esas tres pantallas se redibujan solas (`useLang()`), y lo escrito queda. Con sesión sigue como antes (se vuelve a armar todo, como con el modo oscuro).

**Lo que se revisó de las pantallas nuevas:** ubicación en familia, alta de iglesias e importadores (los títulos de las columnas se reconocen igual en los dos idiomas), demostración (el aviso se sigue reconociendo por su texto en castellano, que es el que manda la base), presentación y bosquejo (los libros en castellano se entienden con la app en inglés, y ahora también "John 3:16"), personas, comparar Biblias y palabras originales. Hay pruebas nuevas en `tests/i18n.test.ts` para todo esto.

**A lo ancho de un teléfono, en inglés:** se abrieron 54 pantallas en los dos idiomas buscando textos cortados o que se salen. No hay ninguno cortado; los botones del menú ocupan dos renglones igual que en castellano. Se acortó el texto del buscador del inicio.

## Riesgos (para el que lo aplica)

Es un cambio que toca 265 archivos de una app que se usa todos los días. Lo que puede fallar:

- **Un texto que también es un valor.** Si un texto traducido se compara en otro archivo de una forma que el programa no ve (por ejemplo pasa por tres funciones antes de compararse), en inglés esa comparación da distinto. El programa mira `===`, `case`, `includes`, `startsWith` y claves en **todos** los archivos, pero no puede seguir un valor por todo el código.
- **Lo que se guarda en la base** desde una pantalla en inglés queda en inglés (nombres por defecto). Si alguna consulta busca por ese nombre en castellano, no lo encuentra.
- **Tablas que se arman al abrir la app a partir de otra tabla** (por ejemplo un `Object.fromEntries` de etiquetas, fuera de una función): quedan en el idioma que había al cargarse ese archivo.
- **Dos textos distintos que en inglés son iguales** dentro de una misma lista pueden repetir la `key` de la lista (aviso en la consola; rara vez se ve mal).
- **Textos más largos en inglés** que no entren en un botón. Hay que mirar las pantallas.
- **La traducción la hizo una máquina.** Hay que hacerla leer por alguien que hable inglés y conozca el vocabulario de la iglesia.
- **Palabras con dos sentidos** que todavía no tienen contexto: se arreglan sumando una línea en `contexts` y corriendo el programa.

## Lo que se probó y lo que no

Se probó, sobre una copia con el programa ya corrido:

- `npx tsc --noEmit` pasa. `npm test` pasa (272 pruebas, 7 nuevas).
- Correr el programa dos veces: la segunda no cambia nada.
- La web arma (`expo export`).
- En un navegador sin pantalla, con datos de mentira (sin tocar la base real): Entrar y Crear cuenta en los dos idiomas, el idioma queda al recargar, Ajustes cambia al instante sin salir de la pantalla, y se abrieron las 149 pantallas que no necesitan un dato para abrirse, en castellano y en inglés. 145 abren sin errores en los dos idiomas; las otras 4 fallan igual **antes** del cambio (les falta el dato con que se abren), así que no es por esto.

**No se probó:**

- En un teléfono de verdad (iPhone y Android). En particular: que la lista en inglés cargue bien ahí, y los avisos del sistema (permisos, lector de chips).
- Con datos de verdad: las pantallas se abrieron vacías, así que los textos que solo aparecen cuando hay personas, salidas o plata cargada no se vieron.
- Las pantallas que necesitan un dato para abrirse (la ficha de una persona, un evento, una clase).
- Guardar cosas estando en inglés.
- Que cada texto en inglés entre en su lugar.
