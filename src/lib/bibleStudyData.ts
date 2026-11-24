// Datos de estudio de la Biblia que viajan dentro de la app (se leen sin internet).
// - KJV: King James Version (dominio público), generada por scripts/bible-import-kjv.py.
// - Referencias cruzadas de openbible.info (CC BY), generadas por scripts/bible-import-xrefs.py.
// Un archivo por libro. A diferencia de la RV1909, estos se piden con import(): en el teléfono ya vienen dentro de la app,
// y en la web cada libro se baja recién cuando hace falta, así la app no tarda más en abrir.
// Por eso hay que pedir el libro antes de leerlo: loadKjvBook(libro) o loadRefsBook(libro). Hasta entonces se ve vacío.
import type { BookText } from './bibleData';

/** Referencias de un libro: capítulo -> versículo -> lista de números (ver decodeRef en bibleStudy.ts). */
export type BookRefs = number[][][];

type Mod<T> = { default: T } | T;
const pick = <T,>(m: Mod<T>): T => ((m as { default?: T }).default ?? (m as T));

const KJV_FILES: (() => Promise<Mod<BookText>>)[] = [
  () => import('../data/bible/kjv/00.json'),
  () => import('../data/bible/kjv/01.json'),
  () => import('../data/bible/kjv/02.json'),
  () => import('../data/bible/kjv/03.json'),
  () => import('../data/bible/kjv/04.json'),
  () => import('../data/bible/kjv/05.json'),
  () => import('../data/bible/kjv/06.json'),
  () => import('../data/bible/kjv/07.json'),
  () => import('../data/bible/kjv/08.json'),
  () => import('../data/bible/kjv/09.json'),
  () => import('../data/bible/kjv/10.json'),
  () => import('../data/bible/kjv/11.json'),
  () => import('../data/bible/kjv/12.json'),
  () => import('../data/bible/kjv/13.json'),
  () => import('../data/bible/kjv/14.json'),
  () => import('../data/bible/kjv/15.json'),
  () => import('../data/bible/kjv/16.json'),
  () => import('../data/bible/kjv/17.json'),
  () => import('../data/bible/kjv/18.json'),
  () => import('../data/bible/kjv/19.json'),
  () => import('../data/bible/kjv/20.json'),
  () => import('../data/bible/kjv/21.json'),
  () => import('../data/bible/kjv/22.json'),
  () => import('../data/bible/kjv/23.json'),
  () => import('../data/bible/kjv/24.json'),
  () => import('../data/bible/kjv/25.json'),
  () => import('../data/bible/kjv/26.json'),
  () => import('../data/bible/kjv/27.json'),
  () => import('../data/bible/kjv/28.json'),
  () => import('../data/bible/kjv/29.json'),
  () => import('../data/bible/kjv/30.json'),
  () => import('../data/bible/kjv/31.json'),
  () => import('../data/bible/kjv/32.json'),
  () => import('../data/bible/kjv/33.json'),
  () => import('../data/bible/kjv/34.json'),
  () => import('../data/bible/kjv/35.json'),
  () => import('../data/bible/kjv/36.json'),
  () => import('../data/bible/kjv/37.json'),
  () => import('../data/bible/kjv/38.json'),
  () => import('../data/bible/kjv/39.json'),
  () => import('../data/bible/kjv/40.json'),
  () => import('../data/bible/kjv/41.json'),
  () => import('../data/bible/kjv/42.json'),
  () => import('../data/bible/kjv/43.json'),
  () => import('../data/bible/kjv/44.json'),
  () => import('../data/bible/kjv/45.json'),
  () => import('../data/bible/kjv/46.json'),
  () => import('../data/bible/kjv/47.json'),
  () => import('../data/bible/kjv/48.json'),
  () => import('../data/bible/kjv/49.json'),
  () => import('../data/bible/kjv/50.json'),
  () => import('../data/bible/kjv/51.json'),
  () => import('../data/bible/kjv/52.json'),
  () => import('../data/bible/kjv/53.json'),
  () => import('../data/bible/kjv/54.json'),
  () => import('../data/bible/kjv/55.json'),
  () => import('../data/bible/kjv/56.json'),
  () => import('../data/bible/kjv/57.json'),
  () => import('../data/bible/kjv/58.json'),
  () => import('../data/bible/kjv/59.json'),
  () => import('../data/bible/kjv/60.json'),
  () => import('../data/bible/kjv/61.json'),
  () => import('../data/bible/kjv/62.json'),
  () => import('../data/bible/kjv/63.json'),
  () => import('../data/bible/kjv/64.json'),
  () => import('../data/bible/kjv/65.json'),
];
const XREF_FILES: (() => Promise<Mod<BookRefs>>)[] = [
  () => import('../data/bible/xrefs/00.json'),
  () => import('../data/bible/xrefs/01.json'),
  () => import('../data/bible/xrefs/02.json'),
  () => import('../data/bible/xrefs/03.json'),
  () => import('../data/bible/xrefs/04.json'),
  () => import('../data/bible/xrefs/05.json'),
  () => import('../data/bible/xrefs/06.json'),
  () => import('../data/bible/xrefs/07.json'),
  () => import('../data/bible/xrefs/08.json'),
  () => import('../data/bible/xrefs/09.json'),
  () => import('../data/bible/xrefs/10.json'),
  () => import('../data/bible/xrefs/11.json'),
  () => import('../data/bible/xrefs/12.json'),
  () => import('../data/bible/xrefs/13.json'),
  () => import('../data/bible/xrefs/14.json'),
  () => import('../data/bible/xrefs/15.json'),
  () => import('../data/bible/xrefs/16.json'),
  () => import('../data/bible/xrefs/17.json'),
  () => import('../data/bible/xrefs/18.json'),
  () => import('../data/bible/xrefs/19.json'),
  () => import('../data/bible/xrefs/20.json'),
  () => import('../data/bible/xrefs/21.json'),
  () => import('../data/bible/xrefs/22.json'),
  () => import('../data/bible/xrefs/23.json'),
  () => import('../data/bible/xrefs/24.json'),
  () => import('../data/bible/xrefs/25.json'),
  () => import('../data/bible/xrefs/26.json'),
  () => import('../data/bible/xrefs/27.json'),
  () => import('../data/bible/xrefs/28.json'),
  () => import('../data/bible/xrefs/29.json'),
  () => import('../data/bible/xrefs/30.json'),
  () => import('../data/bible/xrefs/31.json'),
  () => import('../data/bible/xrefs/32.json'),
  () => import('../data/bible/xrefs/33.json'),
  () => import('../data/bible/xrefs/34.json'),
  () => import('../data/bible/xrefs/35.json'),
  () => import('../data/bible/xrefs/36.json'),
  () => import('../data/bible/xrefs/37.json'),
  () => import('../data/bible/xrefs/38.json'),
  () => import('../data/bible/xrefs/39.json'),
  () => import('../data/bible/xrefs/40.json'),
  () => import('../data/bible/xrefs/41.json'),
  () => import('../data/bible/xrefs/42.json'),
  () => import('../data/bible/xrefs/43.json'),
  () => import('../data/bible/xrefs/44.json'),
  () => import('../data/bible/xrefs/45.json'),
  () => import('../data/bible/xrefs/46.json'),
  () => import('../data/bible/xrefs/47.json'),
  () => import('../data/bible/xrefs/48.json'),
  () => import('../data/bible/xrefs/49.json'),
  () => import('../data/bible/xrefs/50.json'),
  () => import('../data/bible/xrefs/51.json'),
  () => import('../data/bible/xrefs/52.json'),
  () => import('../data/bible/xrefs/53.json'),
  () => import('../data/bible/xrefs/54.json'),
  () => import('../data/bible/xrefs/55.json'),
  () => import('../data/bible/xrefs/56.json'),
  () => import('../data/bible/xrefs/57.json'),
  () => import('../data/bible/xrefs/58.json'),
  () => import('../data/bible/xrefs/59.json'),
  () => import('../data/bible/xrefs/60.json'),
  () => import('../data/bible/xrefs/61.json'),
  () => import('../data/bible/xrefs/62.json'),
  () => import('../data/bible/xrefs/63.json'),
  () => import('../data/bible/xrefs/64.json'),
  () => import('../data/bible/xrefs/65.json'),
];

