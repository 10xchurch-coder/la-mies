// Planes para leer la Biblia en un año. Cada día se muestra qué capítulos tocan y la persona lo tilda.
// (Todavía no se lee la Biblia dentro de la app: acá va solo la guía de lectura.)
// No importa nada de la app para poder probarse sola.

export type PlanId = 'new30' | 'new90' | 'new180' | 'bible' | 'psalms' | 'chrono' | 'nt' | 'ot';

/** Libros en el orden de la Reina-Valera 1960, con la cantidad de capítulos. Los primeros 39 son el Antiguo Testamento. */
export const BOOKS: [string, number][] = [
  ['Génesis', 50], ['Éxodo', 40], ['Levítico', 27], ['Números', 36], ['Deuteronomio', 34], ['Josué', 24], ['Jueces', 21], ['Rut', 4],
  ['1 Samuel', 31], ['2 Samuel', 24], ['1 Reyes', 22], ['2 Reyes', 25], ['1 Crónicas', 29], ['2 Crónicas', 36], ['Esdras', 10], ['Nehemías', 13],
  ['Ester', 10], ['Job', 42], ['Salmos', 150], ['Proverbios', 31], ['Eclesiastés', 12], ['Cantares', 8], ['Isaías', 66], ['Jeremías', 52],
  ['Lamentaciones', 5], ['Ezequiel', 48], ['Daniel', 12], ['Oseas', 14], ['Joel', 3], ['Amós', 9], ['Abdías', 1], ['Jonás', 4], ['Miqueas', 7],
  ['Nahum', 3], ['Habacuc', 3], ['Sofonías', 3], ['Hageo', 2], ['Zacarías', 14], ['Malaquías', 4],
  ['Mateo', 28], ['Marcos', 16], ['Lucas', 24], ['Juan', 21], ['Hechos', 28], ['Romanos', 16], ['1 Corintios', 16], ['2 Corintios', 13],
  ['Gálatas', 6], ['Efesios', 6], ['Filipenses', 4], ['Colosenses', 4], ['1 Tesalonicenses', 5], ['2 Tesalonicenses', 3], ['1 Timoteo', 6],
  ['2 Timoteo', 4], ['Tito', 3], ['Filemón', 1], ['Hebreos', 13], ['Santiago', 5], ['1 Pedro', 5], ['2 Pedro', 3], ['1 Juan', 5], ['2 Juan', 1],
  ['3 Juan', 1], ['Judas', 1], ['Apocalipsis', 22],
];
const OT = 39;

export type PlanInfo = { id: PlanId; group: 'new' | 'year'; title: string; hint: string; days: number };
export const PLANS: PlanInfo[] = [
  { id: 'new30', group: 'new', title: 'Primeros pasos: 1 mes', hint: 'Juan, 1 Juan y Filipenses · un capítulo por día', days: 30 },
  { id: 'new90', group: 'new', title: 'Primeros pasos: 3 meses', hint: 'Juan, Hechos, Romanos y 5 cartas · un capítulo por día', days: 90 },
  { id: 'new180', group: 'new', title: 'Primeros pasos: 6 meses', hint: 'Lo principal del Nuevo Testamento, Génesis y Proverbios · 1 o 2 capítulos por día', days: 180 },
  { id: 'bible', group: 'year', title: 'Toda la Biblia en un año', hint: 'De Génesis a Apocalipsis · unos 3 capítulos por día', days: 365 },
  { id: 'psalms', group: 'year', title: 'La Biblia en un año, con un salmo y un proverbio', hint: 'Cada día: tu lectura, un salmo y un capítulo de Proverbios', days: 365 },
  { id: 'chrono', group: 'year', title: 'La Biblia en orden cronológico', hint: 'Los libros en el orden en que pasaron las cosas · un año', days: 365 },
  { id: 'nt', group: 'year', title: 'El Nuevo Testamento en un año', hint: 'Un capítulo, 5 días por semana', days: 365 },
  { id: 'ot', group: 'year', title: 'El Antiguo Testamento en un año', hint: 'Entre 2 y 3 capítulos por día', days: 365 },
];
export function planDays(plan: PlanId): number {
  return PLANS.find((p) => p.id === plan)?.days ?? 365;
}

