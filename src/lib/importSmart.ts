// Importar personas, la versión fácil: lee una planilla o un texto pegado, encuentra sola la fila de títulos y el separador,
// adivina qué es cada columna (en castellano o en inglés), revisa cada fila y marca los repetidos dentro del archivo.
// Sin nada de la base ni de la pantalla, para poder probarse solo. Usa las reglas de celular de la app (lib/phone).
import { parseDate } from './importPeople';
import { formatPhone, phoneProblem } from './phone';
import { tx } from './i18n';

export type SmartField =
  | 'name' | 'lastname' | 'phone' | 'email' | 'address' | 'barrio' | 'birthdate' | 'sex' | 'marital'
  | 'baptized_on' | 'baptized' | 'member' | 'family' | 'skip';

export const SMART_LABELS: Record<SmartField, string> = {
  get name() { return tx('Nombre'); }, get lastname() { return tx('Apellido'); }, get phone() { return tx('Celular'); }, get email() { return tx('Correo'); }, get address() { return tx('Dirección'); }, get barrio() { return tx('Barrio'); },
  get birthdate() { return tx('Fecha de nacimiento'); }, get sex() { return tx('Sexo'); }, get marital() { return tx('Estado civil'); }, get baptized_on() { return tx('Fecha de bautismo'); },
  get baptized() { return tx('¿Bautizado? (sí o no)'); }, get member() { return tx('¿Miembro? (sí o no)'); }, get family() { return tx('Familia'); }, get skip() { return tx('No usar'); },
};
// La etiqueta se lee cada vez (no se copia al abrir la app), así sale en el idioma del momento.
export const SMART_OPTIONS = (Object.keys(SMART_LABELS) as SmartField[]).map((v) => ({ value: v, get label() { return SMART_LABELS[v]; } }));

export const norm = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// El orden importa: lo más específico primero ("fecha de bautismo" antes que "bautizado", "apellido" antes que "nombre").
const SYNONYMS: [SmartField, string[]][] = [
  ['name', ['nombre y apellido', 'apellido y nombre', 'nombre completo', 'nombres y apellidos', 'apellidos y nombres', 'full name']],
  ['lastname', ['apellido', 'apellidos', 'last name', 'lastname', 'surname']],
  ['name', ['nombre', 'nombres', 'name', 'first name', 'persona', 'hermano', 'hermana']],
  ['phone', ['celular', 'cel', 'telefono', 'tel', 'whatsapp', 'wsp', 'wpp', 'movil', 'numero', 'phone', 'mobile', 'cell', 'contacto', 'nro de celular', 'numero de telefono']],
  ['email', ['correo', 'mail', 'e mail', 'email', 'correo electronico']],
  ['barrio', ['barrio', 'zona', 'neighborhood', 'localidad']],
  ['address', ['direccion', 'domicilio', 'calle', 'address', 'casa']],
  ['birthdate', ['fecha de nacimiento', 'nacimiento', 'cumpleanos', 'cumple', 'fecha nac', 'f nac', 'fec nac', 'birthday', 'birthdate', 'date of birth', 'dob']],
  ['baptized_on', ['fecha de bautismo', 'fecha bautismo', 'bautismo', 'baptism date', 'baptized on']],
  ['baptized', ['bautizado', 'bautizada', 'bautizados', 'bautizo', 'baptized']],
  ['member', ['miembro', 'es miembro', 'membresia', 'member', 'membership']],
  ['family', ['familia', 'grupo familiar', 'family', 'household', 'hogar']],
  ['sex', ['sexo', 'genero', 'sex', 'gender']],
  ['marital', ['estado civil', 'civil', 'marital status']],
];

/** Para qué sirve un título de columna, o null si no se reconoce. */
export function fieldOfHeader(header: string): SmartField | null {
  const n = norm(header);
  if (!n || /^\d+$/.test(n)) return null;
  const exact = SYNONYMS.find(([, list]) => list.includes(n));
  if (exact) return exact[0];
  const part = SYNONYMS.find(([, list]) => list.some((w) => w.length > 3 && (n.startsWith(`${w} `) || n.endsWith(` ${w}`) || n.includes(` ${w} `))));
  return part ? part[0] : null;
}

// ---------- Leer el texto ----------
/** El separador más probable: el que aparece la misma cantidad de veces en casi todas las primeras líneas. */
export function detectDelimiter(text: string): string {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 12);
  let best = ','; let score = -1;
  for (const d of ['\t', ';', ',', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const max = Math.max(0, ...counts);
    if (!max) continue;
    // Cuántas líneas tienen esa misma cantidad (las filas de datos son parejas; un título suelto arriba no).
    const same = counts.filter((c) => c === max).length;
    const s = same * 100 + max + (d === '\t' ? 0.5 : 0);
    if (s > score) { score = s; best = d; }
  }
  return best;
}

