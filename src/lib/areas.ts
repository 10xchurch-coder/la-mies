// A qué área pertenece cada pantalla, para pintarla con el color de su área (el mismo del menú).
// No importa nada de la app para poder probarse sola.
export type AreaTone = 'green' | 'blue' | 'amber' | 'violet' | 'teal' | 'pink';

const BY_SEGMENT: Record<string, AreaTone> = {
  // Reuniones
  asistencia: 'green', 'asistencia-chip': 'green', chips: 'green', ninos: 'green', eventos: 'green', evento: 'green', vivo: 'green', colectivo: 'green', 'colectivo-vivo': 'green', 'colectivo-paradas': 'green', rifas: 'green', suspender: 'green', presentar: 'green',
  // Crecer
  crecimiento: 'blue', oracion: 'blue', predicas: 'blue', predica: 'blue', clases: 'blue', clase: 'blue', canciones: 'blue', musica: 'blue', radio: 'blue',
  devocional: 'blue', 'plan-lectura': 'blue', biblia: 'blue', capacitacion: 'blue', material: 'blue', materiales: 'blue', notas: 'blue', progreso: 'blue', certificado: 'blue',
  // Comunidad
  chat: 'violet', directorio: 'violet', ministerios: 'violet', ministerio: 'violet', anuncios: 'violet', misioneros: 'violet', dar: 'violet', sugerencias: 'violet',
  mensajes: 'violet', 'pastor-hilo': 'violet', 'pastor-bandeja': 'violet', avisos: 'violet',
  // Personas y seguimiento
  seguimiento: 'amber', ausencias: 'amber', inactivos: 'amber', cumples: 'amber', fidelidad: 'amber', persona: 'amber', contacto: 'amber', personas: 'amber',
  // Informes y evangelismo
  reporte: 'teal', 'progreso-iglesia': 'teal', panel: 'teal', equipo: 'teal', salidas: 'teal', salida: 'teal', 'salida-chat': 'teal', salieron: 'teal', informes: 'teal',
  zonas: 'teal', zona: 'teal', vereda: 'teal', mapa: 'teal', tablero: 'teal', resumen: 'teal', recortar: 'teal', ubicacion: 'teal',
  // Administración
  finanzas: 'pink', admin: 'pink', 'miembro-vista': 'pink', importar: 'pink', ajustes: 'pink', seguridad: 'pink',
};
const ADMIN_PEOPLE = new Set(['miembros', 'miembro', 'inactivos']);
// Pantallas que viven en /admin pero son de "Crecer" (así figuran en el menú).
const ADMIN_GROW = new Set(['devocionales', 'musica', 'radio']);

/** El color del área de una pantalla, por los pedazos de su ruta ("(tabs)", "t-chat"...). */
export function areaOf(segments: string[]): AreaTone {
  const s = segments.filter((x) => !x.startsWith('('));
  const first = (s[0] ?? '').replace(/^t-/, '');
  if (first === 'admin' && ADMIN_PEOPLE.has(s[1] ?? '')) return 'amber';
  if (first === 'admin' && ADMIN_GROW.has(s[1] ?? '')) return 'blue';
  if (first === 'escritorio' && s[1] === 'personas') return 'amber';
  return BY_SEGMENT[first] ?? 'green';
}
