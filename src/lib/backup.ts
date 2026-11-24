// Copia de todos los datos de la iglesia: qué tablas se bajan, cómo se arma cada planilla (CSV) y el archivo ZIP.
// Acá no hay nada de la base ni de la pantalla, para poder probarse solo.
// Todo se lee con los permisos de quien está logueado: la base nunca entrega datos de otra iglesia.
import * as XLSX from 'xlsx';
import { toCsv } from './desk';

export type BackupTable = {
  table: string;
  /** Nombre del archivo dentro de la copia (sin .csv). */
  file: string;
  title: string;
  /** Columnas a pedir (por defecto, todas). */
  select?: string;
  /** Orden fijo, para que al leer de a tandas no se repita ni se saltee ninguna fila. */
  order: string[];
  /** La tabla tiene la columna de la iglesia: se filtra también por ella, además de lo que ya filtra la base. */
  byChurch: boolean;
  /** Solo para quien tiene permiso de finanzas. */
  finance?: boolean;
};

export const BACKUP_TABLES: BackupTable[] = [
  { table: 'contacts', file: '01-personas', title: 'Personas', order: ['id'], byChurch: true },
  { table: 'contact_children', file: '02-hijos', title: 'Hijos anotados en las fichas', order: ['id'], byChurch: false },
  { table: 'households', file: '03-familias', title: 'Familias', order: ['id'], byChurch: true },
  { table: 'household_members', file: '04-familias-integrantes', title: 'Integrantes de cada familia', order: ['household_id', 'contact_id'], byChurch: false },
  { table: 'profiles', file: '05-cuentas', title: 'Cuentas de la app', select: 'id, church_id, display_name, role, extra_roles, title, finance_role, created_at, disabled_at', order: ['id'], byChurch: true },
  { table: 'groups', file: '06-grupos-o-rutas', title: 'Grupos o rutas', order: ['id'], byChurch: true },
  { table: 'church_services', file: '10-reuniones', title: 'Reuniones', order: ['id'], byChurch: true },
  { table: 'attendances', file: '11-asistencia', title: 'Asistencia a las reuniones', order: ['id'], byChurch: true },
  { table: 'contact_visits', file: '20-visitas-y-notas', title: 'Visitas y notas de seguimiento', order: ['id'], byChurch: true },
  { table: 'follow_up_tasks', file: '21-seguimiento', title: 'Tareas de seguimiento', order: ['id'], byChurch: true },
  { table: 'events', file: '30-eventos', title: 'Eventos', order: ['id'], byChurch: true },
  { table: 'event_registrations', file: '31-eventos-inscripciones', title: 'Inscripciones a eventos', order: ['id'], byChurch: true },
  { table: 'prayer_requests', file: '40-pedidos-de-oracion', title: 'Pedidos de oración', order: ['id'], byChurch: true },
  { table: 'classes', file: '50-clases', title: 'Clases', order: ['id'], byChurch: true },
  { table: 'class_students', file: '51-clases-alumnos', title: 'Alumnos de cada clase', order: ['class_id', 'contact_id'], byChurch: false },
  { table: 'class_teachers', file: '52-clases-maestros', title: 'Maestros de cada clase', order: ['id'], byChurch: false },
  { table: 'class_attendance', file: '53-clases-asistencia', title: 'Asistencia a las clases', order: ['id'], byChurch: true },
  { table: 'ministries', file: '60-ministerios', title: 'Ministerios', order: ['id'], byChurch: true },
  { table: 'ministry_people', file: '61-ministerios-personas', title: 'Personas de cada ministerio', order: ['ministry_id', 'contact_id'], byChurch: false },
  { table: 'fin_funds', file: '70-finanzas-fondos', title: 'Finanzas: fondos', order: ['id'], byChurch: true, finance: true },
  { table: 'fin_accounts', file: '71-finanzas-cuentas', title: 'Finanzas: cuentas', order: ['id'], byChurch: true, finance: true },
  { table: 'fin_categories', file: '72-finanzas-categorias', title: 'Finanzas: categorías', order: ['id'], byChurch: true, finance: true },
  { table: 'fin_entries', file: '73-finanzas-movimientos', title: 'Finanzas: movimientos', order: ['id'], byChurch: true, finance: true },
  { table: 'admin_giving', file: '74-finanzas-ofrendas-por-persona', title: 'Finanzas: ofrendas por persona', order: ['id'], byChurch: true, finance: true },
];

