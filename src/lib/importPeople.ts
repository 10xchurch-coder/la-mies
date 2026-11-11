// Importar personas desde una planilla (CSV o Excel). Todo el armado de filas vive acá, sin pantalla, para poder probarlo.
export type ImportField = 'name' | 'lastname' | 'phone' | 'email' | 'address' | 'birthdate' | 'sex' | 'marital' | 'baptized_on' | 'skip';
export const FIELD_LABELS: Record<ImportField, string> = {
  name: 'Nombre', lastname: 'Apellido', phone: 'Celular', email: 'Correo', address: 'Dirección',
  birthdate: 'Nacimiento', sex: 'Sexo', marital: 'Estado civil', baptized_on: 'Bautismo', skip: 'No usar',
};
export type ImportRow = { name: string; phone?: string; email?: string; address?: string; birthdate?: string; sex?: string; marital?: string; baptized_on?: string };

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const SYNONYMS: [ImportField, string[]][] = [
  ['lastname', ['apellido', 'apellidos', 'last name', 'surname']],
  ['name', ['nombre y apellido', 'apellido y nombre', 'nombre completo', 'nombre', 'nombres', 'name', 'persona', 'miembro']],
  ['phone', ['celular', 'cel', 'telefono', 'tel', 'whatsapp', 'wsp', 'movil', 'numero', 'phone', 'contacto']],
  ['email', ['correo', 'mail', 'e mail', 'email', 'correo electronico']],
  ['address', ['direccion', 'domicilio', 'calle', 'barrio', 'address']],
  ['birthdate', ['fecha de nacimiento', 'nacimiento', 'cumpleanos', 'fecha nac', 'f nac', 'birthday', 'birthdate']],
  ['baptized_on', ['fecha de bautismo', 'bautismo', 'bautizado', 'bautizo', 'baptism']],
  ['sex', ['sexo', 'genero', 'sex', 'gender']],
  ['marital', ['estado civil', 'civil', 'marital status', 'marital']],
];

export type ImportSource = 'planning_center' | 'breeze' | 'generic';

/** Reconoce si la planilla viene exportada de Planning Center o de Breeze (por sus encabezados típicos). */
export function detectSource(headers: string[]): ImportSource {
  const h = new Set(headers.map(norm));
  if (h.has('household id') || h.has('mobile phone number') || h.has('home email') || h.has('address street line 1') || h.has('given name')) return 'planning_center';
  if (h.has('breeze id') || h.has('family role') || h.has('tags') && h.has('first name') || h.has('maiden name')) return 'breeze';
  return 'generic';
}

// Columnas que NO sirven aunque contengan la palabra "nombre" o "name".
const NEVER = ['given name', 'nickname', 'middle name', 'maiden name', 'name prefix', 'name suffix', 'school name', 'barcode', 'campus', 'household id', 'tags', 'family', 'family role', 'breeze id', 'id'];
// Cuanto más bajo el número, más preferida: el celular antes que el fijo, el correo personal antes que el del trabajo.
const phoneRank = (n: string) => (/(mobile|movil|cel|whatsapp|wsp)/.test(n) ? 0 : /(home|casa)/.test(n) ? 2 : /(work|trabajo|other|otro|fax)/.test(n) ? 3 : 1);
const emailRank = (n: string) => (/(work|trabajo|other|otro)/.test(n) ? 2 : /(home|personal)/.test(n) ? 0 : 1);
const isAddrPart = (n: string) => /(address|direccion|domicilio)/.test(n) && /(street|line|city|state|zip|postal|calle|ciudad|provincia|codigo)/.test(n) && !/(work|trabajo|other|otro|country)/.test(n);

