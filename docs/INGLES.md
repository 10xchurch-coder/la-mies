# La app en inglés: qué haría falta

Nota corta para decidir. Fecha: 24 de noviembre de 2026.

## En una frase

Se puede, pero **no es un botón**: hoy todos los textos de la app están escritos en castellano dentro de cada pantalla. Para tener inglés hay que sacar cada texto de su lugar, ponerlo en una lista, y traducir esa lista. Es un trabajo grande y conviene hacerlo por partes.

**Hoy no se tradujo nada.** Esta nota es solo la cuenta y el plan.

## Cuánto texto hay (contado, no adivinado)

Se contó con un programita que quedó guardado: `node scripts/contar-textos.mjs`. Lee todos los archivos de `app/` y `src/`.

| Qué | Cantidad |
|---|---|
| Archivos revisados | 299 |
| Textos entre comillas en total (incluye cosas internas que nadie lee) | 17.750 |
| **Textos que ve la gente, en castellano** | **5.948** (4.164 distintos) |
| Palabras para traducir | unas 26.000 (como un libro de 90 páginas) |
| Archivos que hay que tocar | 245 |

Dónde están:

| Parte | Textos | Palabras |
|---|---|---|
| Pantallas (`app/`) | 4.414 | 19.700 |
| Piezas de pantalla (`src/components`) | 318 | 1.300 |
| Mensajes, etiquetas y textos largos (`src/lib`) | 1.028 | 4.300 |

Ojo: el programa cuenta con una regla simple (busca frases y palabras en castellano). Puede errar para arriba o para abajo en un 10 %. Sirve para saber el tamaño, no para facturar.

## Lo que el programa NO cuenta (y también está en castellano)

1. **Los avisos de la base de datos.** Cuando algo no se puede hacer ("Solo el pastor o el tesorero"), ese texto sale de la base. Hay unos 390 en los archivos de la base (algunos repetidos o viejos).
2. **Los avisos al teléfono** (notificaciones) y los correos. Se arman en la base, en castellano.
3. **El contenido**: devocionales, capacitación, crecimiento, planes de lectura. Eso no es "la app", es material escrito. Traducirlo es otro trabajo (y los devocionales nuevos habría que escribirlos en los dos idiomas).
4. **La Biblia.** Hoy es RV1960. En inglés tendría que ser KJV: hay que cargar el texto entero de otra Biblia.
5. **Fechas, plata y teléfonos.** Hoy están pensados para Argentina ("sáb 24 oct", "$ 1.000", código de área). Unos 26 archivos arman fechas o montos así.
6. **Los textos de las tiendas** (App Store y Google Play).

## Qué habría que construir

1. **Una lista de textos por idioma.** Un archivo para castellano y otro para inglés. Cada texto con un nombre. Ejemplo: `guardar` → "Guardar" / "Save".
2. **Un ayudante** que cada pantalla usa para pedir el texto: en vez de escribir `"Guardar"`, la pantalla escribe `t('guardar')`. Se puede hacer sin instalar nada nuevo (la app ya tiene lo que hace falta), así sale como una actualización normal, sin pasar por las tiendas.
3. **El interruptor de idioma** en Ajustes, guardado para cada persona. La primera vez puede tomar el idioma del teléfono.
4. **Sacar los textos de las 245 pantallas y piezas** y reemplazarlos por el ayudante. Esta es la parte larga. Hay muchos textos armados con pedazos ("3 ofrendas", "Faltaron 2 hermanos"): en inglés el orden y los plurales cambian, y cada uno se revisa a mano.
5. **Traducir** las 26.000 palabras, con cuidado en las palabras de iglesia (culto, hermanos, jefe de ruta, seguimiento, ofrenda).
6. **Probar todo dos veces**, una en cada idioma. Los textos en inglés tienen otro largo y a veces no entran en un botón.
7. **Una regla nueva para siempre:** cada pantalla nueva se escribe en los dos idiomas. Si no, el inglés queda con huecos en castellano a los pocos meses.

## Por dónde empezar (si se decide hacerlo)

Lo que más se nota con menos trabajo:

| Etapa | Qué incluye | Textos | Palabras |
|---|---|---|---|
| **1. Lo que ve cualquier hermano** | El menú del teléfono, entrar y crear cuenta, ajustes, devocional, oración, eventos, prédicas, chat, directorio, anuncios, cumpleaños, ofrendar | unos 1.300 | unas 5.700 |
| 2. Lo de los líderes | Asistencia, seguimiento, personas, clases, ministerios, informes | unos 2.000 (a ojo) | — |
| 3. Administración y lo demás | Finanzas, roles, evangelismo con mapa, planificador de eventos, presentación, escritorio | unos 2.600 (a ojo) | — |
| 4. La base y los avisos | Mensajes de error y notificaciones | unos 400 | — |

La etapa 1 está contada con el programa. Las etapas 2 y 3 son el resto repartido a ojo.
| Aparte | Biblia KJV, devocionales y material en inglés | — | — |

Con la etapa 1 sola, un hermano que habla inglés puede usar la app sin perderse. El pastor y los líderes seguirían viendo sus pantallas en castellano hasta las etapas 2 y 3.

## Tamaño aproximado

- **Etapa 1:** el ayudante, el interruptor y unas 26 pantallas. Es un trabajo mediano: varias tandas de trabajo, más una revisión de alguien que hable bien inglés.
- **Toda la app (etapas 1 a 4):** es el cambio más grande que tendría la app desde que nació, porque toca casi todos los archivos (245 de 299). Mientras se hace, cualquier otro cambio en esas pantallas se cruza con este.
- **Biblia y contenido:** aparte, y depende de cuánto material se quiera tener en inglés.

No se puede prometer una fecha sin hacer primero la etapa 1 y medir cuánto llevó.

## Riesgos, dichos claro

- **Romper lo que anda.** Tocar 245 archivos puede meter errores en pantallas que hoy funcionan. Se baja el riesgo yendo por etapas y probando cada una.
- **Inglés a medias.** Si solo se hace la etapa 1, habrá pantallas mezcladas (menú en inglés, pantalla de adentro en castellano). Hay que avisarlo.
- **Más trabajo para siempre.** Cada función nueva costará un poco más, porque se escribe dos veces.
- **Una traducción hecha por máquina necesita un lector de verdad.** Las palabras de iglesia se traducen mal si nadie las revisa.

## Para decidir

Tres caminos posibles:

1. **No hacerlo por ahora.** Si las iglesias que van a usar la app hablan castellano, el inglés no les suma.
2. **Hacer solo la etapa 1.** Sirve si hay hermanos o visitas que hablan inglés. Es el mejor punto de partida y deja armado el ayudante para seguir después.
3. **Hacer todo.** Tiene sentido solo si una iglesia de habla inglesa va a usar la app completa, con su pastor y sus líderes.

Una pregunta que ayuda: **¿quién la va a usar en inglés?** Si son miembros, alcanza con la etapa 1. Si es una iglesia entera, hace falta todo, más la Biblia KJV.