export const PAGE = 1000;

/** Lo que se baja según los permisos: las finanzas solo si la persona tiene permiso de finanzas. */
export function backupPlan(finance: boolean): BackupTable[] {
  return BACKUP_TABLES.filter((t) => !t.finance || finance);
}

/** Columnas que nunca salen en la copia (llaves para entrar, no datos de la iglesia). */
const SECRET = new Set(['access_token', 'push_token', 'token', 'token_hash']);

/** Una celda segura: los textos que una planilla tomaría como fórmula (=, @, o + / − sin número) llevan un apóstrofo adelante. */
export function safeCell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return /^[=@]/.test(s) || /^[+-](?![\d\s(])/.test(s) || /^[\t\r]/.test(s) ? `'${s}` : s;
}

/**
 * Arma la planilla de una tabla. Las columnas salen en el orden en que aparecen.
 * Si hay `names` (id de persona → nombre), al lado de cada "contact_id" se agrega la columna "persona".
 */
export function rowsToCsv(rows: Record<string, unknown>[], names?: Map<string, string>): string {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k) && !SECRET.has(k)) { seen.add(k); cols.push(k); }
  const withName = !!names && seen.has('contact_id');
  const header = cols.flatMap((c) => (c === 'contact_id' && withName ? [c, 'persona'] : [c]));
  const body = rows.map((r) => cols.flatMap((c) => {
    const cell = safeCell(r[c]);
    return c === 'contact_id' && withName ? [cell, safeCell(names!.get(String(r[c] ?? '')) ?? '')] : [cell];
  }));
  return toCsv(header.length ? header : ['sin datos'], body);
}

/** Las tandas para leer una tabla grande: [0, 999], [1000, 1999]... Corta cuando una tanda viene incompleta. */
export function nextRange(got: number, lastBatch: number | null, page = PAGE): [number, number] | null {
  if (lastBatch !== null && lastBatch < page) return null;
  return [got, got + page - 1];
}

export type BackupResult = { file: string; title: string; rows: number; error?: string };

/** El archivo LEEME de la copia: qué hay en cada planilla, en palabras simples. */
export function backupReadme(o: { church: string; when: string; who: string; results: BackupResult[]; finance: boolean }): string {
  const lines = o.results.map((r) => `- ${r.file}.csv: ${r.title} (${r.error ? `NO SE PUDO BAJAR: ${r.error}` : `${r.rows} ${r.rows === 1 ? 'fila' : 'filas'}`})`);
  return [
    `Copia de todos los datos de ${o.church}`,
    `Hecha el ${o.when} por ${o.who}, desde la app La Mies.`,
    '',
    'Cada archivo .csv es una planilla. Se abre con Excel, Google Sheets o LibreOffice (las columnas están separadas por punto y coma).',
    'Las columnas que terminan en "_id" son números internos que unen una planilla con otra. Por ejemplo, "contact_id" es la persona de 01-personas.csv.',
    'Las planillas que hablan de una persona traen al lado la columna "persona" con su nombre.',
    '',
    'Qué trae:',
    ...lines,
    '',
    o.finance ? 'Trae las finanzas porque quien la bajó tiene permiso de finanzas.' : 'NO trae las finanzas: quien la bajó no tiene permiso de finanzas.',
    'Trae solo lo que esa persona puede ver en la app. Por ejemplo, los pedidos de oración privados de otros no salen.',
    'No trae las fotos ni los archivos (comprobantes, prédicas, materiales): solo los datos.',
    '',
    'CUIDADO: acá hay teléfonos, domicilios y datos privados de los hermanos. Guardalo en un lugar seguro y no lo compartas.',
    '',
  ].join('\r\n');
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Junta varios archivos de texto en un solo ZIP (con la librería de planillas que la app ya tiene). */
export function zipFiles(files: { name: string; text: string }[]): Uint8Array {
  const cfb = XLSX.CFB.utils.cfb_new();
  for (const f of files) XLSX.CFB.utils.cfb_add(cfb, `/${f.name}`, utf8(f.text));
  const out = XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }) as unknown;
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer | number[]);
}

/** "Iglesia Bautista Victoria" + fecha -> "copia-iglesia-bautista-victoria-2026-11-24" */
export function backupName(church: string, day: string): string {
  const slug = church.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'iglesia';
  return `copia-${slug}-${day}`;
}
