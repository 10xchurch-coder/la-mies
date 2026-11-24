// Ayudas para estudiar la Biblia: buscar palabras o frases, ir a una cita ("Juan 3:16"), la concordancia
// (todos los versículos que tienen una palabra) y las referencias cruzadas (versículos que hablan de lo mismo).
// Sin nada de la app ni de la base, para poder probarse sola.
import { BOOKS } from './biblePlan';
import { bookNameIn, chapterText, chaptersIn, type BibleVersion } from './bible';
import { EN_BOOKS, XREFS } from './bibleStudyData';

// ---------- Comparar texto sin tildes ----------

/**
 * El texto listo para comparar: en minúsculas, sin tildes ni signos, con un solo espacio entre palabras.
 * "¡OH Jehová, cuánto...!" -> "oh jehova cuanto". La ñ queda como n, así "senor" encuentra "Señor".
 */
export function fold(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// ---------- Ir a una cita ----------

export type Place = { book: number; chapter: number; verse?: number; end?: number };

/** Sin espacios: "1 co" -> "1co". */
const compact = (s: string) => fold(s).replace(/ /g, '');

/** Abreviaturas comunes que no salen solas del principio del nombre, o que se pisan entre dos libros. */
const ABBR: Record<string, string> = {
  gn: 'Génesis', ex: 'Éxodo', lv: 'Levítico', nm: 'Números', dt: 'Deuteronomio', jos: 'Josué', jue: 'Jueces', rt: 'Rut',
  '1s': '1 Samuel', '2s': '2 Samuel', '1sm': '1 Samuel', '2sm': '2 Samuel', '1r': '1 Reyes', '2r': '2 Reyes', '1re': '1 Reyes', '2re': '2 Reyes',
  '1cr': '1 Crónicas', '2cr': '2 Crónicas', esd: 'Esdras', neh: 'Nehemías', est: 'Ester', sal: 'Salmos', sl: 'Salmos', salmo: 'Salmos',
  pr: 'Proverbios', prov: 'Proverbios', ec: 'Eclesiastés', ecl: 'Eclesiastés', cnt: 'Cantares', cant: 'Cantares', cantardeloscantares: 'Cantares',
  is: 'Isaías', jer: 'Jeremías', jr: 'Jeremías', lm: 'Lamentaciones', lam: 'Lamentaciones', ez: 'Ezequiel', dn: 'Daniel', os: 'Oseas', jl: 'Joel',
  am: 'Amós', abd: 'Abdías', jon: 'Jonás', mi: 'Miqueas', miq: 'Miqueas', nah: 'Nahum', hab: 'Habacuc', sof: 'Sofonías', hag: 'Hageo',
  zac: 'Zacarías', mal: 'Malaquías', mt: 'Mateo', mr: 'Marcos', mc: 'Marcos', lc: 'Lucas', jn: 'Juan', hch: 'Hechos', hech: 'Hechos',
  ro: 'Romanos', rom: 'Romanos', '1co': '1 Corintios', '2co': '2 Corintios', ga: 'Gálatas', gl: 'Gálatas', ef: 'Efesios', fil: 'Filipenses',
  flp: 'Filipenses', col: 'Colosenses', '1ts': '1 Tesalonicenses', '2ts': '2 Tesalonicenses', '1tes': '1 Tesalonicenses', '2tes': '2 Tesalonicenses',
  '1ti': '1 Timoteo', '2ti': '2 Timoteo', '1tm': '1 Timoteo', '2tm': '2 Timoteo', tit: 'Tito', flm: 'Filemón', he: 'Hebreos', heb: 'Hebreos',
  stg: 'Santiago', sant: 'Santiago', '1p': '1 Pedro', '2p': '2 Pedro', '1pe': '1 Pedro', '2pe': '2 Pedro', '1jn': '1 Juan', '2jn': '2 Juan',
  '3jn': '3 Juan', jud: 'Judas', ap: 'Apocalipsis', apoc: 'Apocalipsis',
  // En inglés
  ps: 'Salmos', psa: 'Salmos', psalm: 'Salmos', song: 'Cantares', songofsongs: 'Cantares', phil: 'Filipenses', php: 'Filipenses', phm: 'Filemón',
  jas: 'Santiago', jhn: 'Juan', mk: 'Marcos', lk: 'Lucas', '1kgs': '1 Reyes', '2kgs': '2 Reyes', '1ki': '1 Reyes', '2ki': '2 Reyes',
  '1sa': '1 Samuel', '2sa': '2 Samuel', '1ch': '1 Crónicas', '2ch': '2 Crónicas', rev: 'Apocalipsis', revelations: 'Apocalipsis',
};

let bookKeys: Map<string, number> | null = null;
/** Todas las formas de escribir un libro: nombre entero (español o inglés), abreviaturas y principios del nombre que no se confunden. */
function keys(): Map<string, number> {
  if (bookKeys) return bookKeys;
  const m = new Map<string, number>();
  const es = BOOKS.map((b) => compact(b[0]));
  const en = EN_BOOKS.map(compact);
  es.forEach((k, i) => m.set(k, i));
  en.forEach((k, i) => { if (!m.has(k)) m.set(k, i); });
  for (const [k, name] of Object.entries(ABBR)) {
    const i = BOOKS.findIndex((b) => b[0] === name);
    if (i >= 0 && !m.has(k)) m.set(k, i);
  }
  // Los principios del nombre ("gen", "apocal"), solo si no pueden ser dos libros. Primero los nombres en español.
  for (const names of [es, en]) {
    const seen = new Map<string, number>();
    names.forEach((k, i) => {
      const min = /^\d/.test(k) ? 3 : 2;
      for (let n = min; n < k.length; n++) {
        const p = k.slice(0, n);
        seen.set(p, seen.has(p) && seen.get(p) !== i ? -1 : i);
      }
    });
    for (const [p, i] of seen) if (i >= 0 && !m.has(p)) m.set(p, i);
  }
  return (bookKeys = m);
}

/** El libro por su nombre o abreviatura, en español o inglés ("Juan", "jn", "1 Co", "John", "apoc"). -1 si no se entiende. */
export function findBookLoose(name: string): number {
  return keys().get(compact(name)) ?? -1;
}

/**
 * Entiende una cita escrita a mano: "Juan 3:16", "jn 3 16", "1 Co 13:4-7", "Salmo 23", "Judas 5", "John 3.16".
 * Devuelve null si no es una cita o si el capítulo o el versículo no existen en ese libro.
 * (El versículo se revisa contra la versión que se pasa; sin versión, solo que sea 1 o más.)
 */
export function parseRef(text: string, version?: BibleVersion): Place | null {
  const t = (text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const m = t.match(/^(\d?\s?[a-z][a-z. ]*?)\.?(?:\s*(\d+)(?:\s*[:.,\s]\s*(\d+))?(?:\s*-\s*(\d+))?)?$/);
  if (!m) return null;
  const book = findBookLoose(m[1]);
  if (book < 0) return null;
  const a = m[2] != null ? Number(m[2]) : undefined;
  const b = m[3] != null ? Number(m[3]) : undefined;
  const c = m[4] != null ? Number(m[4]) : undefined;
  let chapter = 1;
  let verse: number | undefined;
  let end: number | undefined;
  if (chaptersIn(book) === 1 && b == null) {
    // Libros de un solo capítulo: "Judas 5" es el versículo 5, y "Judas 5-7" los versículos 5 al 7.
    verse = a;
    end = c;
  } else {
    // "Juan 3", "Juan 3:16", "Juan 3:16-18". En "Juan 3-5" (varios capítulos) se abre el primero.
    if (a != null) chapter = a;
    verse = b;
    end = b != null ? c : undefined;
  }
  if (chapter < 1 || chapter > chaptersIn(book)) return null;
  if (verse != null) {
    if (verse < 1) return null;
    if (version) {
      const n = chapterText(version, book, chapter).length;
      if (verse > n) return null;
      if (end != null) end = Math.min(end, n);
    }
    if (end != null && end <= verse) end = undefined;
  }
  const out: Place = { book, chapter };
  if (verse != null) out.verse = verse;
  if (end != null) out.end = end;
  return out;
}

// ---------- Buscar ----------

export type Query = {
  /** Las palabras ya sin tildes ni mayúsculas. */
  words: string[];
  /** true: tienen que estar juntas y en ese orden. false: todas, en cualquier lugar del versículo. */
  phrase: boolean;
};
export type Hit = { chapter: number; verse: number };
export type BookHits = { book: number; hits: Hit[]; /** Cuántas veces aparece (en la concordancia); en la búsqueda, cuántos versículos. */ count: number };
export type SearchResult = { total: number; verses: number; books: BookHits[] };

/**
 * Arma la búsqueda. Entre comillas ("de tal manera") o con phrase=true busca la frase exacta;
 * si no, los versículos que tienen todas las palabras. null si no hay nada que buscar.
 */
export function makeQuery(text: string, phrase = false): Query | null {
  const raw = (text ?? '').trim();
  const quoted = /^["“”«'].*["“”»']$/.test(raw) && raw.length > 2;
  const words = fold(raw).split(' ').filter(Boolean);
  if (!words.length) return null;
  return { words: phrase || quoted ? words : [...new Set(words)], phrase: (phrase || quoted) && words.length > 1 };
}

// El texto de cada libro ya listo para comparar (" palabra palabra "), para no rehacerlo en cada búsqueda.
const folded = new Map<string, string[][]>();
function foldedBook(version: BibleVersion, book: number): string[][] {
  const key = `${version.id}:${book}`;
  let hit = folded.get(key);
  if (!hit) {
    hit = version.books[book]().map((ch) => ch.map((t) => ` ${fold(t)} `));
    folded.set(key, hit);
  }
  return hit;
}
/** Suelta lo que quedó preparado para buscar (libera memoria). */
export function dropSearchCache(): void { folded.clear(); }

/** Cuántas veces está la palabra (o frase) entera en un texto ya preparado. */
function times(text: string, needle: string): number {
  let n = 0;
  let at = text.indexOf(needle);
  while (at >= 0) { n++; at = text.indexOf(needle, at + needle.length - 1); }
  return n;
}

/** Busca en un solo libro. Así la pantalla puede ir libro por libro sin trabarse. */
export function searchBook(version: BibleVersion, book: number, q: Query): BookHits {
  const hits: Hit[] = [];
  let count = 0;
  if (book < 0 || book >= BOOKS.length || !q.words.length) return { book, hits, count };
  const needles = q.phrase ? [` ${q.words.join(' ')} `] : q.words.map((w) => ` ${w} `);
  const chapters = foldedBook(version, book);
  for (let c = 0; c < chapters.length; c++) {
    const ch = chapters[c];
    for (let v = 0; v < ch.length; v++) {
      const t = ch[v];
      let ok = true;
      for (const n of needles) if (t.indexOf(n) < 0) { ok = false; break; }
      if (!ok) continue;
      hits.push({ chapter: c + 1, verse: v + 1 });
      count += needles.length === 1 ? times(t, needles[0]) : 1;
    }
  }
  return { book, hits, count };
}

/** Busca en toda la Biblia (o en los libros que se pidan). Los libros sin nada no aparecen. */
export function searchBible(version: BibleVersion, q: Query, books?: number[]): SearchResult {
  const out: SearchResult = { total: 0, verses: 0, books: [] };
  for (const b of books ?? BOOKS.map((_, i) => i)) {
    const r = searchBook(version, b, q);
    if (!r.hits.length) continue;
    out.books.push(r);
    out.total += r.count;
    out.verses += r.hits.length;
  }
  return out;
}

/** Concordancia: todos los versículos que tienen esa palabra, con cuántas veces aparece en cada libro. */
export function concordance(version: BibleVersion, word: string): SearchResult {
  const w = fold(word).split(' ')[0];
  if (!w) return { total: 0, verses: 0, books: [] };
  return searchBible(version, { words: [w], phrase: false });
}

export type Piece = { text: string; /** La palabra sin tildes, o '' si es un espacio o un signo. */ word: string; hit: boolean };

// Letras del español y del inglés (con tildes, ñ, ü, æ) y números. Sin \\p{L}, que no anda en todos los teléfonos.
const WORD = /([A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]+)/;
const WORD_ONLY = /^[A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]+$/;

/** Parte un versículo en palabras y signos, y marca las que se buscaron (para resaltarlas y para poder tocarlas). */
export function pieces(text: string, q?: Query | null): Piece[] {
  const want = new Set(q?.words ?? []);
  const out: Piece[] = [];
  for (const part of text.split(WORD)) {
    if (!part) continue;
    const word = WORD_ONLY.test(part) ? fold(part) : '';
    out.push({ text: part, word, hit: !!word && want.has(word) });
  }
  if (q?.phrase && q.words.length > 1) {
    // En una frase solo se resaltan las palabras que están juntas y en orden.
    const idx = out.map((p, i) => (p.word ? i : -1)).filter((i) => i >= 0);
    for (const i of idx) out[i].hit = false;
    for (let k = 0; k + q.words.length <= idx.length; k++) {
      if (q.words.every((w, j) => out[idx[k + j]].word === w)) for (let j = 0; j < q.words.length; j++) out[idx[k + j]].hit = true;
    }
  }
  return out;
}

// ---------- Referencias cruzadas ----------

/** Un versículo o un tramo dentro de un capítulo: del versículo `verse` al `end` (iguales si es uno solo). */
export type Ref = { book: number; chapter: number; verse: number; end: number };

/** Cómo viene guardada una referencia: libro*10^8 + capítulo*10^5 + versículo*100 + versículos de más. */
export function decodeRef(n: number): Ref {
  const extra = n % 100;
  const verse = Math.floor(n / 100) % 1000;
  const chapter = Math.floor(n / 100000) % 1000;
  const book = Math.floor(n / 100000000);
  return { book, chapter, verse, end: verse + extra };
}

/** Los versículos relacionados con uno, el más votado primero. [] si no hay o si el lugar no existe. */
export function crossRefs(book: number, chapter: number, verse: number): Ref[] {
  if (!Number.isInteger(book) || book < 0 || book >= XREFS.length || chapter < 1 || verse < 1) return [];
  const list = XREFS[book]()[chapter - 1]?.[verse - 1] ?? [];
  return list.map(decodeRef).filter((r) => r.book >= 0 && r.book < BOOKS.length && r.chapter >= 1 && r.chapter <= chaptersIn(r.book) && r.verse >= 1);
}

/** "Juan 3:16", "Juan 3:16–18", "Judas 5" (los libros de un capítulo van sin el capítulo). */
export function refLabel(version: BibleVersion, r: Ref): string {
  const span = r.end > r.verse ? `${r.verse}–${r.end}` : `${r.verse}`;
  return chaptersIn(r.book) === 1 ? `${bookNameIn(version, r.book)} ${span}` : `${bookNameIn(version, r.book)} ${r.chapter}:${span}`;
}

/**
 * El texto de una referencia en esa versión. Si el tramo pasa del final del capítulo, se corta ahí;
 * si el versículo no existe en esa versión (otra numeración), devuelve ''. Nunca falla.
 */
export function refText(version: BibleVersion, r: Ref): string {
  const text = chapterText(version, r.book, r.chapter);
  if (r.verse < 1 || r.verse > text.length) return '';
  const end = Math.max(r.verse, Math.min(r.end, text.length));
  return end === r.verse ? text[r.verse - 1] : text.slice(r.verse - 1, end).map((t, i) => `${r.verse + i} ${t}`).join(' ');
}

// ---------- Numeración distinta entre versiones ----------

/**
 * Capítulos donde la RV1909 de la app y la King James no numeran igual los versículos (libro, capítulo).
 * En los primeros 12 cambia la cantidad de versículos; en los últimos 7 el capítulo empieza un versículo corrido.
 * Ahí un resaltado, una nota o una referencia puede caer un versículo antes o después al cambiar de versión.
 */
export const NUMBERING_DIFFS: [number, number][] = [
  [3, 12], [3, 29], [8, 23], [9, 20], [13, 33], [17, 35], [17, 38], [17, 40], [27, 11], [31, 1], [43, 19], [46, 13],
  [3, 13], [3, 30], [8, 24], [17, 39], [17, 41], [27, 12], [31, 2],
];
const DIFF_KEYS = new Set(NUMBERING_DIFFS.map(([b, c]) => `${b}:${c}`));
/** ¿En este capítulo los números de versículo cambian entre la RV1909 y la King James? */
export function numberingDiffers(book: number, chapter: number): boolean {
  return DIFF_KEYS.has(`${book}:${chapter}`);
}

// ---------- Buscar sin trabar la pantalla ----------

/**
 * Igual que searchBible, pero de a pocos libros y dejando respirar a la pantalla entre tanda y tanda.
 * `alive` deja cortar una búsqueda vieja cuando la persona ya pidió otra: si devuelve false, se devuelve null.
 */
export async function searchBibleAsync(version: BibleVersion, q: Query, alive: () => boolean = () => true, onProgress?: (done: number) => void, batch = 6): Promise<SearchResult | null> {
  const out: SearchResult = { total: 0, verses: 0, books: [] };
  for (let b = 0; b < BOOKS.length; b++) {
    if (b % batch === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
      if (!alive()) return null;
      onProgress?.(b);
    }
    const r = searchBook(version, b, q);
    if (!r.hits.length) continue;
    out.books.push(r);
    out.total += r.count;
    out.verses += r.hits.length;
  }
  return alive() ? out : null;
}
