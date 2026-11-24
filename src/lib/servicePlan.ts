// Orden del culto: las partes de una reunión, en orden, y quién se ocupa de cada una.
// Solo lógica: sin pantalla ni base, para poder probarse sola.
// Se guarda en la tabla service_plans (columna items). Otra pantalla (el modo presentación) lo puede leer con cleanItems().

import { tx } from './i18n';
export type PlanItemType = 'song' | 'prayer' | 'notices' | 'offering' | 'reading' | 'sermon' | 'other';

export type PlanItem = {
  id: string;
  type: PlanItemType;
  /** Lo que se ve en la lista: el nombre de la canción, "Oración", el título de la prédica... */
  title: string;
  /** La canción del Cancionero (solo si type es 'song'). */
  songId: string | null;
  /** El pasaje (solo si type es 'reading'), por ejemplo "Salmos 23". */
  ref: string | null;
  /** La cuenta del responsable, si usa la app: es quien puede ver el orden y recibe el aviso. */
  whoId: string | null;
  /** El nombre del responsable (también sirve para alguien que no usa la app). */
  whoName: string | null;
  note: string | null;
};

export type ServicePlan = { id: string; church_id: string; service_date: string; title: string; items: PlanItem[]; updated_at: string };

export const PLAN_TYPES: { type: PlanItemType; label: string; icon: string }[] = [
  { type: 'song', get label() { return tx('Canción'); }, icon: 'music' },
  { type: 'prayer', get label() { return tx('Oración'); }, icon: 'heart' },
  { type: 'notices', get label() { return tx('Anuncios'); }, icon: 'volume-2' },
  { type: 'offering', get label() { return tx('Ofrenda'); }, icon: 'gift' },
  { type: 'reading', get label() { return tx('Lectura bíblica'); }, icon: 'book-open' },
  { type: 'sermon', get label() { return tx('Prédica'); }, icon: 'mic' },
  { type: 'other', get label() { return tx('Otro'); }, icon: 'more-horizontal' },
];
const TYPES = new Set<string>(PLAN_TYPES.map((t) => t.type));
export const typeInfo = (t: PlanItemType) => PLAN_TYPES.find((x) => x.type === t) ?? PLAN_TYPES[PLAN_TYPES.length - 1];

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function newItem(type: PlanItemType, id = newId()): PlanItem {
  return { id, type, title: typeInfo(type).label, songId: null, ref: null, whoId: null, whoName: null, note: null };
}

/** Un culto común para empezar; después se cambia lo que haga falta. */
export function starterItems(): PlanItem[] {
  const order: PlanItemType[] = ['prayer', 'song', 'song', 'notices', 'offering', 'reading', 'sermon', 'prayer'];
  return order.map((t, i) => newItem(t, `${newId()}${i}`));
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Lee lo que vino de la base sin romperse si falta algo o hay algo raro. */
export function cleanItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PlanItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const type = (typeof o.type === 'string' && TYPES.has(o.type) ? o.type : 'other') as PlanItemType;
    let id = text(o.id, 40) ?? newId();
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    out.push({
      id, type,
      title: text(o.title, 160) ?? typeInfo(type).label,
      songId: type === 'song' ? text(o.songId, 40) : null,
      ref: type === 'reading' ? text(o.ref, 80) : null,
      whoId: text(o.whoId, 40),
      whoName: text(o.whoName, 80),
      note: text(o.note, 300),
    });
  }
  return out;
}

/** Sube (-1) o baja (1) una parte. */
export function moveItem(items: PlanItem[], id: string, dir: -1 | 1): PlanItem[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const patchItem = (items: PlanItem[], id: string, patch: Partial<PlanItem>): PlanItem[] => items.map((x) => (x.id === id ? { ...x, ...patch } : x));
export const removeItem = (items: PlanItem[], id: string): PlanItem[] => items.filter((x) => x.id !== id);

/** Las partes que le tocan a una persona. */
export const myParts = (items: PlanItem[], profileId: string | null | undefined): PlanItem[] => (profileId ? items.filter((x) => x.whoId === profileId) : []);

/** Quién hace qué, para verlo de un vistazo: "Predica: ...", "Dirige las canciones: ...", "Anuncios: ...". */
export function mainRoles(items: PlanItem[]): { label: string; names: string[] }[] {
  const names = (types: PlanItemType[]) => [...new Set(items.filter((x) => types.includes(x.type) && x.whoName).map((x) => x.whoName as string))];
  return [
    { label: tx('Predica'), names: names(['sermon']) },
    { label: tx('Dirige las canciones'), names: names(['song']) },
    { label: tx('Anuncios'), names: names(['notices']) },
  ].filter((r) => r.names.length > 0);
}

/** "Culto del domingo" si la fecha cae en domingo, etc. Para proponer el título. */
export function titleFor(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = new Date(y, (m || 1) - 1, d || 1, 12).getDay();
  return tx('Culto del {v1}', { v1: [tx('domingo'), tx('lunes'), tx('martes'), tx('miércoles'), tx('jueves'), tx('viernes'), tx('sábado')][dow] });
}