/** Texto con separadores (CSV, o lo copiado de una planilla) a filas. Respeta las comillas. Saca las filas vacías. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const delim = delimiter ?? detectDelimiter(t);
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

/** En qué fila están los títulos (entre las primeras 10). -1: no hay títulos, todo son datos. */
export function findHeaderRow(table: string[][]): number {
  let best = -1; let bestHits = 0;
  table.slice(0, 10).forEach((r, i) => {
    const hits = r.filter((c) => fieldOfHeader(c) !== null).length;
    if (hits > bestHits) { bestHits = hits; best = i; }
  });
  // Un solo título reconocido alcanza si esa fila no tiene números de teléfono ni correos (o sea, no es un dato).
  if (best >= 0 && bestHits === 1 && table[best].some((c) => /@/.test(c) || c.replace(/\D/g, '').length >= 7)) return -1;
  return best;
}

const share = (values: string[], test: (v: string) => boolean): number => {
  const filled = values.filter((v) => v.trim() !== '');
  return filled.length ? filled.filter(test).length / filled.length : 0;
};
const isYesNo = (v: string) => yesNo(v) !== undefined;
const isDateLike = (v: string) => parseDate(v) !== undefined;
const isPhoneLike = (v: string) => { const d = v.replace(/\D/g, ''); return d.length >= 7 && d.length <= 15 && !isDateLike(v) && !/[a-z]{3}/i.test(v); };

/** Qué parece una columna mirando sus datos (cuando no hay título o no se reconoce). */
export function guessByContent(values: string[]): SmartField | null {
  if (share(values, (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) >= 0.6) return 'email';
  if (share(values, isPhoneLike) >= 0.6) return 'phone';
  if (share(values, isDateLike) >= 0.6) return 'birthdate';
  return null;
}

/** Qué es cada columna: primero por el título, después por los datos. Cada campo se usa una sola vez. */
export function mapColumns(headers: string[], data: string[][]): SmartField[] {
  const width = Math.max(headers.length, ...data.slice(0, 50).map((r) => r.length), 0);
  const used = new Set<SmartField>();
  const out: SmartField[] = Array.from({ length: width }, () => 'skip');
  const col = (i: number) => data.slice(0, 200).map((r) => String(r[i] ?? ''));
  const take = (i: number, f: SmartField | null) => { if (f && f !== 'skip' && !used.has(f)) { used.add(f); out[i] = f; } };
  for (let i = 0; i < width; i++) {
    let f = fieldOfHeader(headers[i] ?? '');
    // "Bautizado" o "Bautismo": si trae fechas es la fecha; si trae sí/no es la marca.
    if (f === 'baptized' && share(col(i), isDateLike) >= 0.6) f = 'baptized_on';
    else if (f === 'baptized_on' && share(col(i), isYesNo) >= 0.6) f = 'baptized';
    // Una columna "Miembro" con nombres adentro es la lista de miembros, no un sí/no.
    else if (f === 'member' && share(col(i), isYesNo) < 0.5 && share(col(i), (v) => /[a-zñáéíóú]{3}/i.test(v)) >= 0.8) f = 'name';
    take(i, f);
  }
  for (let i = 0; i < width; i++) if (out[i] === 'skip' && !fieldOfHeader(headers[i] ?? '')) take(i, guessByContent(col(i)));
  // Sin columna de nombre: la primera columna de texto que quedó sin usar.
  if (!used.has('name')) {
    for (let i = 0; i < width; i++) {
      if (out[i] === 'skip' && share(col(i), (v) => /[a-zñáéíóú]{2}/i.test(v) && !/\d{3}/.test(v)) >= 0.8) { take(i, 'name'); break; }
    }
  }
  return out;
}

export type ParsedTable = { headers: string[]; data: string[][]; fields: SmartField[]; hasHeader: boolean; skippedTop: number };
/** De la tabla cruda (de un Excel, un CSV o un texto pegado) a títulos, datos y columnas ya adivinadas. */
export function analyzeTable(table: string[][]): ParsedTable {
  const clean = table.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c !== ''));
  const h = findHeaderRow(clean);
  const data = h >= 0 ? clean.slice(h + 1) : clean;
  const width = Math.max(0, ...clean.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => (h >= 0 ? clean[h][i] ?? '' : '') || tx('Columna {v1}', { v1: i + 1 }));
  return { headers, data, fields: mapColumns(h >= 0 ? clean[h] : [], data), hasHeader: h >= 0, skippedTop: Math.max(h, 0) };
}
export const analyzeText = (text: string): ParsedTable => analyzeTable(parseDelimited(text));