type Chapter = { book: string; ch: number; single: boolean };
/** Un tramo: el libro entero ('Juan') o una parte (['Génesis', 1, 11]). */
type Seg = string | [string, number, number];

const SIZE = new Map(BOOKS);
function expand(segs: Seg[]): Chapter[] {
  return segs.flatMap((sg) => {
    const [book, from, to] = typeof sg === 'string' ? [sg, 1, SIZE.get(sg) ?? 0] : sg;
    return Array.from({ length: to - from + 1 }, (_, i) => ({ book, ch: from + i, single: SIZE.get(book) === 1 }));
  });
}

// Para nuevos creyentes: libros enteros, empezando por conocer a Jesús (Juan) y la seguridad de la salvación (1 Juan).
const NEW30: Seg[] = ['Juan', '1 Juan', 'Filipenses'];
// 90 capítulos justos: uno por día.
const NEW90: Seg[] = ['Juan', '1 Juan', 'Hechos', 'Romanos', 'Efesios', 'Filipenses', 'Santiago', '1 Pedro'];
const NEW180: Seg[] = ['Juan', '1 Juan', 'Marcos', 'Hechos', 'Romanos', 'Génesis', 'Gálatas', 'Efesios', 'Filipenses', 'Colosenses', '1 Tesalonicenses', 'Santiago', '1 Pedro', 'Proverbios'];

/**
 * Orden cronológico por libros y tramos (no versículo por versículo): Job con los patriarcas, los Salmos con David,
 * los profetas junto a los reyes de su tiempo, y las cartas de Pablo dentro de Hechos.
 */
export const CHRONO: Seg[] = [
  ['Génesis', 1, 11], 'Job', ['Génesis', 12, 50], 'Éxodo', 'Levítico', 'Números', 'Deuteronomio', 'Josué', 'Jueces', 'Rut',
  '1 Samuel', '2 Samuel', '1 Crónicas', 'Salmos', ['1 Reyes', 1, 11], ['2 Crónicas', 1, 9], 'Proverbios', 'Eclesiastés', 'Cantares',
  ['1 Reyes', 12, 22], ['2 Crónicas', 10, 20], ['2 Reyes', 1, 14], ['2 Crónicas', 21, 25], 'Abdías', 'Joel', 'Jonás', 'Amós', 'Oseas',
  'Isaías', 'Miqueas', ['2 Reyes', 15, 20], ['2 Crónicas', 26, 32], 'Nahum', ['2 Reyes', 21, 23], ['2 Crónicas', 33, 35], 'Sofonías',
  'Jeremías', 'Habacuc', ['2 Reyes', 24, 25], ['2 Crónicas', 36, 36], 'Lamentaciones', 'Ezequiel', 'Daniel',
  ['Esdras', 1, 6], 'Hageo', 'Zacarías', 'Ester', ['Esdras', 7, 10], 'Nehemías', 'Malaquías',
  'Mateo', 'Marcos', 'Lucas', 'Juan', ['Hechos', 1, 14], 'Santiago', 'Gálatas', ['Hechos', 15, 18], '1 Tesalonicenses', '2 Tesalonicenses',
  ['Hechos', 19, 20], '1 Corintios', '2 Corintios', 'Romanos', ['Hechos', 21, 28], 'Efesios', 'Filipenses', 'Colosenses', 'Filemón',
  '1 Timoteo', 'Tito', '1 Pedro', 'Hebreos', '2 Timoteo', '2 Pedro', 'Judas', '1 Juan', '2 Juan', '3 Juan', 'Apocalipsis',
];

export function chaptersOf(plan: PlanId): Chapter[] {
  const all = BOOKS.map((b) => b[0]);
  switch (plan) {
    case 'new30': return expand(NEW30);
    case 'new90': return expand(NEW90);
    case 'new180': return expand(NEW180);
    case 'chrono': return expand(CHRONO);
    case 'nt': return expand(all.slice(OT));
    case 'ot': return expand(all.slice(0, OT));
    // Con un salmo y un proverbio por día, esos dos libros no van en la lectura principal.
    case 'psalms': return expand(all.filter((b) => b !== 'Salmos' && b !== 'Proverbios'));
    default: return expand(all);
  }
}

