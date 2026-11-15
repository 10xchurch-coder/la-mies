// Programa de discipulado de la iglesia: unas clases uno a uno y después un curso (por ejemplo 4 y 13).
// De cada persona se guarda qué clases completó y cuándo; completar cada parte es un logro.
// No importa nada de la app para poder probarse sola.

export type DiscPart = 'one' | 'course';
/** Por parte, el número de clase (desde 1) y la fecha en que la completó. */
export type Discipleship = Partial<Record<DiscPart, Record<string, string>>>;

export const PART_TITLE: Record<DiscPart, string> = { one: 'Discipulado personal', course: 'Curso de discipulado' };

/** Marca o desmarca una clase. Devuelve un objeto nuevo. */
export function toggleClass(d: Discipleship | null | undefined, part: DiscPart, n: number, today: string): Discipleship {
  const cur = { ...(d?.[part] ?? {}) };
  if (cur[String(n)]) delete cur[String(n)]; else cur[String(n)] = today;
  return { ...(d ?? {}), [part]: cur };
}

export type PartProgress = { done: number; total: number; complete: boolean; /** Día en que completó la última clase que faltaba. */ completedOn: string | null };

export function partProgress(d: Discipleship | null | undefined, part: DiscPart, total: number): PartProgress {
  const cur = d?.[part] ?? {};
  const dates: string[] = [];
  for (let n = 1; n <= total; n++) if (cur[String(n)]) dates.push(cur[String(n)]);
  const complete = total > 0 && dates.length >= total;
  return { done: dates.length, total, complete, completedOn: complete ? [...dates].sort().pop() ?? null : null };
}

/** ¿Hizo al menos una clase? (para anotar que empezó el discipulado) */
export function hasStarted(d: Discipleship | null | undefined): boolean {
  return Object.keys(d?.one ?? {}).length + Object.keys(d?.course ?? {}).length > 0;
}
