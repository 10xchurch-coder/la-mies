// Apuntes de las prédicas: el bosquejo con los espacios "___" y lo que cada uno completó.
// Solo lógica: sin pantalla ni base, para poder probarse sola.

export const BLANK = '___';

/** Los renglones del bosquejo que tienen algo escrito. */
export const outlineLines = (outline: string | null | undefined): string[] => (outline ?? '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());

/** Cuántos espacios para completar tiene el bosquejo. */
export const blankCount = (outline: string | null | undefined): number => outlineLines(outline).reduce((n, l) => n + (l.split(BLANK).length - 1), 0);

/** El bosquejo con las respuestas puestas en su lugar. Lo que quedó sin completar se ve como "____". */
export function filledOutline(outline: string | null | undefined, answers: (string | null | undefined)[] | null | undefined): string {
  let k = -1;
  return outlineLines(outline).map((line) => {
    const parts = line.split(BLANK);
    return parts.map((p, i) => (i < parts.length - 1 ? `${p}${(answers?.[++k] ?? '').trim() || '____'}` : p)).join('');
  }).join('\n');
}

/** Cuántos espacios completó. */
export function filledCount(outline: string | null | undefined, answers: (string | null | undefined)[] | null | undefined): number {
  const total = blankCount(outline);
  return (answers ?? []).slice(0, total).filter((a) => (a ?? '').trim()).length;
}

/** ¿Hay algo escrito (un espacio completado o una nota)? */
export function hasNotes(answers: (string | null | undefined)[] | null | undefined, notes: string | null | undefined): boolean {
  return !!(notes ?? '').trim() || (answers ?? []).some((a) => (a ?? '').trim());
}