/** "Génesis 1–3", "Génesis 50; Éxodo 1–2", "Judas". */
function label(chs: Chapter[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < chs.length) {
    let j = i;
    while (j + 1 < chs.length && chs[j + 1].book === chs[i].book && chs[j + 1].ch === chs[j].ch + 1) j++;
    parts.push(chs[i].single ? chs[i].book : i === j ? `${chs[i].book} ${chs[i].ch}` : `${chs[i].book} ${chs[i].ch}–${chs[j].ch}`);
    i = j + 1;
  }
  return parts.join('; ');
}

const chaptersCache: Partial<Record<PlanId, Chapter[]>> = {};
function chaptersCached(plan: PlanId): Chapter[] {
  return (chaptersCache[plan] ??= chaptersOf(plan));
}

/** Los capítulos que toca leer un día (en el plan con un salmo y un proverbio por día, también esos dos). */
export function planDayChapters(plan: PlanId, d: number): { book: string; ch: number }[] {
  const chs = chaptersCached(plan);
  const days = planDays(plan);
  const from = Math.ceil((d * chs.length) / days);
  const to = Math.ceil(((d + 1) * chs.length) / days);
  const out = chs.slice(from, to).map((c) => ({ book: c.book, ch: c.ch }));
  if (plan === 'psalms' && out.length) out.push({ book: 'Salmos', ch: (d % 150) + 1 }, { book: 'Proverbios', ch: (d % 31) + 1 });
  return out;
}

const cache: Partial<Record<PlanId, string[]>> = {};

/**
 * Las lecturas del plan, una por día. Los capítulos se reparten parejo a lo largo del plan;
 * en el plan del Nuevo Testamento (260 capítulos en 365 días) algunos días quedan libres: '' = hoy no hay lectura.
 */
export function planReadings(plan: PlanId): string[] {
  const hit = cache[plan];
  if (hit) return hit;
  const chs = chaptersCached(plan);
  const days = planDays(plan);
  const out: string[] = [];
  for (let d = 0; d < days; d++) {
    // Redondeando para arriba, el primer día siempre tiene lectura.
    const from = Math.ceil((d * chs.length) / days);
    const to = Math.ceil(((d + 1) * chs.length) / days);
    let text = label(chs.slice(from, to));
    if (plan === 'psalms') text = `${text} · Salmo ${(d % 150) + 1} · Proverbios ${(d % 31) + 1}`;
    out.push(text);
  }
  cache[plan] = out;
  return out;
}

/** Qué día del plan es hoy (0 = el día que empezó). Terminado el plan queda en el último día. */
export function planDay(startedOn: string, today: string, days = 365): number {
  const a = new Date(`${startedOn}T12:00:00`).getTime();
  const b = new Date(`${today}T12:00:00`).getTime();
  return Math.max(0, Math.min(days - 1, Math.round((b - a) / 86400000)));
}

export type PlanStatus = {
  day: number;
  /** Lectura de hoy ('' si hoy es día libre). */
  today: string;
  todayDone: boolean;
  /** Días anteriores con lectura que quedaron sin tildar (los más viejos primero). */
  behind: number[];
  /** Lecturas tildadas y total de lecturas del plan. */
  done: number;
  total: number;
};

export function planStatus(plan: PlanId, startedOn: string, done: number[], today: string): PlanStatus {
  const readings = planReadings(plan);
  const set = new Set(done);
  const day = planDay(startedOn, today, planDays(plan));
  const behind: number[] = [];
  for (let d = 0; d < day; d++) if (readings[d] && !set.has(d)) behind.push(d);
  const total = readings.filter(Boolean).length;
  return { day, today: readings[day], todayDone: set.has(day), behind, done: done.filter((d) => readings[d]).length, total };
}
