// Planes para leer la Biblia en un año. Cada día se muestra qué capítulos tocan y la persona lo tilda.
// (Todavía no se lee la Biblia dentro de la app: acá va solo la guía de lectura.)
// No importa nada de la app para poder probarse sola.

export type PlanId = 'bible' | 'nt' | 'ot';

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
export const PLAN_DAYS = 365;

export const PLANS: { id: PlanId; title: string; hint: string }[] = [
  { id: 'bible', title: 'Toda la Biblia en un año', hint: 'Unos 3 capítulos por día' },
  { id: 'nt', title: 'El Nuevo Testamento en un año', hint: 'Un capítulo, 5 días por semana' },
  { id: 'ot', title: 'El Antiguo Testamento en un año', hint: 'Entre 2 y 3 capítulos por día' },
];

type Chapter = { book: string; ch: number; single: boolean };

function chaptersOf(plan: PlanId): Chapter[] {
  const books = plan === 'nt' ? BOOKS.slice(OT) : plan === 'ot' ? BOOKS.slice(0, OT) : BOOKS;
  return books.flatMap(([book, n]) => Array.from({ length: n }, (_, i) => ({ book, ch: i + 1, single: n === 1 })));
}

/** "Génesis 1–3", "Génesis 50; Éxodo 1–2", "Judas". */
function label(chs: Chapter[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < chs.length) {
    let j = i;
    while (j + 1 < chs.length && chs[j + 1].book === chs[i].book) j++;
    parts.push(chs[i].single ? chs[i].book : i === j ? `${chs[i].book} ${chs[i].ch}` : `${chs[i].book} ${chs[i].ch}–${chs[j].ch}`);
    i = j + 1;
  }
  return parts.join('; ');
}

const cache: Partial<Record<PlanId, string[]>> = {};

/**
 * Las 365 lecturas del plan, una por día. Los capítulos se reparten parejo a lo largo del año;
 * en el plan del Nuevo Testamento (260 capítulos) algunos días quedan libres: '' = hoy no hay lectura.
 */
export function planReadings(plan: PlanId): string[] {
  const hit = cache[plan];
  if (hit) return hit;
  const chs = chaptersOf(plan);
  const out: string[] = [];
  for (let d = 0; d < PLAN_DAYS; d++) {
    // Redondeando para arriba, el primer día siempre tiene lectura.
    const from = Math.ceil((d * chs.length) / PLAN_DAYS);
    const to = Math.ceil(((d + 1) * chs.length) / PLAN_DAYS);
    out.push(label(chs.slice(from, to)));
  }
  cache[plan] = out;
  return out;
}

/** Qué día del plan es hoy (0 = el día que empezó). Pasado el año queda en el último día. */
export function planDay(startedOn: string, today: string): number {
  const a = new Date(`${startedOn}T12:00:00`).getTime();
  const b = new Date(`${today}T12:00:00`).getTime();
  return Math.max(0, Math.min(PLAN_DAYS - 1, Math.round((b - a) / 86400000)));
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
  const day = planDay(startedOn, today);
  const behind: number[] = [];
  for (let d = 0; d < day; d++) if (readings[d] && !set.has(d)) behind.push(d);
  const total = readings.filter(Boolean).length;
  return { day, today: readings[day], todayDone: set.has(day), behind, done: done.filter((d) => readings[d]).length, total };
}
