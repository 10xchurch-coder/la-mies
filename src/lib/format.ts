// Fechas, horas y números en castellano rioplatense, sin depender de Intl.

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function fmtTime(d: Date | string | number): string {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/** "sáb 24 oct" */
export function fmtDay(d: Date | string | number): string {
  const x = new Date(d);
  return `${DAYS[x.getDay()]} ${x.getDate()} ${MONTHS[x.getMonth()]}`;
}

/** "sáb 24 oct 2026" */
export function fmtDayYear(d: Date | string | number): string {
  return `${fmtDay(d)} ${new Date(d).getFullYear()}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "hoy", "ayer", "sáb 24 oct" */
export function fmtRelativeDay(d: Date | string | number): string {
  const x = new Date(d);
  const now = new Date();
  if (isSameDay(x, now)) return 'hoy';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (isSameDay(x, y)) return 'ayer';
  return fmtDay(x);
}

/** "1 h 40 min" / "42 min" */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "00:42:15" */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "2,3 km" / "850 m" */
export function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Hace que una fecha "YYYY-MM-DD" de la base se lea bien. */
export function fmtDateOnly(s: string | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]} ${y}`;
}

/** Normaliza un celular argentino a formato wa.me (549 + área + número). */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('549')) return digits;
  if (digits.startsWith('54')) return `549${digits.slice(2)}`;
  if (digits.startsWith('0')) return `549${digits.slice(1)}`;
  if (digits.startsWith('15')) return `549376${digits.slice(2)}`;
  return `549${digits}`;
}

export const INTEREST_LABEL: Record<string, string> = {
  very: 'Muy interesado',
  some: 'Interesado',
  little: 'Poco interés',
  none: 'No volver',
};

export const MARITAL_LABEL: Record<string, string> = {
  single: 'Soltero/a',
  married: 'Casado/a',
  partner: 'En pareja',
  widowed: 'Viudo/a',
  separated: 'Separado/a',
  divorced: 'Divorciado/a',
};

export const PROMISE_LABEL: Record<string, string> = { sat: 'sábado', sun: 'domingo' };

export function groupWord(grouping: string | null | undefined, plural = false): string {
  if (grouping === 'bus_routes') return plural ? 'Rutas' : 'Ruta';
  return plural ? 'Grupos' : 'Grupo';
}
/** "Todas las rutas" / "Todos los grupos". */
export function allGroupsLabel(grouping: string | null | undefined): string {
  return grouping === 'bus_routes' ? 'Todas las rutas' : 'Todos los grupos';
}
/** Artículo que acompaña a la palabra: "la ruta" / "el grupo". */
export function groupArticle(grouping: string | null | undefined, kind: 'el' | 'mi' | 'tu' | 'todo' = 'el'): string {
  const fem = grouping === 'bus_routes';
  if (kind === 'el') return fem ? 'la' : 'el';
  if (kind === 'todo') return fem ? 'toda' : 'todo';
  return kind; // "mi" y "tu" no cambian
}

// ---------- Parte 2 ----------
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const dayName = (dow: number) => DAY_NAMES[dow] ?? '';

/** Fecha local como "YYYY-MM-DD" (como la guarda la base). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → Date local a las 12 (evita saltos por zona horaria). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

/** "sáb 24 oct" para una fecha "YYYY-MM-DD". */
export function fmtDateShort(s: string): string {
  return fmtDay(parseDate(s));
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Próximas fechas (desde hoy) que caen en esos días de la semana. */
export function upcomingDates(dows: number[], count: number, from = new Date()): string[] {
  const out: string[] = [];
  let d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  for (let i = 0; i < 400 && out.length < count; i++) {
    if (dows.includes(d.getDay())) out.push(isoDate(d));
    d = addDays(d, 1);
  }
  return out;
}

/** El sábado del último fin de semana (o de este, si hoy es sábado o domingo). */
export function lastSaturday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  const back = (d.getDay() + 1) % 7; // sáb 0, dom 1, lun 2...
  return isoDate(addDays(d, -back));
}

export const ROLE_LABEL: Record<string, string> = {
  member: 'Miembro',
  captain: 'Capitán',
  secretary: 'Secretaría',
  admin: 'Pastor / administrador',
};

export const STATUS_LABEL: Record<string, string> = { contact: 'Contacto', visitor: 'Visita', member: 'Miembro' };

export const FAITH_LABEL: Record<string, { label: string; hint: string; tone: 'green' | 'blue' | 'amber' | 'gray' | 'red' }> = {
  fiel: { label: 'Nunca falta', hint: '95% o más', tone: 'green' },
  constante: { label: 'Casi siempre', hint: '80 a 95%', tone: 'green' },
  frecuente: { label: 'Seguido', hint: 'la mitad o más', tone: 'blue' },
  ocasional: { label: 'A veces', hint: 'como una vez por mes', tone: 'amber' },
  esporadico: { label: 'Muy de vez en cuando', hint: 'menos de una vez por mes', tone: 'red' },
  inactivo: { label: 'Dejó de venir', hint: 'no vino en este período', tone: 'red' },
  sin_asistencia: { label: 'Nunca vino', hint: 'todavía sin asistencia', tone: 'gray' },
  nuevo: { label: 'Nuevo', hint: 'recién agregado', tone: 'gray' },
};

export const KIND_LABEL: Record<string, string> = { soulwinning: 'Evangelismo', flyers: 'Volantes' };

/** Saca el id de un link de YouTube (youtu.be/x, watch?v=x, live/x, shorts/x). */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// ---------- Fechas de nacimiento ----------
/** Edad cumplida a partir de una fecha ISO (AAAA-MM-DD). */
export function ageFrom(birthdate: string | null | undefined, today = new Date()): number | null {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age >= 0 && age <= 120 ? age : null;
}

/** Edad para mostrar: la fecha de nacimiento manda; si no hay, la edad anotada. */
export function displayAge(p: { birthdate?: string | null; age?: number | null }): number | null {
  return ageFrom(p.birthdate) ?? p.age ?? null;
}

/** "DD/MM/AAAA" → ISO, o null si no es una fecha válida. */
export function parseDateAR(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]); const mo = Number(m[2]); const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ISO → "DD/MM/AAAA" para mostrar en un campo. */
export function fmtDateAR(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/**
 * Lo que escribe la persona en "edad o fecha de nacimiento": "7" es edad, "12/03/2018" es fecha.
 * Devuelve las dos cosas listas para guardar.
 */
export function parseAgeOrBirthdate(text: string): { age: number | null; birthdate: string | null } {
  const t = text.trim();
  if (!t) return { age: null, birthdate: null };
  const iso = parseDateAR(t);
  if (iso) return { age: ageFrom(iso), birthdate: iso };
  const n = Number(t.replace(/\D/g, ''));
  return { age: Number.isFinite(n) && t.replace(/\D/g, '').length > 0 && n >= 0 && n <= 120 ? n : null, birthdate: null };
}

/** Escribe la fecha con barras mientras se tipea: "12032018" → "12/03/2018". Si son 1 a 3 dígitos, se deja como edad. */
export function maskDateOrAge(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 3 && !text.includes('/')) return digits;
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