// ---------- Revisar cada fila ----------
export function yesNo(v: unknown): boolean | undefined {
  const n = norm(v);
  if (['si', 's', 'yes', 'y', 'x', '1', 'true', 'verdadero', 'bautizado', 'bautizada', 'miembro', 'activo', 'activa'].includes(n)) return true;
  if (['no', 'n', '0', 'false', 'falso', 'visita', 'visitante', 'no miembro', 'simpatizante'].includes(n)) return false;
  return undefined;
}
const sexOf = (v: string) => { const n = norm(v); return ['m', 'masculino', 'hombre', 'varon', 'male', 'h'].includes(n) ? 'm' : ['f', 'femenino', 'mujer', 'female'].includes(n) ? 'f' : undefined; };
const maritalOf = (v: string) => {
  const n = norm(v);
  if (/^(soltero|soltera|single)/.test(n)) return 'single';
  if (/^(casado|casada|married)/.test(n)) return 'married';
  if (/^(viudo|viuda|widow)/.test(n)) return 'widowed';
  if (/(pareja|union|concubin|convivi|partner)/.test(n)) return 'partner';
  return undefined;
};

export type ProblemKind = 'no_name' | 'bad_phone' | 'bad_date' | 'bad_email' | 'dup_file';
export type Problem = { kind: ProblemKind; text: string };
export type SmartRow = {
  /** El número de fila como se ve en la planilla (contando los títulos). */
  line: number;
  name: string; phone?: string; email?: string; address?: string; birthdate?: string; baptized_on?: string;
  sex?: string; marital?: string; baptized?: boolean; member?: boolean; family?: string;
  problems: Problem[];
};
export const blocking = (r: SmartRow): boolean => r.problems.some((p) => p.kind === 'no_name');
export const isFileDup = (r: SmartRow): boolean => r.problems.some((p) => p.kind === 'dup_file');

/** El celular de una fila con las reglas de la app. En Argentina se exige el número completo; de otro país alcanza con 8 cifras. */
export function checkPhone(raw: string, country = 'AR'): { phone?: string; problem?: string } {
  const t = raw.trim();
  if (!t) return {};
  if (country !== 'AR' && !t.startsWith('+54')) {
    return t.replace(/\D/g, '').length >= 8 ? { phone: t } : { problem: tx('El celular «{t}» está incompleto: se carga sin celular.', { t }) };
  }
  const bad = phoneProblem(t);
  if (bad) return { problem: tx('El celular «{t}» no se entiende ({replace}): se carga sin celular.', { t, replace: bad.replace(/\.$/, '') }) };
  return { phone: formatPhone(t) };
}

/** Arma y revisa las filas según las columnas elegidas. `firstLine`: el número de planilla de la primera fila de datos. */
export function buildSmartRows(data: string[][], fields: SmartField[], o: { country?: string; firstLine?: number } = {}): SmartRow[] {
  const rows: SmartRow[] = [];
  data.forEach((r, idx) => {
    const v: Partial<Record<SmartField, string>> = {};
    fields.forEach((f, i) => { if (f !== 'skip') { const x = String(r[i] ?? '').trim(); if (x) v[f] = v[f] ? `${v[f]} ${x}` : x; } });
    const problems: Problem[] = [];
    const name = [v.name, v.lastname].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!name) problems.push({ kind: 'no_name', text: tx('Falta el nombre: esta fila no se carga.') });
    else if (name.length > 120) problems.push({ kind: 'no_name', text: tx('El nombre es demasiado largo: esta fila no se carga.') });
    const ph = v.phone ? checkPhone(v.phone, o.country) : {};
    if (ph.problem) problems.push({ kind: 'bad_phone', text: ph.problem });
    let email = v.email?.toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { problems.push({ kind: 'bad_email', text: tx('El correo «{email}» está mal escrito: se carga sin correo.', { email }) }); email = undefined; }
    const birthdate = parseDate(v.birthdate);
    if (v.birthdate && !birthdate) problems.push({ kind: 'bad_date', text: tx('La fecha de nacimiento «{birthdate}» no se entiende: se carga sin fecha.', { birthdate: v.birthdate }) });
    const baptized_on = parseDate(v.baptized_on);
    if (v.baptized_on && !baptized_on) problems.push({ kind: 'bad_date', text: tx('La fecha de bautismo «{baptized_on}» no se entiende: se carga sin esa fecha.', { baptized_on: v.baptized_on }) });
    const address = [v.address, v.barrio ? `B° ${v.barrio.replace(/^b[°ºo]?\.?\s+/i, '')}` : ''].filter(Boolean).join(', ') || undefined;
    rows.push({
      line: (o.firstLine ?? 1) + idx, name, phone: ph.phone, email, address, birthdate, baptized_on,
      sex: v.sex ? sexOf(v.sex) : undefined, marital: v.marital ? maritalOf(v.marital) : undefined,
      baptized: v.baptized ? yesNo(v.baptized) : undefined, member: v.member ? yesNo(v.member) : undefined,
      family: v.family, problems,
    });
  });
  return markFileDuplicates(rows);
}