/** Adivina para qué sirve cada columna según su encabezado. Cada campo se usa una sola vez (salvo la dirección, que puede venir en partes). */
export function detectFields(headers: string[]): ImportField[] {
  const out: ImportField[] = headers.map(() => 'skip');
  const norms = headers.map(norm);
  const used = new Set<ImportField>();
  // Teléfono y correo: elegir la mejor columna entre varias.
  const best = (test: (n: string) => boolean, rank: (n: string) => number): number => {
    let at = -1;
    norms.forEach((n, i) => { if (n && !NEVER.includes(n) && test(n) && (at < 0 || rank(n) < rank(norms[at]))) at = i; });
    return at;
  };
  const ph = best((n) => /(phone|telefono|celular|mobile|movil|cell|whatsapp|wsp|^tel$|^cel$)/.test(n) && !/(carrier|country)/.test(n), phoneRank);
  if (ph >= 0) { out[ph] = 'phone'; used.add('phone'); }
  const em = best((n) => /(^|\s)(e mail|email|mail|correo)/.test(n) && !/(opt|notif|permission)/.test(n), emailRank);
  if (em >= 0) { out[em] = 'email'; used.add('email'); }
  // Dirección en partes (calle, ciudad, provincia, código postal), solo la de casa.
  const parts = norms.map((n, i) => (isAddrPart(n) ? i : -1)).filter((i) => i >= 0);
  if (parts.length) { parts.forEach((i) => { out[i] = 'address'; }); used.add('address'); }
  headers.forEach((_h, i) => {
    if (out[i] !== 'skip') return;
    const n = norms[i];
    if (!n || NEVER.includes(n)) return;
    if (/(phone|telefono|celular|mobile|cell|whatsapp|email|e mail|correo|address)/.test(n) && !/(^|\s)(name|nombre)/.test(n)) return; // ya elegidas o descartadas
    const found = SYNONYMS.find(([f, list]) => !used.has(f) && list.includes(n)) ?? SYNONYMS.find(([f, list]) => !used.has(f) && list.some((w) => w.length > 3 && n.includes(w)));
    if (!found) return;
    out[i] = found[0];
    used.add(found[0]);
  });
  return out;
}

/** CSV con comillas; detecta coma, punto y coma o tabulación (el Excel en español guarda con ;). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => first.split(c).length - 1;
  const delim = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Fecha a AAAA-MM-DD. Acepta 25/12/1980, 25-12-80, 1980-12-25, y los números de fecha de Excel. Si no se entiende, devuelve undefined. */
export function parseDate(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) { // serie de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (!m) return undefined;
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return undefined;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return undefined;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const sexOf = (v: string) => { const n = norm(v); return ['m', 'masculino', 'hombre', 'varon', 'male'].includes(n) ? 'm' : ['f', 'femenino', 'mujer', 'female'].includes(n) ? 'f' : undefined; };
const maritalOf = (v: string) => {
  const n = norm(v);
  if (/^(soltero|soltera|single)/.test(n)) return 'single';
  if (/^(casado|casada|married)/.test(n)) return 'married';
  if (/^(viudo|viuda|widow)/.test(n)) return 'widowed';
  if (/(pareja|union|concubin|convivi|partner)/.test(n)) return 'partner';
  return undefined;
};

/** Arma las filas a enviar según el mapeo elegido. `dropped` cuenta las filas que no tienen nombre. */
export function buildRows(data: string[][], fields: ImportField[]): { rows: ImportRow[]; dropped: number } {
  const rows: ImportRow[] = [];
  let dropped = 0;
  for (const r of data) {
    const o: Partial<Record<ImportField, string>> = {};
    fields.forEach((f, i) => { if (f !== 'skip') { const v = String(r[i] ?? '').trim(); if (v) o[f] = o[f] ? `${o[f]}${f === 'address' ? ', ' : ' '}${v}` : v; } });
    const name = [o.name, o.lastname].filter(Boolean).join(' ').trim();
    if (!name) { dropped++; continue; }
    rows.push({
      name,
      phone: o.phone, email: o.email, address: o.address,
      birthdate: parseDate(o.birthdate), baptized_on: parseDate(o.baptized_on),
      sex: o.sex ? sexOf(o.sex) : undefined, marital: o.marital ? maritalOf(o.marital) : undefined,
    });
  }
  return { rows, dropped };
}
