// Personas y seguimiento: discipulado, decisiones, tarjeta de visita, regalo de bienvenida y clase de miembros.
// Acá va solo la lógica (nombres de lecciones, cuentas de días, filtros y controles de lo que se escribe).
// No importa nada de la app para poder probarse sola.

// ---------- Lecciones ----------

/** Nombre del curso de discipulado si la iglesia no escribió el suyo. */
import { tx } from './i18n';
export const DEFAULT_COURSE = 'Discipulado';
/** Lecciones de la clase de miembros si la iglesia no escribió las suyas (son 4: la base cuenta lo mismo). */
export const DEFAULT_MEMBER_LESSONS = ['La salvación y el bautismo', 'Qué es la iglesia', 'Lo que creemos', 'Cómo vivimos y servimos'];
export const DEFAULT_MEMBER_FINAL = 'Recibido como miembro';
export const MAX_LESSONS = 20;

/** Los nombres de las lecciones del curso: los que guardó la iglesia y, donde falta, "Lección 3". Siempre `total` nombres. */
export function lessonNames(saved: readonly (string | null | undefined)[] | null | undefined, total: number): string[] {
  const n = Math.max(0, Math.min(MAX_LESSONS, Math.floor(total) || 0));
  return Array.from({ length: n }, (_, i) => (saved?.[i] ?? '').trim() || tx('Lección {v1}', { v1: i + 1 }));
}

/** Las lecciones de la clase de miembros: las de la iglesia o las de siempre. */
export function memberLessons(saved: readonly (string | null | undefined)[] | null | undefined): string[] {
  const own = (saved ?? []).map((s) => (s ?? '').trim()).filter(Boolean);
  return own.length ? own.slice(0, MAX_LESSONS) : DEFAULT_MEMBER_LESSONS;
}

/** Lo que se escribió en la pantalla de lecciones, listo para guardar. Devuelve el problema si hay uno. */
export function cleanLessons(names: readonly string[]): { ok: true; names: string[] } | { ok: false; problem: string } {
  const list = names.map((s) => s.trim());
  if (!list.length) return { ok: false, problem: tx('Tiene que haber al menos una lección.') };
  if (list.length > MAX_LESSONS) return { ok: false, problem: tx('Pueden ser hasta {MAX_LESSONS} lecciones.', { MAX_LESSONS }) };
  const empty = list.findIndex((s) => !s);
  if (empty >= 0) return { ok: false, problem: tx('A la lección {v1} le falta el nombre.', { v1: empty + 1 }) };
  if (list.some((s) => s.length > 80)) return { ok: false, problem: tx('Cada nombre puede tener hasta 80 letras.') };
  return { ok: true, names: list };
}

/** Lecciones hechas: número de lección → fecha (AAAA-MM-DD). */
export type Done = Record<string, string>;

/** Cuántas hizo, cuál sigue (null si terminó) y si ya terminó. Las que quedan fuera del curso no cuentan. */
export function lessonProgress(done: Done | null | undefined, total: number): { done: number; next: number | null; complete: boolean } {
  let count = 0;
  let next: number | null = null;
  for (let n = 1; n <= total; n++) {
    if (done?.[String(n)]) count++;
    else if (next === null) next = n;
  }
  return { done: count, next, complete: total > 0 && count >= total };
}

// ---------- Días sin juntarse ----------

/** A partir de cuántos días sin juntarse se resalta en la lista. */
export const STALE_DAYS = 14;

/** Días enteros desde una fecha AAAA-MM-DD (null si no hay fecha o está mal). Nunca negativo. */
export function daysSinceDay(day: string | null | undefined, today = new Date()): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) return null;
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((now - then) / 86400000));
}

/** ¿Hace más de 14 días que no se juntan? Si nunca se juntaron, se cuenta desde que empezó. */
export function isStale(lastMet: string | null | undefined, startedOn: string | null | undefined, today = new Date()): boolean {
  const d = daysSinceDay(lastMet ?? startedOn, today);
  return d !== null && d > STALE_DAYS;
}

/** "hoy", "ayer", "hace 5 días". */
export function agoText(days: number | null): string {
  if (days === null) return tx('todavía no');
  if (days === 0) return 'hoy';
  if (days === 1) return tx('ayer');
  return tx('hace {days} días', { days });
}

export type DiscRow = {
  id: string; name: string; photo_path: string | null; phone: string | null;
  teacher_id: string | null; teacher_name: string | null; started_on: string; last_met: string | null;
  lessons: Done; finished_on: string | null; active: boolean; mine: boolean;
};

