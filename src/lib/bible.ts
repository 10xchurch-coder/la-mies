// La Biblia dentro de la app: versiones disponibles, libros, referencias y cómo se arma el texto para compartir.
// Sin nada de la app ni de la base, para poder probarse sola.
import { BOOKS } from './biblePlan';
import { RV1909, type BookText } from './bibleData';

export type BibleVersionId = 'rv1909';

export type BibleVersion = {
  id: BibleVersionId;
  /** Nombre completo, para el encabezado. */
  name: string;
  /** Sigla que va al final de lo que se comparte: "Juan 3:16 (RV1909)". */
  short: string;
  /** Aviso de derechos que se muestra al pie del capítulo. */
  notice: string;
  books: (() => BookText)[];
};

/** Las versiones que ya están en la app. Las demás se suman acá cuando haya permiso y texto. */
export const VERSIONS: BibleVersion[] = [
  { id: 'rv1909', name: 'Reina-Valera 1909', short: 'RV1909', notice: 'Reina-Valera 1909 · Dominio público', books: RV1909 },
];

export const DEFAULT_VERSION: BibleVersionId = 'rv1909';

export function versionOf(id: string | undefined): BibleVersion {
  return VERSIONS.find((v) => v.id === id) ?? VERSIONS[0];
}

export const OT_COUNT = 39;
export const bookName = (i: number): string => BOOKS[i]?.[0] ?? '';
export const chaptersIn = (i: number): number => BOOKS[i]?.[1] ?? 0;

/** Sin tildes, mayúsculas ni espacios de más, para comparar nombres. */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const BY_NAME = new Map(BOOKS.map((b, i) => [plain(b[0]), i]));
// En los planes con un salmo por día, la lectura dice "Salmo 5" (en singular).
BY_NAME.set('salmo', BOOKS.findIndex((b) => b[0] === 'Salmos'));

/** Posición del libro por su nombre ("Juan", "1 Corintios", "genesis"), o -1. */
export function findBook(name: string): number {
  return BY_NAME.get(plain(name)) ?? -1;
}

/** Los capítulos de un libro. Devuelve [] si el libro o el capítulo no existen. */
export function chapterText(version: BibleVersion, book: number, chapter: number): string[] {
  if (book < 0 || book >= BOOKS.length || chapter < 1 || chapter > chaptersIn(book)) return [];
  return version.books[book]()[chapter - 1] ?? [];
}

/**
 * Dónde abrir la Biblia para una lectura del plan: "Génesis 1–4" -> Génesis 1; "Judas" -> Judas 1;
 * "Génesis 50; Éxodo 1–2" -> Génesis 50; "Hechos 3 · Salmo 5 · Proverbios 3" -> Hechos 3. null si no se entiende.
 */
export function parseReading(text: string): { book: number; chapter: number } | null {
  const first = (text ?? '').split(/[;·]/)[0].trim();
  if (!first) return null;
  const whole = findBook(first);
  if (whole >= 0) return { book: whole, chapter: 1 };
  const m = first.match(/^(.+?)\s+(\d+)(?:\s*[–-]\s*\d+)?$/);
  if (!m) return null;
  const book = findBook(m[1]);
  const chapter = Number(m[2]);
  if (book < 0 || chapter < 1 || chapter > chaptersIn(book)) return null;
  return { book, chapter };
}

/** Los versículos tocados, ordenados, como "16", "16–18" o "1, 3–5". */
export function verseSpan(verses: number[]): string {
  const v = [...new Set(verses)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < v.length) {
    let j = i;
    while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
    parts.push(i === j ? `${v[i]}` : j === i + 1 ? `${v[i]}, ${v[j]}` : `${v[i]}–${v[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

/** El texto para copiar o mandar por WhatsApp: los versículos completos, y abajo la cita. */
export function shareVerses(version: BibleVersion, book: number, chapter: number, verses: number[]): string {
  const text = chapterText(version, book, chapter);
  const v = [...new Set(verses)].filter((n) => n >= 1 && n <= text.length).sort((a, b) => a - b);
  if (!v.length) return '';
  const body = v.length === 1 ? text[v[0] - 1] : v.map((n) => `${n} ${text[n - 1]}`).join(' ');
  const single = BOOKS[book][1] === 1;
  const ref = single ? `${bookName(book)} ${verseSpan(v)}` : `${bookName(book)} ${chapter}:${verseSpan(v)}`;
  return `“${body}”\n— ${ref} (${version.short})`;
}

/** El capítulo anterior (-1) o siguiente (+1), pasando de un libro al otro. null al principio o al final de la Biblia. */
export function neighbor(book: number, chapter: number, dir: 1 | -1): { book: number; chapter: number } | null {
  if (dir === 1) {
    if (chapter < chaptersIn(book)) return { book, chapter: chapter + 1 };
    return book + 1 < BOOKS.length ? { book: book + 1, chapter: 1 } : null;
  }
  if (chapter > 1) return { book, chapter: chapter - 1 };
  return book > 0 ? { book: book - 1, chapter: chaptersIn(book - 1) } : null;
}

/** Los números que llegan por la dirección de la pantalla, ya revisados. */
export function cleanPlace(libro: unknown, cap: unknown): { book: number; chapter: number } | null {
  const book = Number(libro);
  const chapter = Number(cap ?? 1);
  if (!Number.isInteger(book) || book < 0 || book >= BOOKS.length) return null;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > chaptersIn(book)) return null;
  return { book, chapter };
}
