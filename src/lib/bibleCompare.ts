// Leer dos versiones de la Biblia a la vez: qué segunda versión mostrar y cómo poner los versículos uno al lado del otro.
// Sin nada de la app ni de la base, para poder probarse sola.
import { allowedVersions, type BibleVersion } from './bible';
import { numberingDiffers } from './bibleStudy';

/** Desde este ancho entran dos columnas cómodas (tablet o computadora). Es el mismo corte que usa el resto de la app. */
export const COMPARE_WIDE = 700;

/**
 * La segunda versión para comparar. `wanted` es lo que la persona eligió la última vez (o nada si no compara).
 * Si eligió la misma que está leyendo, o una que ya no existe o que la iglesia no permite, va la primera versión distinta. null si no compara o no hay otra.
 */
export function compareVersion(primary: string, wanted: string | undefined | null): BibleVersion | null {
  if (!wanted) return null;
  const others = allowedVersions().filter((v) => v.id !== primary);
  return others.find((v) => v.id === wanted) ?? others[0] ?? null;
}

export type ComparedVerse = {
  /** Número de versículo. */
  n: number;
  /** El texto en la versión que se lee; null si esa versión no tiene ese número. */
  a: string | null;
  /** El texto en la segunda versión; null si no lo tiene (o si todavía se está cargando). */
  b: string | null;
};

/**
 * Pone los versículos de las dos versiones lado a lado, por número. Si un capítulo tiene más versículos en una
 * que en la otra (pasa en pocos capítulos), los que sobran quedan solos, con null del otro lado. Nunca falla.
 */
export function alignVerses(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): ComparedVerse[] {
  const va = a ?? [];
  const vb = b ?? [];
  const out: ComparedVerse[] = [];
  const n = Math.max(va.length, vb.length);
  for (let i = 0; i < n; i++) out.push({ n: i + 1, a: i < va.length ? va[i] : null, b: i < vb.length ? vb[i] : null });
  return out;
}

/** ¿Hay que avisar que en este capítulo los números no coinciden entre las dos versiones que se comparan? */
export function compareNotice(book: number, chapter: number, a: string, b: string): boolean {
  return (a === 'rv1909') !== (b === 'rv1909') && numberingDiffers(book, chapter);
}

/** ¿Van dos columnas? En pantalla ancha siempre; en el teléfono solo si la persona lo pidió. */
export function compareColumns(width: number, forced: boolean | undefined): boolean {
  return width >= COMPARE_WIDE || !!forced;
}
