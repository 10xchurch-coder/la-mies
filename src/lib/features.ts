// Las funciones de la app que cada iglesia puede prender o apagar (en Ajustes, solo el pastor o el administrador de la app).
// Lo apagado se esconde del menú, de la barra de abajo y del escritorio, y la pantalla no se puede abrir (ni por un link).
// No se borra nada: si se vuelve a prender, todo está como estaba.
// Sin nada de la base ni de la pantalla, para poder probarse sola.

import { tx } from './i18n';
export type FeatureKey =
  | 'evangelismo' | 'evang_zonas' | 'evang_tablero' | 'seguimiento' | 'colectivo' | 'colectivo_vivo' | 'colectivo_paradas'
  | 'discipulado' | 'decisiones' | 'bienvenida' | 'tarjeta_visita' | 'clase_miembros'
  | 'asistencia' | 'asistencia_chips' | 'ausencias' | 'fidelidad'
  | 'culto' | 'preguntas' | 'ninos' | 'clases' | 'clase_lecciones' | 'clase_versiculos' | 'ministerios'
  | 'predicas' | 'predica_notas' | 'vivo' | 'presentar'
  | 'devocional' | 'biblia' | 'biblia_buscar' | 'biblia_referencias' | 'biblia_originales' | 'biblia_audio' | 'biblia_imagen' | 'biblia_marcas'
  | 'plan_lectura' | 'crecimiento' | 'biblioteca'
  | 'chat' | 'oracion' | 'oracion_respondidas' | 'eventos' | 'evento_plan' | 'evento_puerta' | 'evento_credenciales' | 'evento_contador'
  | 'directorio' | 'hogares' | 'cumples' | 'anuncios' | 'sugerencias' | 'misioneros' | 'mensajes_pastor' | 'bautismos'
  | 'musica' | 'cancionero' | 'radio' | 'rifas' | 'mensajes' | 'ubicacion_familia'
  | 'finanzas' | 'ofrendas_persona' | 'ofrendar' | 'informes';

export type FeatureGroup = 'Evangelismo y visitas' | 'Reuniones y enseñanza' | 'La Biblia y crecer' | 'Comunidad' | 'Dinero e informes';

export type Feature = {
  key: FeatureKey;
  label: string;
  hint: string;
  group: FeatureGroup;
  /** Si es una parte de otra función: con la de arriba apagada, esta también queda apagada (y vuelve como estaba al prenderla). */
  parent?: FeatureKey;
  /** Qué deja de verse al apagarla, en una frase corta. */
  hides: string;
  /** Las pantallas que abre: se bloquea esa dirección y todo lo que cuelga de ella. Puede estar vacío si solo son botones dentro de otra pantalla. */
  routes: string[];
};