/** La lista para los líderes: primero los que hace más de 14 días que no se juntan (el que más hace, arriba), después por nombre. */
export function sortDisciples<T extends Pick<DiscRow, 'name' | 'last_met' | 'started_on'>>(rows: T[], today = new Date()): T[] {
  const days = (r: T) => daysSinceDay(r.last_met ?? r.started_on, today) ?? 0;
  return [...rows].sort((a, b) => {
    const sa = isStale(a.last_met, a.started_on, today), sb = isStale(b.last_met, b.started_on, today);
    if (sa !== sb) return sa ? -1 : 1;
    if (sa && days(a) !== days(b)) return days(b) - days(a);
    return a.name.localeCompare(b.name, 'es');
  });
}

// ---------- Decisiones ----------

export type DecisionKind = 'saved' | 'baptized' | 'member' | 'rededicated';
export const DECISION_KINDS: DecisionKind[] = ['saved', 'baptized', 'member', 'rededicated'];
export const DECISION_LABEL: Record<DecisionKind, string> = {
  get saved() { return tx('Fue salvo'); }, get baptized() { return tx('Se bautizó'); }, get member() { return tx('Se hizo miembro'); }, get rededicated() { return tx('Se reconcilió con Dios'); },
};

/** Lo que devuelve la base al anotar una decisión: cómo quedó la persona. */
export type DecisionState = { in_discipleship: boolean; has_followup: boolean; in_member_class: boolean; is_member: boolean; baptized: boolean };
export type NextStep = 'discipleship' | 'followup' | 'certificate_baptism' | 'member_class' | 'certificate_member';

/** Los pasos que conviene ofrecer después de cada decisión (solo los que todavía faltan). */
export function nextSteps(kind: DecisionKind, s: DecisionState): NextStep[] {
  const out: NextStep[] = [];
  if (kind === 'saved') {
    if (!s.in_discipleship) out.push('discipleship');
    if (!s.has_followup) out.push('followup');
  } else if (kind === 'baptized') {
    out.push('certificate_baptism');
    if (!s.is_member && !s.in_member_class) out.push('member_class');
    if (!s.in_discipleship) out.push('discipleship');
  } else if (kind === 'member') {
    out.push('certificate_member');
  } else if (!s.has_followup) {
    out.push('followup');
  }
  return out;
}

// ---------- Fechas escritas a mano ----------

/** "15/03/2024" → "2024-03-15". Vacío → null (hoy). Mal escrita o un día que todavía no llegó → undefined. */
export function parseDay(text: string, today = new Date()): string | null | undefined {
  const s = text.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return undefined;
  const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]), mo = Number(m[2]), d = Number(m[1]);
  const date = new Date(y, mo - 1, d, 12);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || y < 1900) return undefined;
  if (date.getTime() > new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59).getTime()) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "2024-03-15" → "15/03/2024" */
export function showDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ---------- Regalo de bienvenida y visita ----------

export type CareRow = {
  id: string; name: string; photo_path: string | null; phone: string | null; since: string; first_on: string | null;
  gift_on: string | null; gift_by: string | null; visit_on: string | null; visit_by: string | null;
};
export type CareFilter = 'all' | 'no_gift' | 'no_visit';

export function filterCare<T extends Pick<CareRow, 'gift_on' | 'visit_on'>>(rows: T[], f: CareFilter): T[] {
  if (f === 'no_gift') return rows.filter((r) => !r.gift_on);
  if (f === 'no_visit') return rows.filter((r) => !r.visit_on);
  return rows;
}

// ---------- Tarjeta de visita ----------

/** Cómo nos conoció: las opciones que ve la visita. */
export const HEARD_OPTIONS = ['Me invitó un amigo o familiar', 'Me visitaron en mi casa', 'Vivo cerca', 'Por internet o redes', 'Otro'];

/** La dirección que lleva el QR de la puerta. */
export function visitUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/visita/${encodeURIComponent(token)}`;
}

/** ¿Qué le falta al nombre? (null si está bien). Los mismos controles que hace la base. */
export function nameProblem(name: string): string | null {
  const s = name.trim().replace(/\s+/g, ' ');
  if (s.length < 3 || !/\p{L}{2}/u.test(s)) return tx('Escribí tu nombre y apellido.');
  if (s.length > 80) return tx('El nombre es muy largo.');
  if (/https?:|www\.|[<>@]/i.test(s)) return tx('Escribí solo tu nombre y apellido.');
  return null;
}

export const PRAYER_MAX = 500;
