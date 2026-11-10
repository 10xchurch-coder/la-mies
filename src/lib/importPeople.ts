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
  ['marital', ['estado civil', 'civil']],
];

/** Adivina para qué sirve cada columna según su encabezado. Cada campo se usa una sola vez. */
export function detectFields(headers: string[]): ImportField[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const n = norm(h);
    if (!n) return 'skip';
    // Primero coincidencia exacta; después "contiene".
    const found = SYNONYMS.find(([f, list]) => !used.has(f) && list.includes(n)) ?? SYNONYMS.find(([f, list]) => !used.has(f) && list.some((w) => w.length > 3 && n.includes(w)));
    if (!found) return 'skip';
    used.add(found[0]);
    return found[0];
  });
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
    fields.forEach((f, i) => { if (f !== 'skip') { const v = String(r[i] ?? '').trim(); if (v) o[f] = o[f] ? `${o[f]} ${v}` : v; } });
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