export const FEATURES: Feature[] = [
  // ---------- Evangelismo y visitas ----------
  { key: 'evangelismo', get label() { return tx('Evangelismo en las calles'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Salir a golpear puertas con el mapa, las zonas y quiénes salieron. Si tu iglesia no sale a las calles, apagalo.'); },
    get hides() { return tx('El mapa, las salidas, "Evangelismo en vivo", "Quiénes salieron" y el botón de cargar una casa nueva.'); },
    routes: ['/mapa', '/salida', '/salidas', '/salida-chat', '/salieron', '/equipo', '/vereda', '/recortar', '/resumen', '/ubicacion', '/contacto/nuevo'] },
  { key: 'evang_zonas', parent: 'evangelismo', get label() { return tx('Zonas'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Dividir la ciudad en zonas y ver cuánto se recorrió de cada una.'); },
    get hides() { return tx('El botón "Zonas" y el avance de cada zona.'); },
    routes: ['/zonas', '/zona'] },
  { key: 'evang_tablero', parent: 'evangelismo', get label() { return tx('Tablero y niveles'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('El tablero con los totales de los equipos y el progreso de cada hermano (nivel, racha e insignias).'); },
    get hides() { return tx('El tablero de las salidas y "Mi progreso".'); },
    routes: ['/tablero', '/progreso'] },
  { key: 'seguimiento', get label() { return tx('Seguimiento de visitas'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Mis contactos para seguir y los avisos de a quién escribir o visitar.'); },
    get hides() { return tx('"Para seguir", sus reglas en Ajustes y los avisos de a quién escribir.'); },
    routes: ['/seguimiento', '/admin/seguimiento'] },
  { key: 'bienvenida', get label() { return tx('Visitas nuevas y regalo de bienvenida'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Anotar quién ya recibió el regalo de bienvenida y una visita en su casa.'); },
    get hides() { return tx('"Visitas nuevas" y esos datos en la ficha de la persona.'); },
    routes: ['/bienvenida'] },
  { key: 'tarjeta_visita', get label() { return tx('Tarjeta de visita con QR'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Un cartel con un código QR en la entrada: la visita lo lee con su teléfono y deja sus datos.'); },
    get hides() { return tx('El cartel con el QR. La página que abre el QR avisa que la iglesia no la usa.'); },
    routes: ['/tarjeta-visita', '/visita'] },
  { key: 'decisiones', get label() { return tx('Decisiones'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Anotar quién recibió a Cristo, quién pidió el bautismo y otras decisiones.'); },
    get hides() { return tx('"Decisiones" y el botón para anotarlas en la ficha de la persona.'); },
    routes: ['/decisiones'] },
  { key: 'discipulado', get label() { return tx('Discipulado'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Quién discipula a quién y por qué lección va.'); },
    get hides() { return tx('"Discipulado", sus lecciones y ese cuadro en la ficha de la persona.'); },
    routes: ['/discipulado'] },
  { key: 'clase_miembros', get label() { return tx('Clase de miembros nuevos'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Quién está haciendo la clase para ser miembro y qué clases ya hizo.'); },
    get hides() { return tx('"Clase de miembros" y ese cuadro en la ficha de la persona.'); },
    routes: ['/clase-miembros'] },
  { key: 'colectivo', get label() { return tx('Colectivo y rutas'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Las rutas del colectivo y los pasajeros de cada una.'); },
    get hides() { return tx('"Colectivo" y todo lo de las rutas.'); },
    routes: ['/colectivo'] },
  { key: 'colectivo_paradas', parent: 'colectivo', get label() { return tx('Paradas en orden'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('La lista de paradas de cada ruta, en el orden en que pasa el colectivo.'); },
    get hides() { return tx('La pantalla de paradas de la ruta.'); },
    routes: ['/colectivo-paradas'] },
  { key: 'colectivo_vivo', parent: 'colectivo', get label() { return tx('Colectivo en vivo'); }, group: 'Evangelismo y visitas',
    get hint() { return tx('Ver en el mapa por dónde viene el colectivo, con un aviso cuando está cerca.'); },
    get hides() { return tx('"Colectivo en vivo", el cartel del inicio y el aviso de que está llegando.'); },
    routes: ['/colectivo-vivo'] },

  // ---------- Reuniones y enseñanza ----------
  { key: 'asistencia', get label() { return tx('Asistencia a las reuniones'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Tomar asistencia en cada reunión y marcar las fechas en que no hubo reunión.'); },
    get hides() { return tx('"Tomar asistencia", "Asistencia del día" y todo lo que sale de la asistencia.'); },
    routes: ['/asistencia', '/suspender', '/escritorio/asistencia'] },
  { key: 'ausencias', parent: 'asistencia', get label() { return tx('Para atender (los que faltaron)'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('La lista de los que faltaron, para llamarlos o visitarlos, y el aviso de cada semana.'); },
    get hides() { return tx('"Faltaron", el aviso semanal de ausencias y esos cuadros del escritorio.'); },
    routes: ['/ausencias'] },
  { key: 'fidelidad', parent: 'asistencia', get label() { return tx('Fidelidad y camino'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Cuánto viene cada uno y en qué paso está de su camino en la iglesia.'); },
    get hides() { return tx('El botón "Fidelidad y camino" del menú.'); },
    routes: ['/fidelidad'] },
  { key: 'asistencia_chips', parent: 'asistencia', get label() { return tx('Entrada con chip'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Cada persona tiene un chip (tarjeta, llavero o pulsera) y marca su asistencia sola al llegar.'); },
    get hides() { return tx('"Entrada con chip" y los chips en la ficha de la persona.'); },
    routes: ['/asistencia-chip', '/chips'] },
  { key: 'culto', get label() { return tx('Orden del culto'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Las partes de cada culto en orden y quién se ocupa de cada una, con un aviso el día antes.'); },
    get hides() { return tx('"Orden del culto" y el aviso del día antes.'); },
    routes: ['/culto'] },
  { key: 'presentar', get label() { return tx('Modo presentación'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Mostrar en el proyector las letras de las canciones, pasajes de la Biblia, fotos, videos y una cuenta regresiva.'); },
    get hides() { return tx('El botón "Modo presentación" y sus pantallas para el proyector.'); },
    routes: ['/presentar'] },
  { key: 'ninos', get label() { return tx('Entrada y retiro de los chicos'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('La guardería y las clases de los chicos, con una etiqueta para el chico y otra para el adulto que lo retira.'); },
    get hides() { return tx('El botón "Entrada de los chicos" y sus etiquetas.'); },
    routes: ['/ninos'] },
  { key: 'clases', get label() { return tx('Escuela dominical'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Las clases, sus maestros, los turnos y la asistencia de cada clase.'); },
    get hides() { return tx('"Clases" y los avisos a los maestros.'); },
    routes: ['/clases', '/clase'] },
  { key: 'clase_lecciones', parent: 'clases', get label() { return tx('Lecciones de las clases'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('La lección de cada día, para que el maestro (o quien lo reemplace) la abra y enseñe.'); },
    get hides() { return tx('Las lecciones dentro de cada clase.'); },
    routes: ['/clase/leccion', '/clase/lecciones'] },
  { key: 'clase_versiculos', parent: 'clases', get label() { return tx('Versículos de memoria'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('El maestro arma la lista y tilda qué chico aprendió cada versículo.'); },
    get hides() { return tx('Los versículos de memoria dentro de cada clase.'); },
    routes: ['/clase/versiculos'] },
  { key: 'ministerios', get label() { return tx('Ministerios y turnos'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Los grupos de servicio de la iglesia, con su chat y sus turnos.'); },
    get hides() { return tx('"Ministerios", los turnos y el aviso de "mañana servís".'); },
    routes: ['/ministerios', '/ministerio'] },
  { key: 'predicas', get label() { return tx('Prédicas'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Los mensajes de cada semana con su video y su audio.'); },
    get hides() { return tx('"Prédicas" y el cartel de "mañana en la iglesia".'); },
    routes: ['/predicas', '/t-predicas', '/predica'] },
  { key: 'predica_notas', parent: 'predicas', get label() { return tx('Notas de las prédicas'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Cada hermano completa y guarda sus notas de cada mensaje.'); },
    get hides() { return tx('El botón "Mis notas de prédicas" y las notas dentro de cada mensaje.'); },
    routes: ['/predica/mis-notas'] },
  { key: 'vivo', get label() { return tx('Culto en vivo'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('La transmisión del culto, con comentarios y notas.'); },
    get hides() { return tx('"En vivo", el cartel rojo del inicio y el aviso de que empezó.'); },
    routes: ['/vivo'] },
  { key: 'preguntas', get label() { return tx('Caja de preguntas'); }, group: 'Reuniones y enseñanza',
    get hint() { return tx('Los hermanos mandan preguntas de la Biblia, con su nombre o sin él, y el pastor las responde.'); },
    get hides() { return tx('El botón "Preguntas" y el aviso de cada pregunta nueva.'); },
    routes: ['/preguntas'] },

  // ---------- La Biblia y crecer ----------
  { key: 'biblia', get label() { return tx('La Biblia en la app'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Leer la Biblia dentro de la app, sin internet. Abajo elegís qué versiones puede usar tu gente.'); },
    get hides() { return tx('La Biblia de la app y los botones que la abren.'); },
    routes: ['/biblia', '/t-biblia'] },
  { key: 'biblia_buscar', parent: 'biblia', get label() { return tx('Buscar en la Biblia'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Buscar una palabra, una frase o una cita, y ver todos los versículos donde aparece una palabra.'); },
    get hides() { return tx('"Buscar en la Biblia" y la concordancia.'); },
    routes: ['/biblia/buscar', '/biblia/concordancia'] },
  { key: 'biblia_referencias', parent: 'biblia', get label() { return tx('Referencias cruzadas'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Al tocar un versículo, ver otros versículos que hablan de lo mismo.'); },
    get hides() { return tx('El botón "Referencias" al tocar un versículo.'); },
    routes: [] },
  { key: 'biblia_originales', parent: 'biblia', get label() { return tx('Palabras originales'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Ver cada palabra del versículo en hebreo o griego, con su número de Strong. Las explicaciones están en inglés.'); },
    get hides() { return tx('El botón "Palabras originales" al tocar un versículo.'); },
    routes: [] },
  { key: 'biblia_marcas', parent: 'biblia', get label() { return tx('Notas y resaltados'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Resaltar versículos con color, escribir notas y guardarlos.'); },
    get hides() { return tx('Los colores, las notas y "Mis notas y resaltados". Lo que ya marcaron no se borra.'); },
    routes: ['/biblia/marcas'] },
  { key: 'biblia_imagen', parent: 'biblia', get label() { return tx('Imagen con un versículo'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Armar una imagen linda con un versículo para compartir.'); },
    get hides() { return tx('El botón "Imagen" al tocar un versículo.'); },
    routes: ['/biblia/imagen'] },
  { key: 'biblia_audio', parent: 'biblia', get label() { return tx('Escuchar el capítulo'); }, group: 'La Biblia y crecer',
    get hint() { return tx('El teléfono lee el capítulo en voz alta.'); },
    get hides() { return tx('El botón del parlante en la Biblia.'); },
    routes: [] },
  { key: 'devocional', get label() { return tx('Devocional del día'); }, group: 'La Biblia y crecer',
    get hint() { return tx('El versículo del día con una frase y un estudio corto, con comentarios y rachas de lectura.'); },
    get hides() { return tx('La tarjeta del versículo en el inicio, el devocional y "Escribir devocionales".'); },
    routes: ['/devocional', '/admin/devocionales'] },
  { key: 'plan_lectura', get label() { return tx('Planes de lectura'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Cada hermano elige un plan y la app le dice qué leer cada día.'); },
    get hides() { return tx('La tarjeta "Plan de lectura" del inicio y los planes.'); },
    routes: ['/plan-lectura'] },
  { key: 'crecimiento', get label() { return tx('Artículos de crecimiento'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Temas para crecer: bautismo, oración, familia, cómo evangelizar y más.'); },
    get hides() { return tx('"Crecimiento" en el menú y en la barra de abajo.'); },
    routes: ['/crecimiento', '/t-crecimiento'] },
  { key: 'biblioteca', get label() { return tx('Biblioteca y capacitación'); }, group: 'La Biblia y crecer',
    get hint() { return tx('Libros por capítulos, artículos, videos cortos y mis notas de estudio.'); },
    get hides() { return tx('La biblioteca, la capacitación y "Mis notas".'); },
    routes: ['/materiales', '/material', '/capacitacion', '/notas'] },

  // ---------- Comunidad ----------
  { key: 'anuncios', get label() { return tx('Anuncios'); }, group: 'Comunidad',
    get hint() { return tx('Mensajes del pastor y los líderes a toda la iglesia o a un grupo.'); },
    get hides() { return tx('"Anuncios" y el cuadro de anuncios del inicio.'); },
    routes: ['/anuncios'] },
  { key: 'eventos', get label() { return tx('Calendario y eventos'); }, group: 'Comunidad',
    get hint() { return tx('Los eventos de la iglesia, con inscripción y cómo llegar.'); },
    get hides() { return tx('El calendario, los eventos, sus avisos y la página pública de cada evento.'); },
    routes: ['/eventos', '/t-eventos', '/evento', '/e'] },
  { key: 'evento_plan', parent: 'eventos', get label() { return tx('Planificador de eventos grandes'); }, group: 'Comunidad',
    get hint() { return tx('Para un campamento o una conferencia: entradas, programa, oradores, equipo y turnos de voluntarios.'); },
    get hides() { return tx('El botón "Planificar" de cada evento.'); },
    routes: ['/evento/plan'] },
  { key: 'evento_puerta', parent: 'eventos', get label() { return tx('Puerta del evento'); }, group: 'Comunidad',
    get hint() { return tx('Marcar a los que llegan leyendo su entrada (QR o chip) y la asistencia a cada momento del programa.'); },
    get hides() { return tx('La puerta, "Mi entrada" y la asistencia por sesión.'); },
    routes: ['/evento/puerta', '/evento/sesion', '/evento/boleto'] },
  { key: 'evento_credenciales', parent: 'eventos', get label() { return tx('Credenciales'); }, group: 'Comunidad',
    get hint() { return tx('Imprimir la credencial de cada inscripto, con su QR y su chip.'); },
    get hides() { return tx('La pantalla de credenciales.'); },
    routes: ['/evento/credenciales'] },
  { key: 'evento_contador', parent: 'eventos', get label() { return tx('Contador de la puerta'); }, group: 'Comunidad',
    get hint() { return tx('Una pantalla grande que muestra cuántos entraron y cuántos hay adentro.'); },
    get hides() { return tx('El contador en vivo.'); },
    routes: ['/evento/contador'] },
  { key: 'oracion', get label() { return tx('Pedidos de oración'); }, group: 'Comunidad',
    get hint() { return tx('Pedidos de oración y quiénes oran por cada uno.'); },
    get hides() { return tx('"Oración" y sus avisos.'); },
    routes: ['/oracion', '/t-oracion'] },
  { key: 'oracion_respondidas', parent: 'oracion', get label() { return tx('Oraciones respondidas'); }, group: 'Comunidad',
    get hint() { return tx('Contar lo que Dios hizo, para que toda la iglesia dé gracias.'); },
    get hides() { return tx('El botón "Oraciones respondidas".'); },
    routes: ['/oraciones-respondidas'] },
  { key: 'chat', get label() { return tx('Chat de la iglesia'); }, group: 'Comunidad',
    get hint() { return tx('El chat de toda la iglesia.'); },
    get hides() { return tx('El chat de toda la iglesia (los chats de cada ministerio siguen).'); },
    routes: ['/chat', '/t-chat'] },
  { key: 'mensajes', get label() { return tx('Mensajes entre hermanos'); }, group: 'Comunidad',
    get hint() { return tx('Conversaciones privadas entre dos hermanos (texto, fotos y voz). Solo las ven ellos dos; se puede bloquear y denunciar.'); },
    get hides() { return tx('"Mensajes" y el botón de escribirle a un hermano desde el directorio.'); },
    routes: ['/mensajes'] },
  { key: 'mensajes_pastor', get label() { return tx('Mensajes privados al pastor'); }, group: 'Comunidad',
    get hint() { return tx('Cada hermano le puede escribir al pastor en privado.'); },
    get hides() { return tx('"Escribile al pastor" y la bandeja del pastor.'); },
    routes: ['/pastor-hilo', '/pastor-bandeja'] },
  { key: 'directorio', get label() { return tx('Directorio'); }, group: 'Comunidad',
    get hint() { return tx('La lista de hermanos con su teléfono, para los que aceptaron mostrarse.'); },
    get hides() { return tx('"Directorio" en el menú y en la barra de abajo.'); },
    routes: ['/directorio', '/t-directorio'] },
  { key: 'hogares', get label() { return tx('Familias'); }, group: 'Comunidad',
    get hint() { return tx('Juntar a las personas de una misma casa: padres, hijos y quién vive con quién.'); },
    get hides() { return tx('El cuadro "Familia" en la ficha de cada persona. Las familias ya armadas no se borran.'); },
    routes: [] },
  { key: 'cumples', get label() { return tx('Cumpleaños'); }, group: 'Comunidad',
    get hint() { return tx('Los cumpleaños del día y de los próximos días, con un saludo listo.'); },
    get hides() { return tx('"Cumpleaños", el saludo del inicio y los avisos de cumpleaños.'); },
    routes: ['/cumples'] },
  { key: 'sugerencias', get label() { return tx('Sugerencias'); }, group: 'Comunidad',
    get hint() { return tx('Ideas y opiniones de los hermanos para el pastor.'); },
    get hides() { return tx('El botón "Sugerencias" y el aviso de cada sugerencia nueva.'); },
    routes: ['/sugerencias'] },
  { key: 'misioneros', get label() { return tx('Misioneros'); }, group: 'Comunidad',
    get hint() { return tx('Los misioneros que sostiene la iglesia, con su informe de cada mes.'); },
    get hides() { return tx('"Misioneros" y el aviso de cada informe nuevo.'); },
    routes: ['/misioneros'] },
  { key: 'ubicacion_familia', get label() { return tx('Ubicación en familia'); }, group: 'Comunidad',
    get hint() { return tx('Cada hermano puede compartir dónde está con su familia y con quien él elija. Viene apagado: lo prende cada uno, y solo lo ven las personas que eligió.'); },
    get hides() { return tx('"Ubicación en familia". Nadie puede compartir ni ver ubicaciones (también lo frena el servidor).'); },
    routes: ['/familia-ubicacion', '/familia-historial'] },
  { key: 'bautismos', get label() { return tx('Certificados'); }, group: 'Comunidad',
    get hint() { return tx('El certificado de bautismo y el de miembro, para ver, guardar, compartir o imprimir.'); },
    get hides() { return tx('Los certificados y los botones para imprimirlos en la ficha de la persona.'); },
    routes: ['/certificado'] },
  { key: 'rifas', get label() { return tx('Sorteos'); }, group: 'Comunidad',
    get hint() { return tx('Sorteos digitales: entran los que estuvieron presentes y la app saca al azar.'); },
    get hides() { return tx('El botón "Sorteos" y el botón de sortear dentro de un evento.'); },
    routes: ['/rifas'] },
  { key: 'cancionero', get label() { return tx('Cancionero'); }, group: 'Comunidad',
    get hint() { return tx('Las canciones que cantamos, con la letra y el enlace para escucharlas.'); },
    get hides() { return tx('El botón "Cancionero" del menú.'); },
    routes: ['/canciones'] },
  { key: 'musica', get label() { return tx('Música de la iglesia'); }, group: 'Comunidad',
    get hint() { return tx('Las listas de Spotify y YouTube Music con la música que cantamos y escuchamos.'); },
    get hides() { return tx('El botón "Música" del menú.'); },
    routes: ['/musica', '/admin/musica'] },
  { key: 'radio', get label() { return tx('Radio de la iglesia'); }, group: 'Comunidad',
    get hint() { return tx('La radio FM y la radio por internet para escuchar desde la app.'); },
    get hides() { return tx('El botón "Radio" del menú.'); },
    routes: ['/radio', '/admin/radio'] },

  // ---------- Dinero e informes ----------
  { key: 'finanzas', get label() { return tx('Finanzas de la iglesia'); }, group: 'Dinero e informes',
    get hint() { return tx('Ingresos, gastos, fondos y comprobantes. Si tu iglesia lleva las cuentas en otro lado, apagalo.'); },
    get hides() { return tx('"Finanzas", los gastos automáticos y el informe del mes de la tesorería.'); },
    routes: ['/finanzas'] },
  { key: 'ofrendas_persona', get label() { return tx('Ofrendas por persona'); }, group: 'Dinero e informes',
    get hint() { return tx('Anotar quién dio cada ofrenda, la hoja del año de cada persona y "Mis ofrendas" para cada hermano. Si tu iglesia no lleva la cuenta de quién dio, apagalo.'); },
    get hides() { return tx('"Ofrendas por persona", la hoja del año y "Mis ofrendas". El servidor tampoco deja anotar ni leer.'); },
    routes: ['/finanzas/ofrendas', '/finanzas/ofrenda-estado', '/mis-ofrendas'] },
  { key: 'ofrendar', get label() { return tx('Ofrendar'); }, group: 'Dinero e informes',
    get hint() { return tx('Los datos de la cuenta de la iglesia para dar la ofrenda.'); },
    get hides() { return tx('El botón "Ofrendar" con los datos de la cuenta.'); },
    routes: ['/dar'] },
  { key: 'informes', get label() { return tx('Informes y progreso'); }, group: 'Dinero e informes',
    get hint() { return tx('El informe semanal, los informes escritos y cómo viene la iglesia mes a mes.'); },
    get hides() { return tx('Los informes, el progreso de la iglesia y el informe que llega cada semana.'); },
    routes: ['/reporte', '/informes', '/progreso-iglesia'] },
];

export const FEATURE_GROUPS: FeatureGroup[] = ['Evangelismo y visitas', 'Reuniones y enseñanza', 'La Biblia y crecer', 'Comunidad', 'Dinero e informes'];

/** Lo que no se puede apagar (sin esto la app no funciona o no se podría volver a prender nada). */
export const CORE_ROUTES = [
  '/', '/login', '/demo', '/registro', '/registro-enviado', '/recuperar', '/empezar', '/ajustes', '/seguridad', '/avisos', '/panel', '/importar',
  '/persona', '/contacto', '/personas', '/iglesia', '/yo', '/admin', '/escritorio', '/miembro-vista', '/inactivos',
  '/central', // La Mies Central: solo el equipo de La Mies; ninguna iglesia lo puede apagar
];

/** Lo que siempre está prendido, con el porqué, para mostrarlo en la pantalla de Funciones. */
export const CORE_PARTS: { label: string; why: string }[] = [
  { get label() { return tx('Entrar y crear la cuenta'); }, get why() { return tx('Sin esto nadie puede usar la app.'); } },
  { get label() { return tx('Personas: la lista y la ficha de cada uno'); }, get why() { return tx('Casi todo lo demás se apoya en la lista de personas.'); } },
  { get label() { return tx('Ajustes de la iglesia y días de reunión'); }, get why() { return tx('Es donde se arma la iglesia: nombre, logo y reuniones.'); } },
  { get label() { return tx('Roles, permisos y cuentas'); }, get why() { return tx('Para decidir quién puede ver y hacer cada cosa.'); } },
  { get label() { return tx('Funciones de la iglesia (esta pantalla)'); }, get why() { return tx('Si se apagara, no se podría volver a prender nada.'); } },
  { get label() { return tx('Avisos'); }, get why() { return tx('Es donde llega todo lo que la app te tiene que decir.'); } },
  { get label() { return tx('Inactivos e importar personas'); }, get why() { return tx('Son parte de cuidar la lista de personas.'); } },
  { get label() { return tx('Panel del pastor'); }, get why() { return tx('El resumen de la iglesia y el código para que se sumen los hermanos.'); } },
  { get label() { return tx('Copia de todos los datos'); }, get why() { return tx('El pastor siempre puede bajar los datos de su iglesia.'); } },
  { get label() { return tx('Primeros pasos, seguridad y ayuda'); }, get why() { return tx('Para empezar y para pedir ayuda cuando haga falta.'); } },
];

const BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));
export const featureInfo = (k: FeatureKey): Feature => BY_KEY.get(k)!;
export const isFeatureKey = (k: string): k is FeatureKey => BY_KEY.has(k as FeatureKey);

/** "/(tabs)/mapa?x=1" -> "/mapa" */
export function cleanPath(path: string): string {
  let s = (path ?? '').split('?')[0].split('#')[0].replace(/\/\([^/]*\)/g, '');
  if (!s.startsWith('/')) s = `/${s}`;
  s = s.replace(/\/+$/, '');
  return s || '/';
}

/** ¿De qué función es esta dirección? null: es de la base de la app (no se puede apagar). Gana la dirección más específica. */
export function featureOfPath(path: string): FeatureKey | null {
  const p = cleanPath(path);
  let best: FeatureKey | null = null;
  let len = -1;
  for (const f of FEATURES) {
    for (const r of f.routes) {
      if ((p === r || p.startsWith(`${r}/`)) && r.length > len) { best = f.key; len = r.length; }
    }
  }
  return best;
}

export type Disabled = readonly string[] | null | undefined;

/** Las partes que cuelgan de una función (en el orden de la lista). */
export const childrenOf = (key: FeatureKey): Feature[] => FEATURES.filter((f) => f.parent === key);
/** Las funciones principales de un grupo (las que no son parte de otra). */
export const topFeatures = (group: FeatureGroup): Feature[] => FEATURES.filter((f) => f.group === group && !f.parent);

/** ¿Está prendida? Una parte está apagada si ella o la función de la que depende están apagadas. */
export function featureOn(disabled: Disabled, key: FeatureKey): boolean {
  const off = disabled ?? [];
  if (off.includes(key)) return false;
  const parent = BY_KEY.get(key)?.parent;
  return !parent || !off.includes(parent);
}

/** ¿Se puede abrir esta dirección? */
export function pathOn(disabled: Disabled, path: string): boolean {
  const k = featureOfPath(path);
  return k === null || featureOn(disabled, k);
}

/** Lo que guarda la base: sin repetidos y solo funciones que existen. */
export function cleanDisabled(list: unknown): FeatureKey[] {
  if (!Array.isArray(list)) return [];
  return list.filter((k, i): k is FeatureKey => typeof k === 'string' && isFeatureKey(k) && list.indexOf(k) === i);
}

export function toggled(disabled: Disabled, key: FeatureKey, enabled: boolean): FeatureKey[] {
  const rest = cleanDisabled(disabled).filter((k) => k !== key);
  return enabled ? rest : [...rest, key];
}

/** Cuántas funciones se ven prendidas de verdad (contando las partes). */
export function countOn(disabled: Disabled): number {
  return FEATURES.filter((f) => featureOn(disabled, f.key)).length;
}

const plainText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Buscar en la lista de funciones por nombre, explicación o lo que oculta. Si coincide una parte, también va la función de la que depende. */
export function searchFeatures(q: string): Set<FeatureKey> {
  const s = plainText(q.trim());
  const out = new Set<FeatureKey>();
  if (!s) return out;
  for (const f of FEATURES) {
    if (plainText(`${f.label} ${f.hint} ${f.hides}`).includes(s)) {
      out.add(f.key);
      if (f.parent) out.add(f.parent);
    }
  }
  return out;
}

/** ¿Cambió algo de lo que decide qué se ve? (el orden de la lista no importa) */
export function switchesChanged(a: { disabled_features?: readonly string[] | null; bible?: unknown } | null | undefined, b: { disabled_features?: readonly string[] | null; bible?: unknown } | null | undefined): boolean {
  const list = (x: readonly string[] | null | undefined) => [...(x ?? [])].sort().join(',');
  return list(a?.disabled_features) !== list(b?.disabled_features) || JSON.stringify(a?.bible ?? null) !== JSON.stringify(b?.bible ?? null);
}
