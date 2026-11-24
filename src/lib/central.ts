// La Mies Central: el panel del equipo de La Mies para ver todas las iglesias de la red.
// Acá va solo la lógica (qué iglesias necesitan atención, cómo se suman las semanas en un mes o un año, los informes).
// No importa nada de la base ni de la pantalla, para poder probarse sola.
//
// REGLA DE PRIVACIDAD: Central muestra datos de la iglesia y cantidades. Nunca personas de otra iglesia ni su plata.
import { progress, cleanFacts, type Facts, type SavedSteps } from './alta';
import { toCsv } from './desk';
import { tx, txList } from './i18n';

export type CentralRole = 'owner' | 'staff' | null;

export type ServiceCount = { name: string; dow: number; count: number };
/** Los números de una iglesia en una semana (de lunes a domingo). */
export type CentralWeek = {
  church_id: string; week_start: string;
  accounts: number; people: number; new_people: number;
  attendance: number; visitors: number; first_time: number; services: ServiceCount[];
  saved: number; baptisms: number; new_members: number; decisions: number;
  outings: number; people_out: number; houses: number; contacts_met: number; gospel: number;
  classes: number; class_present: number; events: number; event_regs: number;
  devo_reads: number; devo_likes: number; active_users: number; errors: number; help_requests: number;
};

/** La ficha de una iglesia en Central: datos de la iglesia y cantidades. */
export type CentralChurch = {
  id: string; name: string; city: string | null; province: string | null; country: string | null; timezone: string | null; created_at: string;
  is_host: boolean; selfserve: boolean; status: 'invited' | 'pending' | 'reviewed' | 'suspended'; suspend_reason: string | null; size_hint: string | null;
  pastor_name: string | null; pastor_email: string | null; pastor_whatsapp: string | null; pastors: number;
  setup_pending: boolean; setup_done_at: string | null; steps: SavedSteps; has_checklist: boolean; import_help_at: string | null; facts: Facts;
  disabled_features: string[]; uses_finance: boolean; join_code: string | null; invite_expires_at: string | null;
  active_7: number; active_30: number; last_activity: string | null; open_help: number; errors_7: number; errors_prev_7: number;
};

