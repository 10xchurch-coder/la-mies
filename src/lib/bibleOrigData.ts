// Las "palabras originales" de la Biblia (hebreo y griego con números de Strong) que viajan dentro de la app.
// Datos de STEPBible-Data (Tyndale House, Cambridge, y STEPBible.org), licencia CC BY 4.0. Los genera scripts/bible-import-strongs.py.
// Igual que la King James: todo se pide con import(), así en la web se baja recién cuando hace falta.
// Este archivo se arma solo (la lista de libros); no tiene lógica. Para leer los datos, ver bibleOrig.ts.

/** Un libro: "w" formas separadas por espacio, "l" el lema de cada forma, "c" capítulos -> versículos (ver bibleOrig.ts). */
export type OrigBookRaw = { w: string; l: string; c: string[][] };
/** Tabla de lemas de un idioma: campos separados por tabulador, en el mismo orden. */
export type OrigLexRaw = { s: string; w: string; t: string; g: string; b: string };
export type OrigDefsRaw = Record<string, string>;

type Mod<T> = { default: T } | T;
const pick = <T,>(m: Mod<T>): T => ((m as { default?: T }).default ?? (m as T));

const BOOK_FILES: (() => Promise<Mod<OrigBookRaw>>)[] = [
  () => import('../data/bible/orig/00.json'),
  () => import('../data/bible/orig/01.json'),
  () => import('../data/bible/orig/02.json'),
  () => import('../data/bible/orig/03.json'),
  () => import('../data/bible/orig/04.json'),
  () => import('../data/bible/orig/05.json'),
  () => import('../data/bible/orig/06.json'),
  () => import('../data/bible/orig/07.json'),
  () => import('../data/bible/orig/08.json'),
  () => import('../data/bible/orig/09.json'),
  () => import('../data/bible/orig/10.json'),
  () => import('../data/bible/orig/11.json'),
  () => import('../data/bible/orig/12.json'),
  () => import('../data/bible/orig/13.json'),
  () => import('../data/bible/orig/14.json'),
  () => import('../data/bible/orig/15.json'),
  () => import('../data/bible/orig/16.json'),
  () => import('../data/bible/orig/17.json'),
  () => import('../data/bible/orig/18.json'),
  () => import('../data/bible/orig/19.json'),
  () => import('../data/bible/orig/20.json'),
  () => import('../data/bible/orig/21.json'),
  () => import('../data/bible/orig/22.json'),
  () => import('../data/bible/orig/23.json'),
  () => import('../data/bible/orig/24.json'),
  () => import('../data/bible/orig/25.json'),
  () => import('../data/bible/orig/26.json'),
  () => import('../data/bible/orig/27.json'),
  () => import('../data/bible/orig/28.json'),
  () => import('../data/bible/orig/29.json'),
  () => import('../data/bible/orig/30.json'),
  () => import('../data/bible/orig/31.json'),
  () => import('../data/bible/orig/32.json'),
  () => import('../data/bible/orig/33.json'),
  () => import('../data/bible/orig/34.json'),
  () => import('../data/bible/orig/35.json'),
  () => import('../data/bible/orig/36.json'),
  () => import('../data/bible/orig/37.json'),
  () => import('../data/bible/orig/38.json'),
  () => import('../data/bible/orig/39.json'),
  () => import('../data/bible/orig/40.json'),
  () => import('../data/bible/orig/41.json'),
  () => import('../data/bible/orig/42.json'),
  () => import('../data/bible/orig/43.json'),
  () => import('../data/bible/orig/44.json'),
  () => import('../data/bible/orig/45.json'),
  () => import('../data/bible/orig/46.json'),
  () => import('../data/bible/orig/47.json'),
  () => import('../data/bible/orig/48.json'),
  () => import('../data/bible/orig/49.json'),
  () => import('../data/bible/orig/50.json'),
  () => import('../data/bible/orig/51.json'),
  () => import('../data/bible/orig/52.json'),
  () => import('../data/bible/orig/53.json'),
  () => import('../data/bible/orig/54.json'),
  () => import('../data/bible/orig/55.json'),
  () => import('../data/bible/orig/56.json'),
  () => import('../data/bible/orig/57.json'),
  () => import('../data/bible/orig/58.json'),
  () => import('../data/bible/orig/59.json'),
  () => import('../data/bible/orig/60.json'),
  () => import('../data/bible/orig/61.json'),
  () => import('../data/bible/orig/62.json'),
  () => import('../data/bible/orig/63.json'),
  () => import('../data/bible/orig/64.json'),
  () => import('../data/bible/orig/65.json'),
];
const LEX_FILES: Record<'H' | 'G', () => Promise<Mod<OrigLexRaw>>> = {
  H: () => import('../data/bible/orig/lex-h.json'),
  G: () => import('../data/bible/orig/lex-g.json'),
};
/** Definiciones del griego, de a 500 números de Strong (0: G1–G499, 1: G500–G999, ... 12: G6000 en adelante). */
const DEF_FILES: (() => Promise<Mod<OrigDefsRaw>>)[] = [
  () => import('../data/bible/orig/def-g-00.json'),
  () => import('../data/bible/orig/def-g-01.json'),
  () => import('../data/bible/orig/def-g-02.json'),
  () => import('../data/bible/orig/def-g-03.json'),
  () => import('../data/bible/orig/def-g-04.json'),
  () => import('../data/bible/orig/def-g-05.json'),
  () => import('../data/bible/orig/def-g-06.json'),
  () => import('../data/bible/orig/def-g-07.json'),
  () => import('../data/bible/orig/def-g-08.json'),
  () => import('../data/bible/orig/def-g-09.json'),
  () => import('../data/bible/orig/def-g-10.json'),
  () => import('../data/bible/orig/def-g-11.json'),
  () => import('../data/bible/orig/def-g-12.json'),
];

export const ORIG_BOOKS = BOOK_FILES.length;
export const ORIG_DEF_CHUNKS = DEF_FILES.length;
export const fetchOrigBook = async (book: number): Promise<OrigBookRaw> => pick(await BOOK_FILES[book]());
export const fetchOrigLex = async (lang: 'H' | 'G'): Promise<OrigLexRaw> => pick(await LEX_FILES[lang]());
export const fetchOrigDefs = async (chunk: number): Promise<OrigDefsRaw> => pick(await DEF_FILES[chunk]());