/** Los últimos 8 números del celular: así compara la base. */
export const phoneKey = (phone: string | undefined): string | null => {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
};

/** Marca las filas repetidas dentro del mismo archivo: mismo celular, o mismo nombre cuando no hay celular. Queda la primera. */
export function markFileDuplicates(rows: SmartRow[]): SmartRow[] {
  const byPhone = new Map<string, number>(); const byName = new Map<string, number>();
  return rows.map((r) => {
    if (blocking(r)) return r;
    const pk = phoneKey(r.phone);
    const key = pk ?? norm(r.name);
    const seen = pk ? byPhone : byName;
    const first = seen.get(key);
    if (first !== undefined) {
      return { ...r, problems: [...r.problems.filter((p) => p.kind !== 'dup_file'), { kind: 'dup_file' as const, text: pk ? tx('Mismo celular que la fila {first}: está repetida en el archivo y no se carga.', { first }) : tx('Mismo nombre que la fila {first} (y sin celular): está repetida en el archivo y no se carga.', { first }) }] };
    }
    seen.set(key, r.line);
    return r;
  });
}

export type SendRow = { name: string; phone?: string; email?: string; address?: string; birthdate?: string; baptized_on?: string; sex?: string; marital?: string; baptized?: boolean; member?: boolean; family?: string };
/** Las filas que se mandan a la base: sin las que no tienen nombre ni las repetidas en el archivo. Guarda de qué fila salió cada una. */
export function rowsToSend(rows: SmartRow[]): { send: SendRow[]; lines: number[] } {
  const send: SendRow[] = []; const lines: number[] = [];
  for (const r of rows) {
    if (blocking(r) || isFileDup(r)) continue;
    const { line, problems, ...rest } = r;
    void problems;
    send.push(Object.fromEntries(Object.entries(rest).filter(([, x]) => x !== undefined && x !== '')) as SendRow);
    lines.push(line);
  }
  return { send, lines };
}

export type ServerCode = 'new' | 'dup_phone' | 'dup_name' | 'dup_file' | 'bad';
export const SERVER_TEXT: Record<ServerCode, string> = {
  get new() { return tx('Nueva'); },
  get dup_phone() { return tx('Ya está en la iglesia (mismo celular)'); },
  get dup_name() { return tx('Ya está en la iglesia (mismo nombre)'); },
  get dup_file() { return tx('Repetida en el archivo'); },
  get bad() { return tx('No se puede cargar'); },
};

export type Counts = { total: number; ready: number; noName: number; fileDups: number; warnings: number };
export function countRows(rows: SmartRow[]): Counts {
  const noName = rows.filter(blocking).length;
  const fileDups = rows.filter((r) => !blocking(r) && isFileDup(r)).length;
  return {
    total: rows.length, noName, fileDups, ready: rows.length - noName - fileDups,
    warnings: rows.filter((r) => !blocking(r) && !isFileDup(r) && r.problems.length > 0).length,
  };
}

/** Partir en tandas para mandar de a poco y mostrar el avance. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += Math.max(1, size)) out.push(list.slice(i, i + Math.max(1, size)));
  return out;
}

// ---------- La planilla modelo (con nombres inventados) ----------
export const TEMPLATE_HEADERS = ['Nombre', 'Apellido', 'Celular', 'Correo', 'Dirección', 'Barrio', 'Fecha de nacimiento', 'Bautizado', 'Miembro', 'Familia'];
export const TEMPLATE_ROWS: string[][] = [
  ['Marcela', 'Quiroga', '376 400-0001', 'marcela@ejemplo.com', 'Av. Los Lapachos 123', 'Centro', '14/03/1985', 'Sí', 'Sí', 'Quiroga Benítez'],
  ['Rubén', 'Benítez', '376 400-0002', '', 'Av. Los Lapachos 123', 'Centro', '02/11/1982', 'Sí', 'Sí', 'Quiroga Benítez'],
  ['Tobías', 'Benítez', '', '', 'Av. Los Lapachos 123', 'Centro', '21/07/2014', 'No', 'No', 'Quiroga Benítez'],
  ['Elvira', 'Sosa', '3755 40-0003', '', 'Calle 8 casi 15', 'San Jorge', '', 'Sí', 'Sí', ''],
  ['Nahuel', 'Acosta', '376 400-0004', 'nahuel@ejemplo.com', '', 'Itaembé Miní', '30/09/1999', 'No', 'No', ''],
];
/** La planilla modelo como CSV que el Excel en castellano abre bien (con punto y coma). */
export function templateCsv(): string {
  const cell = (c: string) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return `﻿${[TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}
