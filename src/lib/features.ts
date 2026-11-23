// Las funciones de la app que cada iglesia puede prender o apagar (en Ajustes, solo el pastor o el administrador de la app).
// Lo apagado se esconde del menú, de la barra de abajo y del escritorio, y la pantalla no se puede abrir (ni por un link).
// No se borra nada: si se vuelve a prender, todo está como estaba.
// Sin nada de la base ni de la pantalla, para poder probarse sola.

export type FeatureKey =
  | 'evangelismo' | 'seguimiento' | 'colectivo'
  | 'asistencia' | 'ninos' | 'clases' | 'ministerios' | 'predicas' | 'vivo' | 'devocional' | 'biblioteca'
  | 'chat' | 'oracion' | 'eventos' | 'directorio' | 'cumples' | 'anuncios' | 'sugerencias' | 'misioneros' | 'mensajes_pastor' | 'bautismos'
  | 'musica' | 'cancionero' | 'radio' | 'rifas' | 'mensajes'
  | 'finanzas' | 'ofrendar' | 'informes';

export type FeatureGroup = 'Evangelismo y visitas' | 'Reuniones y enseñanza' | 'Comunidad' | 'Dinero e informes';

export type Feature = {
  key: FeatureKey;
  label: string;
  hint: string;
  group: FeatureGroup;
  /** Las pantallas que abre: se bloquea esa dirección y todo lo que cuelga de ella. */
  routes: string[];
};

