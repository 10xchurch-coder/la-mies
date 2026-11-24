# Permiso para usar la Reina-Valera 1960 en la app

La Reina-Valera 1960 tiene derechos de autor. Por eso **no está en la app**: hoy la app trae la Reina-Valera 1909 y la King James, que son de dominio público. Para sumar la RV1960 hace falta un permiso **por escrito** de quien tiene los derechos.

Este archivo tiene: a quién escribir (hay que confirmarlo), la carta lista para mandar, y opciones de Biblia en audio para revisar.

## 1. A quién se le pide (verificar antes de mandar)

- **Se cree que los derechos son de las Sociedades Bíblicas Unidas** (United Bible Societies). El aviso que suelen traer las Biblias impresas dice algo como: “Reina-Valera 1960 © Sociedades Bíblicas en América Latina, 1960. Renovado © Sociedades Bíblicas Unidas, 1988”. También se cree que “Reina-Valera 1960” es una marca registrada de la American Bible Society.
- En la Argentina, el camino normal sería la **Sociedad Bíblica Argentina**, que es parte de las Sociedades Bíblicas Unidas y puede recibir el pedido o decir a quién mandarlo.
- **Esto no se pudo confirmar desde acá.** Antes de mandar la carta:
  1. Mirar la página de derechos de una Biblia RV1960 impresa (las primeras hojas) y copiar el aviso tal cual.
  2. Comparar con el aviso que muestra un sitio que la publica con permiso (por ejemplo la página de la versión RVR1960 en BibleGateway: https://www.biblegateway.com/versions/Reina-Valera-1960-RVR1960-Biblia).
  3. Buscar en el sitio oficial de la Sociedad Bíblica Argentina el contacto para “permisos” o “derechos de autor” y usar ese correo o formulario. No usar direcciones sacadas de otros sitios.
- Guardar la respuesta por escrito. Sin un “sí” escrito, no se agrega el texto.
- Si piden un pago, un contrato o un límite (por ejemplo, cantidad de versículos), eso lo decide la iglesia antes de seguir.

## 2. La carta (lista para copiar y mandar)

**Asunto:** Pedido de permiso para usar la Reina-Valera 1960 en la aplicación gratuita de una iglesia

Buen día:

Les escribo en nombre de [iglesia], una iglesia de [ciudad, provincia, país]. Mi nombre es [nombre] y soy [cargo en la iglesia].

Nuestra iglesia tiene una aplicación propia para sus miembros. Es gratuita, no tiene publicidad y no se vende nada dentro de ella. La usan unas [cantidad] personas de la congregación para ver los avisos, seguir un plan de lectura y leer la Biblia.

Hoy la aplicación trae la Reina-Valera 1909. En nuestra iglesia predicamos y enseñamos con la Reina-Valera 1960, y nos gustaría que los hermanos puedan leer en la aplicación el mismo texto que escuchan en los cultos. Por eso les pedimos permiso para usar el texto de la Reina-Valera 1960.

Lo que pedimos, en concreto:

1. **Incluir el texto completo de la Reina-Valera 1960 dentro de la aplicación, para leerlo sin conexión a internet.** El texto se mostraría tal cual, sin cambios, con el nombre de la versión y el aviso de derechos que ustedes nos indiquen.
2. **Permitir que los miembros hagan imágenes con versículos para compartir** (uno o unos pocos versículos por imagen), siempre con la cita y la sigla de la versión, por ejemplo “Juan 3:16 (RVR1960)”.
3. **Permitir copiar y compartir versículos sueltos** por mensaje, también con su cita y la sigla.

Lo que nos comprometemos a cumplir:

- El texto **no se vende** ni se cobra por leerlo. La aplicación es y seguirá siendo gratuita.
- No vamos a cambiar el texto ni a ofrecerlo para descargar como archivo aparte.
- Vamos a mostrar el aviso de derechos con las palabras exactas que ustedes pidan, en la pantalla de lectura y en la sección “Acerca de los textos”.
- Si nos dan el permiso con condiciones (un plazo, un límite, una forma de citar), las vamos a respetar. Y si más adelante lo retiran, quitamos el texto de la aplicación.

Datos de la aplicación:

- Nombre: [nombre de la aplicación]
- Dónde está: [App Store / Google Play / dirección web]
- Responsable: [iglesia], [dirección], [correo], [teléfono]

Si necesitan un formulario, un contrato o más datos, con gusto los completamos. También les agradecemos si nos indican de dónde tomar el texto oficial para no usar una copia con errores.

Quedo a disposición para lo que necesiten.

Muchísimas gracias,

[nombre]
[cargo] — [iglesia]
[teléfono] · [correo]

## 3. Si responden que sí

- Guardar el permiso (correo o contrato) en un lugar seguro de la iglesia.
- Pedir el texto oficial o la fuente autorizada. **No usar copias bajadas de internet.**
- Recién ahí se suma la versión a la app (se agrega a `VERSIONS` en `src/lib/bible.ts` y a `src/lib/bibleSources.ts`, con el aviso de derechos tal cual lo pidan).
- Tener en cuenta: la búsqueda, la concordancia, las referencias, las notas y los resaltados ya funcionan con cualquier versión que se agregue.

## 4. Biblia en audio: opciones gratuitas para revisar

La app **no trae audio grabado** (hoy lee en voz alta con la voz del teléfono). Si se quiere sumar audio grabado, estas son opciones para **verificar**; ninguna se agregó ni se probó:

| Opción | Qué es | Qué hay que verificar |
| --- | --- | --- |
| LibriVox (librivox.org) | Grabaciones hechas por voluntarios. Hay libros de la Reina-Valera 1909 en español. LibriVox dice que sus grabaciones son de dominio público. | Que estén todos los libros (parece haber solo una parte), la calidad de cada grabación y que cada una diga “dominio público” en su página. |
| Faith Comes By Hearing / Bible.is (API “Bible Brain”) | Biblias en audio en muchos idiomas, por internet. | Sus condiciones de uso: piden registrarse y aceptar un acuerdo. Ver qué versiones en español permiten y si se puede usar dentro de una app de iglesia. |
| Audio de la Reina-Valera 1960 | Existen grabaciones conocidas. | Tienen **dos** derechos: el del texto (el mismo de la carta de arriba) y el de la grabación. Hace falta permiso de los dos. |
| Grabarla la propia iglesia | Hermanos de la iglesia leen la Reina-Valera 1909. | Es lo más simple en lo legal (texto de dominio público, grabación propia). Es mucho trabajo: son unas 70 a 90 horas de audio. |

El audio pesa mucho (varios gigas): no conviene meterlo dentro de la app. Lo normal es escucharlo por internet o bajarlo de a un libro.