export function cleanChurch(raw: unknown): CentralChurch {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (k: string) => Number(r[k] ?? 0) || 0;
  const str = (k: string) => (typeof r[k] === 'string' && r[k] ? (r[k] as string) : null);
  const status = str('status');
  return {
    id: String(r.id ?? ''), name: str('name') ?? tx('Iglesia'), city: str('city'), province: str('province'), country: str('country'), timezone: str('timezone'),
    created_at: str('created_at') ?? new Date(0).toISOString(),
    is_host: r.is_host === true, selfserve: r.selfserve === true,
    status: status === 'pending' || status === 'reviewed' || status === 'suspended' ? status : 'invited',
    suspend_reason: str('suspend_reason'), size_hint: str('size_hint'),
    pastor_name: str('pastor_name'), pastor_email: str('pastor_email'), pastor_whatsapp: str('pastor_whatsapp'), pastors: num('pastors'),
    setup_pending: r.setup_pending === true, setup_done_at: str('setup_done_at'),
    steps: (r.steps && typeof r.steps === 'object' ? r.steps : {}) as SavedSteps, has_checklist: r.has_checklist === true, import_help_at: str('import_help_at'),
    facts: cleanFacts(r.facts),
    disabled_features: Array.isArray(r.disabled_features) ? (r.disabled_features as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    uses_finance: r.uses_finance === true, join_code: str('join_code'), invite_expires_at: str('invite_expires_at'),
    active_7: num('active_7'), active_30: num('active_30'), last_activity: str('last_activity'), open_help: num('open_help'),
    errors_7: num('errors_7'), errors_prev_7: num('errors_prev_7'),
  };
}

const NUM_KEYS = ['accounts', 'people', 'new_people', 'attendance', 'visitors', 'first_time', 'saved', 'baptisms', 'new_members', 'decisions', 'outings', 'people_out',
  'houses', 'contacts_met', 'gospel', 'classes', 'class_present', 'events', 'event_regs', 'devo_reads', 'devo_likes', 'active_users', 'errors', 'help_requests'] as const;
export type MetricKey = (typeof NUM_KEYS)[number];

export function cleanWeek(raw: unknown): CentralWeek {
  const r = (raw ?? {}) as Record<string, unknown>;
  const w = { church_id: String(r.church_id ?? ''), week_start: String(r.week_start ?? '').slice(0, 10), services: [] as ServiceCount[] } as CentralWeek;
  for (const k of NUM_KEYS) w[k] = Number(r[k] ?? 0) || 0;
  if (Array.isArray(r.services)) {
    w.services = (r.services as Record<string, unknown>[]).map((s) => ({ name: String(s?.name ?? ''), dow: Number(s?.dow ?? 0) || 0, count: Number(s?.count ?? 0) || 0 })).filter((s) => s.name);
  }
  return w;
}

// ---------- Qué se mide ----------
/** Cómo se junta un número de varias semanas: se suma, se promedia por semana, o vale el de la última semana. */
export type MetricHow = 'sum' | 'avg' | 'last';
export type Metric = { key: MetricKey; label: string; how: MetricHow; group: 'Gente' | 'Reuniones' | 'Decisiones' | 'Evangelismo' | 'Uso de la app' | 'Soporte'; goodUp?: boolean };

export const METRICS: Metric[] = [
  { key: 'accounts', get label() { return tx('Cuentas'); }, how: 'last', group: 'Gente', goodUp: true },
  { key: 'people', get label() { return tx('Fichas de personas'); }, how: 'last', group: 'Gente', goodUp: true },
  { key: 'new_people', get label() { return tx('Fichas nuevas'); }, how: 'sum', group: 'Gente', goodUp: true },
  { key: 'attendance', get label() { return tx('Asistencia'); }, how: 'avg', group: 'Reuniones', goodUp: true },
  { key: 'visitors', get label() { return tx('Visitas'); }, how: 'avg', group: 'Reuniones', goodUp: true },
  { key: 'first_time', get label() { return tx('Vinieron por primera vez'); }, how: 'sum', group: 'Reuniones', goodUp: true },
  { key: 'class_present', get label() { return tx('Presentes en las clases'); }, how: 'avg', group: 'Reuniones', goodUp: true },
  { key: 'events', get label() { return tx('Eventos'); }, how: 'sum', group: 'Reuniones', goodUp: true },
  { key: 'event_regs', get label() { return tx('Inscripciones a eventos'); }, how: 'sum', group: 'Reuniones', goodUp: true },
  { key: 'saved', get label() { return tx('Salvos'); }, how: 'sum', group: 'Decisiones', goodUp: true },
  { key: 'baptisms', get label() { return tx('Bautismos'); }, how: 'sum', group: 'Decisiones', goodUp: true },
  { key: 'new_members', get label() { return tx('Miembros nuevos'); }, how: 'sum', group: 'Decisiones', goodUp: true },
  { key: 'decisions', get label() { return tx('Decisiones anotadas'); }, how: 'sum', group: 'Decisiones', goodUp: true },
  { key: 'outings', get label() { return tx('Salidas a evangelizar'); }, how: 'sum', group: 'Evangelismo', goodUp: true },
  { key: 'people_out', get label() { return tx('Salieron (promedio por semana)'); }, how: 'avg', group: 'Evangelismo', goodUp: true },
  { key: 'houses', get label() { return tx('Casas'); }, how: 'sum', group: 'Evangelismo', goodUp: true },
  { key: 'contacts_met', get label() { return tx('Contactos'); }, how: 'sum', group: 'Evangelismo', goodUp: true },
  { key: 'gospel', get label() { return tx('Oyeron el evangelio'); }, how: 'sum', group: 'Evangelismo', goodUp: true },
  { key: 'active_users', get label() { return tx('Usaron la app (por semana)'); }, how: 'avg', group: 'Uso de la app', goodUp: true },
  { key: 'devo_reads', get label() { return tx('Lecturas de la Biblia'); }, how: 'sum', group: 'Uso de la app', goodUp: true },
  { key: 'devo_likes', get label() { return tx('Me gusta en el devocional'); }, how: 'sum', group: 'Uso de la app', goodUp: true },
  { key: 'errors', get label() { return tx('Errores de la app'); }, how: 'sum', group: 'Soporte', goodUp: false },
  { key: 'help_requests', get label() { return tx('Pedidos de ayuda'); }, how: 'sum', group: 'Soporte' },
];
export const METRIC_GROUPS = ['Gente', 'Reuniones', 'Decisiones', 'Evangelismo', 'Uso de la app', 'Soporte'] as const;
const HOW = new Map(METRICS.map((m) => [m.key, m.how]));

// ---------- Fechas ----------
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`);
export function addDaysIso(s: string, n: number): string { const d = at(s); d.setDate(d.getDate() + n); return iso(d); }
/** El lunes de la semana de esa fecha. */
export function mondayIso(s: string | Date): string {
  const d = typeof s === 'string' ? at(s) : new Date(s.getFullYear(), s.getMonth(), s.getDate(), 12);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

export type PeriodKind = 'week' | 'month' | 'year';
/** Un período y el anterior para comparar. Una semana cuenta para el mes (o el año) en que cae su lunes. */
export type Period = { kind: PeriodKind; from: string; to: string; prevFrom: string; prevTo: string; label: string; prevLabel: string };

const MONTHS = txList(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']);
const short = (s: string) => { const d = at(s); return `${d.getDate()}/${d.getMonth() + 1}`; };

export function periodOf(kind: PeriodKind, anchor: string): Period {
  const d = at(anchor);
  if (kind === 'week') {
    const from = mondayIso(anchor); const to = addDaysIso(from, 6);
    const prevFrom = addDaysIso(from, -7);
    return { kind, from, to, prevFrom, prevTo: addDaysIso(from, -1), label: tx('Semana del {short} al {short2}', { short: short(from), short2: short(to) }), prevLabel: tx('semana del {short}', { short: short(prevFrom) }) };
  }
  if (kind === 'month') {
    const y = d.getFullYear(); const m = d.getMonth();
    const from = iso(new Date(y, m, 1, 12)); const to = iso(new Date(y, m + 1, 0, 12));
    const pf = new Date(y, m - 1, 1, 12);
    return { kind, from, to, prevFrom: iso(pf), prevTo: iso(new Date(y, m, 0, 12)), label: tx('{MONTHS} de {y}', { MONTHS: MONTHS[m], y }), prevLabel: `${MONTHS[pf.getMonth()]} de ${pf.getFullYear()}` };
  }
  const y = d.getFullYear();
  return { kind, from: `${y}-01-01`, to: `${y}-12-31`, prevFrom: `${y - 1}-01-01`, prevTo: `${y - 1}-12-31`, label: tx('Año {y}', { y }), prevLabel: tx('año {v1}', { v1: y - 1 }) };
}

/** Moverse al período anterior (-1) o al siguiente (+1). */
export function shiftPeriod(kind: PeriodKind, anchor: string, by: number): string {
  const d = at(anchor);
  if (kind === 'week') return addDaysIso(mondayIso(anchor), 7 * by);
  if (kind === 'month') return iso(new Date(d.getFullYear(), d.getMonth() + by, 1, 12));
  return iso(new Date(d.getFullYear() + by, 0, 1, 12));
}

// ---------- Sumar semanas ----------
export type Totals = Record<MetricKey, number> & { weeks: number; services: ServiceCount[] };

const ZERO = (): Totals => {
  const t = { weeks: 0, services: [] as ServiceCount[] } as Totals;
  for (const k of NUM_KEYS) t[k] = 0;
  return t;
};

/** Toda la red en una fila por semana: se suman las iglesias. */
export function sumByWeek(weeks: CentralWeek[]): CentralWeek[] {
  const by = new Map<string, CentralWeek>();
  for (const w of weeks) {
    let t = by.get(w.week_start);
    if (!t) { t = { ...cleanWeek({ church_id: '*', week_start: w.week_start }) }; by.set(w.week_start, t); }
    for (const k of NUM_KEYS) t[k] += w[k];
  }
  return [...by.values()].sort((a, b) => a.week_start.localeCompare(b.week_start));
}

/** Las semanas de UNA iglesia (o las de la red ya sumadas) entre dos fechas, en un solo renglón. */
export function totalsOf(weeks: CentralWeek[], from: string, to: string): Totals {
  const rows = weeks.filter((w) => w.week_start >= from && w.week_start <= to).sort((a, b) => a.week_start.localeCompare(b.week_start));
  const t = ZERO();
  t.weeks = rows.length;
  if (!rows.length) return t;
  const services = new Map<string, ServiceCount>();
  for (const w of rows) {
    for (const k of NUM_KEYS) if (HOW.get(k) !== 'last') t[k] += w[k];
    for (const s of w.services ?? []) {
      const cur = services.get(s.name);
      if (cur) cur.count += s.count; else services.set(s.name, { ...s });
    }
  }
  const last = rows[rows.length - 1];
  for (const k of NUM_KEYS) {
    if (HOW.get(k) === 'last') t[k] = last[k];
    if (HOW.get(k) === 'avg') t[k] = Math.round(t[k] / rows.length);
  }
  t.services = [...services.values()].sort((a, b) => a.dow - b.dow || a.name.localeCompare(b.name, 'es'));
  return t;
}

export type Change = { diff: number; pct: number | null; dir: 'up' | 'down' | 'same'; text: string };
/** Cuánto cambió contra el período anterior. null: no hay con qué comparar. */
export function change(cur: number, prev: number | null | undefined, hasPrev = true): Change | null {
  if (prev === null || prev === undefined || !hasPrev) return null;
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  if (diff === 0) return { diff, pct: 0, dir: 'same', text: tx('igual') };
  const sign = diff > 0 ? '+' : '−';
  return { diff, pct, dir: diff > 0 ? 'up' : 'down', text: `${sign}${Math.abs(diff)}${pct !== null ? ` (${sign}${Math.abs(pct)}%)` : ''}` };
}

export type ReportRow = { key: MetricKey; label: string; group: Metric['group']; value: number; prev: number | null; change: Change | null; good: boolean | null };
/** El informe de un período: cada número con el del período anterior al lado. */
export function buildReport(weeks: CentralWeek[], p: Period): { rows: ReportRow[]; cur: Totals; prev: Totals } {
  const cur = totalsOf(weeks, p.from, p.to);
  const prev = totalsOf(weeks, p.prevFrom, p.prevTo);
  const rows = METRICS.map((m): ReportRow => {
    const c = change(cur[m.key], prev[m.key], prev.weeks > 0);
    const good = c && c.dir !== 'same' && m.goodUp !== undefined ? (c.dir === 'up') === m.goodUp : null;
    return { key: m.key, label: m.label, group: m.group, value: cur[m.key], prev: prev.weeks > 0 ? prev[m.key] : null, change: c, good };
  });
  return { rows, cur, prev };
}

/** El informe como planilla (CSV para Excel): una fila por número. */
export function reportCsv(title: string, p: Period, rows: ReportRow[]): string {
  return toCsv([tx('Informe'), tx('Período'), tx('Grupo'), tx('Dato'), tx('Valor'), tx('Período anterior'), tx('Cambio')],
    rows.map((r) => [title, p.label, r.group, r.label, r.value, r.prev, r.change ? r.change.text : '']));
}

/** Una planilla con una fila por iglesia para el período (los números principales). */
export function churchesCsv(p: Period, churches: CentralChurch[], weeks: CentralWeek[]): string {
  const cols: MetricKey[] = ['accounts', 'people', 'attendance', 'visitors', 'first_time', 'baptisms', 'saved', 'outings', 'houses', 'gospel', 'active_users', 'errors', 'help_requests'];
  const label = (k: MetricKey) => METRICS.find((m) => m.key === k)?.label ?? k;
  return toCsv([tx('Iglesia'), tx('Ciudad'), tx('Período'), ...cols.map(label)], churches.map((c) => {
    const t = totalsOf(weeks.filter((w) => w.church_id === c.id), p.from, p.to);
    return [c.name, c.city, p.label, ...cols.map((k) => t[k])];
  }));
}

/** Los últimos n valores de un número, semana por semana (para los gráficos). Para toda la red, pasar las semanas ya sumadas. */
export function series(weeks: CentralWeek[], key: MetricKey, n: number, until?: string): { week: string; value: number }[] {
  const rows = weeks.filter((w) => !until || w.week_start <= until).sort((a, b) => a.week_start.localeCompare(b.week_start));
  return rows.slice(-n).map((w) => ({ week: w.week_start, value: w[key] }));
}

// ---------- Estado y atención ----------
export type ChurchState = 'suspended' | 'no_pastor' | 'setup' | 'quiet' | 'ok';
export const STATE_INFO: Record<ChurchState, { label: string; tone: 'red' | 'amber' | 'blue' | 'gray' | 'green' }> = {
  suspended: { get label() { return tx('Suspendida'); }, tone: 'red' },
  no_pastor: { get label() { return tx('Sin pastor todavía'); }, tone: 'amber' },
  setup: { get label() { return tx('Primeros pasos'); }, tone: 'blue' },
  quiet: { get label() { return tx('Sin movimiento'); }, tone: 'gray' },
  ok: { get label() { return tx('En marcha'); }, tone: 'green' },
};

const DAY = 86400000;
export function daysAgo(isoDate: string | null | undefined, now = new Date()): number | null {
  if (!isoDate) return null;
  const t = new Date(isoDate).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now.getTime() - t) / DAY));
}

/** ¿Todavía está con los primeros pasos? (solo las iglesias que tienen la lista de primeros pasos) */
export function inSetup(c: CentralChurch): boolean {
  if (!c.has_checklist && !c.setup_pending) return false;
  if (c.setup_done_at) return false;
  return c.has_checklist ? !progress(c.steps, c.facts).finished : c.setup_pending;
}

export const QUIET_DAYS = 14;
export const STUCK_DAYS = 7;

export function stateOf(c: CentralChurch, now = new Date()): ChurchState {
  if (c.status === 'suspended') return 'suspended';
  if (!c.pastors) return 'no_pastor';
  if (inSetup(c)) return 'setup';
  const d = daysAgo(c.last_activity, now);
  if (d === null || d >= QUIET_DAYS) return 'quiet';
  return 'ok';
}

export type AttentionKey = 'help' | 'import' | 'stuck' | 'quiet' | 'errors' | 'review' | 'no_pastor';
export type Attention = { key: AttentionKey; text: string; tone: 'red' | 'amber' | 'blue' };

/** Por qué una iglesia necesita que el equipo la mire. Vacío: está todo bien. */
export function attentionOf(c: CentralChurch, now = new Date()): Attention[] {
  const out: Attention[] = [];
  if (c.status === 'suspended') return out;
  if (c.open_help > 0) out.push({ key: 'help', tone: 'red', text: c.open_help === 1 ? tx('Tiene un pedido de ayuda sin resolver') : tx('Tiene {open_help} pedidos de ayuda sin resolver', { open_help: c.open_help }) });
  const helpDays = daysAgo(c.import_help_at, now);
  if (helpDays !== null && helpDays < 30) out.push({ key: 'import', tone: 'blue', text: tx('Pide que le carguen la lista de personas') });
  if (c.status === 'pending') out.push({ key: 'review', tone: 'amber', text: tx('Se anotó sola y todavía no la revisaron') });
  const age = daysAgo(c.created_at, now) ?? 0;
  if (!c.pastors && age >= STUCK_DAYS) out.push({ key: 'no_pastor', tone: 'amber', text: tx('Hace {age} días que no tiene pastor en la app', { age }) });
  else if (inSetup(c) && age >= STUCK_DAYS) out.push({ key: 'stuck', tone: 'amber', text: tx('Hace {age} días que está con los primeros pasos ({label})', { age, label: progress(c.steps, c.facts).label }) });
  const quiet = daysAgo(c.last_activity, now);
  if (c.pastors > 0 && age >= QUIET_DAYS && (quiet === null || quiet >= QUIET_DAYS)) {
    out.push({ key: 'quiet', tone: 'amber', text: quiet === null ? tx('Nunca tuvo movimiento') : tx('Hace {quiet} días que nadie usa la app', { quiet }) });
  }
  if (errorSpike(c.errors_7, c.errors_prev_7)) out.push({ key: 'errors', tone: 'red', text: tx('{errors_7} errores de la app en 7 días (antes {errors_prev_7})', { errors_7: c.errors_7, errors_prev_7: c.errors_prev_7 }) });
  return out;
}

/** Un salto de errores: 5 o más en la semana y por lo menos el doble que la semana anterior. */
export function errorSpike(last7: number, prev7: number): boolean {
  return last7 >= 5 && last7 >= 2 * Math.max(prev7, 1);
}

// ---------- Tabla de iglesias ----------
export type ChurchSort = 'name' | 'created' | 'accounts' | 'people' | 'attendance' | 'active' | 'last' | 'state';
export type ChurchFilter = { q: string; state: 'all' | ChurchState; onlyAttention: boolean };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterChurches(rows: CentralChurch[], f: ChurchFilter, now = new Date()): CentralChurch[] {
  const q = norm(f.q.trim());
  return rows.filter((c) => {
    if (f.state !== 'all' && stateOf(c, now) !== f.state) return false;
    if (f.onlyAttention && !attentionOf(c, now).length) return false;
    // Se busca por la iglesia y la ciudad; nunca por personas.
    if (q && !norm(`${c.name} ${c.city ?? ''} ${c.province ?? ''} ${c.country ?? ''}`).includes(q)) return false;
    return true;
  });
}

const STATE_ORDER: Record<ChurchState, number> = { suspended: 0, no_pastor: 1, setup: 2, quiet: 3, ok: 4 };

export function sortChurches(rows: CentralChurch[], by: ChurchSort, dir: 1 | -1, attendance: Map<string, number>, now = new Date()): CentralChurch[] {
  const val = (c: CentralChurch): number | string => {
    switch (by) {
      case 'created': return c.created_at;
      case 'accounts': return c.facts.accounts;
      case 'people': return c.facts.people;
      case 'attendance': return attendance.get(c.id) ?? 0;
      case 'active': return c.active_7;
      case 'last': return c.last_activity ?? '';
      case 'state': return STATE_ORDER[stateOf(c, now)];
      default: return norm(c.name);
    }
  };
  return [...rows].sort((a, b) => {
    const x = val(a); const y = val(b);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
    return r * dir || norm(a.name).localeCompare(norm(b.name), 'es');
  });
}

/** La asistencia de la última semana cerrada de cada iglesia (la anterior a la que está en curso). */
export function lastWeekAttendance(weeks: CentralWeek[], today = new Date()): Map<string, number> {
  const closed = addDaysIso(mondayIso(today), -7);
  const m = new Map<string, number>();
  for (const w of weeks) if (w.week_start === closed) m.set(w.church_id, w.attendance);
  return m;
}

// ---------- Pedidos de ayuda e ideas ----------
export type HelpStatus = 'open' | 'progress' | 'done';
export const HELP_STATUS: Record<HelpStatus, { label: string; tone: 'red' | 'amber' | 'green' }> = {
  open: { get label() { return tx('Abierto'); }, tone: 'red' },
  progress: { get label() { return tx('En curso'); }, tone: 'amber' },
  done: { get label() { return tx('Resuelto'); }, tone: 'green' },
};
export type IdeaStatus = 'new' | 'seen' | 'planned' | 'done' | 'no';
export const IDEA_STATUS: Record<IdeaStatus, { label: string; tone: 'red' | 'amber' | 'green' | 'blue' | 'gray' }> = {
  new: { get label() { return tx('Nueva'); }, tone: 'red' },
  seen: { get label() { return tx('Leída'); }, tone: 'gray' },
  planned: { get label() { return tx('La vamos a hacer'); }, tone: 'blue' },
  done: { get label() { return tx('Hecha'); }, tone: 'green' },
  no: { get label() { return tx('Por ahora no'); }, tone: 'amber' },
};
export const NOTE_KINDS: { value: string; label: string; icon: string }[] = [
  { value: 'nota', get label() { return tx('Nota'); }, icon: 'edit-3' },
  { value: 'llamada', get label() { return tx('Llamada'); }, icon: 'phone' },
  { value: 'whatsapp', get label() { return tx('WhatsApp'); }, icon: 'message-circle' },
  { value: 'correo', get label() { return tx('Correo'); }, icon: 'mail' },
  { value: 'visita', get label() { return tx('Visita'); }, icon: 'map-pin' },
  { value: 'reunion', get label() { return tx('Reunión'); }, icon: 'users' },
];

/** El enlace para responderle por WhatsApp a quien pidió ayuda (null si no dejó un número que sirva). */
export function replyWhatsApp(phone: string | null | undefined, church: string, step?: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const text = tx('Hola, te escribo del equipo de La Mies por tu pedido de ayuda{v1} de {church}.', { v1: step ? ` (${step})` : '', church });
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
export function replyMail(email: string | null | undefined, step?: string | null): string | null {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return `mailto:${email}?subject=${encodeURIComponent(tx('Ayuda con La Mies{v1}', { v1: step ? `: ${step}` : '' }))}`;
}

/** La regla de privacidad, para mostrarla en Central. */
export const PRIVACY = {
  title: 'Qué vemos y qué no',
  yes: [
    'Los datos de la iglesia: nombre, ciudad, cuándo entró y cómo va con los primeros pasos.',
    'El pastor: el nombre y el contacto que dio al anotarse.',
    'Cantidades: cuentas, fichas, asistencia por reunión, visitas, decisiones, bautismos, salidas, casas, clases, eventos y lecturas.',
    'Lo que nos escriben a nosotros: pedidos de ayuda e ideas (con el nombre de quien escribe).',
    'Errores de la app, versiones y aparatos en uso, y qué funciones tiene prendidas.',
  ],
  no: [
    'Nombres, teléfonos, domicilios o notas de las personas de otra iglesia.',
    'Pedidos de oración, chats, mensajes o la caja de sugerencias de otra iglesia.',
    'Quién vino a cada reunión: solo el total.',
    'La plata: ni ofrendas, ni ingresos, ni gastos. Solo si usan Finanzas: sí o no.',
  ],
} as const;

// ---------- La hoja para imprimir ----------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

/** El informe para imprimir o guardar como PDF: solo cantidades, con el período anterior al lado. */
export function reportHtml(o: { title: string; period: Period; rows: ReportRow[]; services?: ServiceCount[]; byChurch?: { name: string; values: (number | string)[] }[]; byChurchCols?: string[]; printedOn?: string }): string {
  const groups = METRIC_GROUPS.map((g) => {
    const rows = o.rows.filter((r) => r.group === g);
    if (!rows.length) return '';
    return `<h2>${esc(g)}</h2><table><thead><tr><th>Dato</th><th class="n">${esc(o.period.label)}</th><th class="n">Antes (${esc(o.period.prevLabel)})</th><th class="n">Cambio</th></tr></thead><tbody>${
      rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="n"><b>${r.value}</b></td><td class="n">${r.prev === null ? '—' : r.prev}</td><td class="n">${esc(r.change ? r.change.text : '—')}</td></tr>`).join('')}</tbody></table>`;
  }).join('');
  const services = o.services?.length
    ? `<h2>Asistencia por reunión</h2><table><thead><tr><th>Reunión</th><th class="n">Total del período</th></tr></thead><tbody>${o.services.map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${s.count}</td></tr>`).join('')}</tbody></table>` : '';
  const churches = o.byChurch?.length && o.byChurchCols
    ? `<h2>Por iglesia</h2><table><thead><tr><th>Iglesia</th>${o.byChurchCols.map((c) => `<th class="n">${esc(c)}</th>`).join('')}</tr></thead><tbody>${
      o.byChurch.map((c) => `<tr><td>${esc(c.name)}</td>${c.values.map((v) => `<td class="n">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(o.title)} - ${esc(o.period.label)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 6px}.sub{color:#555;margin:2px 0}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:6px 8px;text-align:left}
th{font-size:12px;color:#444}.n{text-align:right;white-space:nowrap}.foot{margin-top:28px;color:#666;font-size:11px}
@media print{body{margin:12mm}tr{break-inside:avoid}h2{break-after:avoid}}
</style></head><body>
<h1>${esc(o.title)}</h1><p class="sub">${esc(o.period.label)} · La Mies Central</p>
${groups}${services}${churches}
<p class="foot">Este informe tiene solo cantidades. No incluye datos de personas ni de dinero.${o.printedOn ? tx(' Impreso el {esc}.', { esc: esc(o.printedOn) }) : ''}</p>
</body></html>`;
}