export const FEATURES: Feature[] = [
  { key: 'evangelismo', label: 'Evangelismo en las calles', group: 'Evangelismo y visitas',
    hint: 'Salir a golpear puertas con el mapa, las zonas y quiénes salieron. Si tu iglesia no sale a las calles, apagalo.',
    routes: ['/mapa', '/salida', '/salidas', '/salida-chat', '/salieron', '/equipo', '/zonas', '/zona', '/vereda', '/recortar', '/resumen', '/ubicacion', '/tablero', '/progreso', '/contacto/nuevo'] },
  { key: 'seguimiento', label: 'Seguimiento de visitas', group: 'Evangelismo y visitas',
    hint: 'Mis contactos para seguir y los avisos de a quién escribir o visitar.',
    routes: ['/seguimiento', '/admin/seguimiento'] },
  { key: 'colectivo', label: 'Colectivo y rutas', group: 'Evangelismo y visitas',
    hint: 'Las rutas del colectivo, los pasajeros y el colectivo en vivo.',
    routes: ['/colectivo', '/colectivo-vivo'] },

  { key: 'asistencia', label: 'Asistencia a las reuniones', group: 'Reuniones y enseñanza',
    hint: 'Tomar asistencia, quiénes faltaron y la fidelidad de cada uno.',
    routes: ['/asistencia', '/ausencias', '/fidelidad', '/suspender', '/escritorio/asistencia', '/admin/reuniones'] },
  { key: 'ninos', label: 'Entrada y retiro de los chicos', group: 'Reuniones y enseñanza',
    hint: 'La guardería y las clases de los chicos, con código para retirarlos.',
    routes: ['/ninos'] },
  { key: 'clases', label: 'Escuela dominical', group: 'Reuniones y enseñanza',
    hint: 'Las clases, sus maestros, los turnos y la asistencia de cada clase.',
    routes: ['/clases', '/clase'] },
  { key: 'ministerios', label: 'Ministerios y turnos', group: 'Reuniones y enseñanza',
    hint: 'Los grupos de servicio de la iglesia, con su chat y sus turnos.',
    routes: ['/ministerios', '/ministerio'] },
  { key: 'predicas', label: 'Prédicas', group: 'Reuniones y enseñanza',
    hint: 'Los mensajes de cada semana con su video y su audio.',
    routes: ['/predicas', '/t-predicas', '/predica'] },
  { key: 'vivo', label: 'Culto en vivo', group: 'Reuniones y enseñanza',
    hint: 'La transmisión del culto, con comentarios y notas.',
    routes: ['/vivo'] },
  { key: 'devocional', label: 'Devocional y lectura de la Biblia', group: 'Reuniones y enseñanza',
    hint: 'El versículo del día, los planes de lectura y los artículos de crecimiento.',
    routes: ['/devocional', '/crecimiento', '/t-crecimiento', '/plan-lectura', '/admin/devocionales'] },
  { key: 'biblioteca', label: 'Biblioteca y capacitación', group: 'Reuniones y enseñanza',
    hint: 'Libros por capítulos, artículos, videos cortos y mis notas de estudio.',
    routes: ['/materiales', '/material', '/capacitacion', '/notas'] },

  { key: 'chat', label: 'Chat de la iglesia', group: 'Comunidad',
    hint: 'El chat de toda la iglesia.',
    routes: ['/chat', '/t-chat'] },
  { key: 'oracion', label: 'Pedidos de oración', group: 'Comunidad',
    hint: 'Pedidos de oración y quiénes oran por cada uno.',
    routes: ['/oracion', '/t-oracion'] },
  { key: 'eventos', label: 'Calendario y eventos', group: 'Comunidad',
    hint: 'Los eventos de la iglesia, con inscripción y cómo llegar.',
    routes: ['/eventos', '/t-eventos', '/evento'] },
  { key: 'directorio', label: 'Directorio', group: 'Comunidad',
    hint: 'La lista de hermanos con su teléfono, para los que aceptaron mostrarse.',
    routes: ['/directorio', '/t-directorio'] },
  { key: 'cumples', label: 'Cumpleaños', group: 'Comunidad',
    hint: 'Los cumpleaños del día y de los próximos días, con un saludo listo.',
    routes: ['/cumples'] },
  { key: 'anuncios', label: 'Anuncios', group: 'Comunidad',
    hint: 'Mensajes del pastor y los líderes a toda la iglesia o a un grupo.',
    routes: ['/anuncios'] },
  { key: 'sugerencias', label: 'Sugerencias', group: 'Comunidad',
    hint: 'Ideas y opiniones de los hermanos para el pastor.',
    routes: ['/sugerencias'] },
  { key: 'misioneros', label: 'Misioneros', group: 'Comunidad',
    hint: 'Los misioneros que sostiene la iglesia, con su informe de cada mes.',
    routes: ['/misioneros'] },
  { key: 'mensajes_pastor', label: 'Mensajes privados al pastor', group: 'Comunidad',
    hint: 'Cada hermano le puede escribir al pastor en privado.',
    routes: ['/pastor-hilo', '/pastor-bandeja'] },
  { key: 'musica', label: 'Música de la iglesia', group: 'Comunidad',
    hint: 'Las listas de Spotify y YouTube Music con la música que cantamos y escuchamos.',
    routes: ['/musica', '/admin/musica'] },
  { key: 'cancionero', label: 'Cancionero', group: 'Comunidad',
    hint: 'Las canciones que cantamos, con la letra y el enlace para escucharlas.',
    routes: ['/canciones'] },
  { key: 'radio', label: 'Radio de la iglesia', group: 'Comunidad',
    hint: 'La radio FM y la radio por internet para escuchar desde la app.',
    routes: ['/radio', '/admin/radio'] },
  { key: 'mensajes', label: 'Mensajes entre hermanos', group: 'Comunidad',
    hint: 'Conversaciones privadas entre dos hermanos (texto, fotos y voz). Solo las ven ellos dos; se puede bloquear y denunciar.',
    routes: ['/mensajes'] },
  { key: 'rifas', label: 'Sorteos', group: 'Comunidad',
    hint: 'Sorteos digitales: entran los que estuvieron presentes y la app saca al azar.',
    routes: ['/rifas'] },
  { key: 'bautismos', label: 'Certificados de bautismo', group: 'Comunidad',
    hint: 'El certificado de cada bautismo para ver, guardar y compartir.',
    routes: ['/certificado'] },

  { key: 'finanzas', label: 'Finanzas de la iglesia', group: 'Dinero e informes',
    hint: 'Ingresos, gastos, fondos y comprobantes. Si tu iglesia lleva las cuentas en otro lado, apagalo.',
    routes: ['/finanzas'] },
  { key: 'ofrendar', label: 'Ofrendar', group: 'Dinero e informes',
    hint: 'Los datos de la cuenta de la iglesia para dar la ofrenda.',
    routes: ['/dar'] },
  { key: 'informes', label: 'Informes y progreso', group: 'Dinero e informes',
    hint: 'El informe semanal, los informes escritos y cómo viene la iglesia mes a mes.',
    routes: ['/reporte', '/informes', '/progreso-iglesia'] },
];

export const FEATURE_GROUPS: FeatureGroup[] = ['Evangelismo y visitas', 'Reuniones y enseñanza', 'Comunidad', 'Dinero e informes'];

/** Lo que no se puede apagar (sin esto la app no funciona o no se podría volver a prender nada). */
export const CORE_ROUTES = [
  '/', '/login', '/registro', '/registro-enviado', '/recuperar', '/ajustes', '/seguridad', '/avisos', '/panel', '/importar',
  '/persona', '/contacto', '/personas', '/iglesia', '/yo', '/admin', '/escritorio', '/miembro-vista', '/inactivos',
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

export const featureOn = (disabled: Disabled, key: FeatureKey): boolean => !(disabled ?? []).includes(key);

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