const NONE: never[] = [];
const kjvBooks: (BookText | undefined)[] = [];
const refBooks: (BookRefs | undefined)[] = [];

/** King James Version, un libro por posición (mismo orden que BOOKS). Devuelve [] si el libro todavía no se pidió. */
export const KJV: (() => BookText)[] = KJV_FILES.map((_, i) => () => kjvBooks[i] ?? NONE);
/** Referencias cruzadas, un libro por posición. La numeración es la de la King James. [] si todavía no se pidió. */
export const XREFS: (() => BookRefs)[] = XREF_FILES.map((_, i) => () => refBooks[i] ?? NONE);

/** Trae un libro de la King James (si ya está, no hace nada). */
export async function loadKjvBook(book: number): Promise<void> {
  if (kjvBooks[book] || !KJV_FILES[book]) return;
  kjvBooks[book] = pick(await KJV_FILES[book]());
}
/** Trae las referencias cruzadas de un libro (si ya están, no hace nada). */
export async function loadRefsBook(book: number): Promise<void> {
  if (refBooks[book] || !XREF_FILES[book]) return;
  refBooks[book] = pick(await XREF_FILES[book]());
}

/** Los nombres de los libros en inglés, para la King James y para buscar "John 3:16". Mismo orden que BOOKS. */
export const EN_BOOKS: string[] = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
  '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah',
  'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
  'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians',
  'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
  'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];
