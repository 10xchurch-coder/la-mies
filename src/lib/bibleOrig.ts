// Palabras originales: las palabras en hebreo (Antiguo Testamento) y griego (Nuevo Testamento) de cada versículo,
// con su número de Strong, la forma de diccionario, cómo se pronuncia y una glosa corta en inglés.
// Datos de STEPBible-Data (CC BY 4.0). La numeración de versículos es la de la King James.
// Todo se pide de a poco (ver ensureOrig): hasta entonces las funciones devuelven vacío y nada falla.
// Sin nada de la app ni de la base, para poder probarse sola.
import { BOOKS } from './biblePlan';
import { OT_COUNT } from './bible';
import { ORIG_DEF_CHUNKS, fetchOrigBook, fetchOrigDefs, fetchOrigLex, type OrigBookRaw, type OrigDefsRaw, type OrigLexRaw } from './bibleOrigData';

export type OrigLang = 'H' | 'G';
/** El idioma original de un libro: hebreo (con algo de arameo) hasta Malaquías, griego desde Mateo. */
export const origLang = (book: number): OrigLang => (book < OT_COUNT ? 'H' : 'G');

// ---------- Números guardados como letras ----------

/**
 * Los datos guardan listas de números como texto, en base 45: cada letra vale 0 a 89. Las que valen 45 o más son
 * "sigue" (se les resta 45); la que vale menos de 45 cierra el número. Así los números chicos ocupan una sola letra.
 * Las letras van del código 35 al 126, salteando la barra invertida (92). Lo que no se entiende se saltea.
 */
export function decodeNums(s: string): number[] {
  const out: number[] = [];
  let n = 0;
  for (let i = 0; i < (s ?? '').length; i++) {
    const c = s.charCodeAt(i);
    if (c < 35 || c > 126 || c === 92) continue;
    const d = c - 35 - (c > 92 ? 1 : 0);
    if (d >= 90) continue;
    if (d >= 45) n = n * 45 + (d - 45);
    else { out.push(n * 45 + d); n = 0; }
  }
  return out;
}
/** Lo contrario de decodeNums, para un solo número (lo usan las pruebas; los datos los arma scripts/bible-import-strongs.py). */
export function encodeNum(n: number): string {
  const ch = (d: number) => String.fromCharCode(d + 35 + (d + 35 >= 92 ? 1 : 0));
  let out = ch(n % 45);
  n = Math.floor(n / 45);
  while (n > 0) { out = ch(45 + (n % 45)) + out; n = Math.floor(n / 45); }
  return out;
}

// ---------- Números de Strong ----------

/** El número sin la letra que agrega STEPBible para separar sentidos: "H7225G" -> "H7225". */
export function strongBase(strong: string): string {
  return (strong ?? '').replace(/[A-Za-z]$/, '');
}
/** Como se escribe siempre un número de Strong: "H0430G" -> "H430", "G0026" -> "G26". '' si no es un número de Strong. */
export function strongLabel(strong: string): string {
  const m = (strong ?? '').match(/^([HG])0*(\d+)[A-Za-z]?$/);
  return m ? `${m[1]}${m[2]}` : '';
}
/** Entiende "H430", "h0430", "G26", "H7225G" y devuelve el número parejo ("H0430", "G0026"). null si no es un número de Strong. */
export function parseStrong(text: string): string | null {
  const m = (text ?? '').trim().match(/^([HhGg])\s*0*(\d{1,5})[A-Za-z]?$/);
  if (!m || Number(m[2]) < 1) return null;
  return `${m[1].toUpperCase()}${m[2].padStart(4, '0')}`;
}

// ---------- Datos cargados ----------

type Lex = {
  strong: string[]; lemma: string[]; translit: string[]; gloss: string[]; books: number[][];
  /** Dónde está cada número (con su letra). */
  at: Map<string, number>;
  /** Los lemas de cada número sin letra. */
  byBase: Map<string, number[]>;
};
type Book = { forms: string[]; lemmaOf: number[]; chapters: string[][] };

const lexes: Partial<Record<OrigLang, Lex>> = {};
const books: (Book | undefined)[] = [];
const defs: (OrigDefsRaw | undefined)[] = [];

/** Arma la tabla de lemas a partir del archivo. Se exporta para probarla sola. */
export function buildLex(raw: OrigLexRaw): Lex {
  const strong = raw.s.split('\t');
  const lemma = raw.w.split('\t');
  const translit = raw.t.split('\t');
  const gloss = raw.g.split('\t');
  const bk = raw.b.split('\t').map((s) => decodeNums(s));
  const at = new Map<string, number>();
  const byBase = new Map<string, number[]>();
  strong.forEach((s, i) => {
    at.set(s, i);
    const b = strongBase(s);
    const list = byBase.get(b);
    if (list) list.push(i); else byBase.set(b, [i]);
  });
  return { strong, lemma, translit, gloss, books: bk, at, byBase };
}
/** Arma un libro a partir del archivo. Se exporta para probarlo solo. */
export function buildBook(raw: OrigBookRaw): Book {
  return { forms: raw.w ? raw.w.split(' ') : [], lemmaOf: decodeNums(raw.l), chapters: raw.c };
}

const validBook = (book: number) => Number.isInteger(book) && book >= 0 && book < BOOKS.length;

async function loadLex(lang: OrigLang): Promise<void> {
  if (!lexes[lang]) lexes[lang] = buildLex(await fetchOrigLex(lang));
}
/** Deja listas las palabras originales de un libro (y la tabla de lemas de su idioma). Nunca falla: si no se pudo, queda vacío. */
export async function ensureOrig(book: number): Promise<void> {
  if (!validBook(book)) return;
  try {
    await Promise.all([
      loadLex(origLang(book)),
      books[book] ? undefined : fetchOrigBook(book).then((raw) => { books[book] = buildBook(raw); }),
    ]);
  } catch { /* sin conexión en la web: se reintenta la próxima vez que se pida */ }
}
/** ¿Ya están cargadas las palabras de este libro? */
export function origReady(book: number): boolean {
  return validBook(book) && !!books[book] && !!lexes[origLang(book)];
}

// ---------- Las palabras de un versículo ----------

export type OrigWord = {
  /** La palabra como está escrita en el versículo. */
  word: string;
  /** El número con la letra de STEPBible ("H7225G"); sirve para buscar la definición. */
  strong: string;
  /** El número de Strong como se escribe siempre ("H7225"). */
  label: string;
  /** La forma de diccionario. */
  lemma: string;
  /** Cómo se pronuncia la forma de diccionario. */
  translit: string;
  /** Qué quiere decir, corto y en inglés. */
  gloss: string;
};

/** Las palabras originales de un versículo, en orden. [] si el lugar no existe o si falta ensureOrig(libro). */
export function verseWords(book: number, chapter: number, verse: number): OrigWord[] {
  if (!validBook(book) || !Number.isInteger(chapter) || !Number.isInteger(verse) || chapter < 1 || verse < 1) return [];
  const b = books[book];
  const lex = lexes[origLang(book)];
  if (!b || !lex) return [];
  const packed = b.chapters[chapter - 1]?.[verse - 1];
  if (!packed) return [];
  const out: OrigWord[] = [];
  for (const f of decodeNums(packed)) {
    const li = b.lemmaOf[f];
    if (b.forms[f] == null || li == null || lex.strong[li] == null) continue;
    out.push({ word: b.forms[f], strong: lex.strong[li], label: strongLabel(lex.strong[li]), lemma: lex.lemma[li] ?? '', translit: lex.translit[li] ?? '', gloss: lex.gloss[li] ?? '' });
  }
  return out;
}

// ---------- Un número de Strong ----------

export type StrongSense = { strong: string; lemma: string; translit: string; gloss: string };

const langOfStrong = (strong: string): OrigLang | null => (/^H/i.test(strong) ? 'H' : /^G/i.test(strong) ? 'G' : null);

/** Deja lista la tabla de lemas del idioma de ese número. Nunca falla. */
export async function ensureStrong(strong: string): Promise<void> {
  const lang = langOfStrong(strong);
  if (!lang) return;
  try { await loadLex(lang); } catch { /* sin conexión */ }
}

/** Los sentidos que STEPBible separa dentro de un mismo número (casi siempre uno solo). [] si no existe o falta cargar. */
export function strongSenses(strong: string): StrongSense[] {
  const lang = langOfStrong(strong);
  const lex = lang ? lexes[lang] : undefined;
  if (!lex) return [];
  return (lex.byBase.get(strongBase(strong)) ?? []).map((i) => ({ strong: lex.strong[i], lemma: lex.lemma[i] ?? '', translit: lex.translit[i] ?? '', gloss: lex.gloss[i] ?? '' }));
}
/** Los datos de un número: el sentido exacto si viene con letra y existe; si no, el primero de ese número. null si no hay. */
export function strongInfo(strong: string): StrongSense | null {
  const all = strongSenses(strong);
  return all.find((s) => s.strong === strong) ?? all[0] ?? null;
}
/** Los libros donde aparece ese número (sin mirar la letra), en orden. [] si no existe o falta cargar. */
export function strongBooks(strong: string): number[] {
  const lang = langOfStrong(strong);
  const lex = lang ? lexes[lang] : undefined;
  if (!lex) return [];
  const set = new Set<number>();
  for (const i of lex.byBase.get(strongBase(strong)) ?? []) for (const b of lex.books[i] ?? []) if (validBook(b)) set.add(b);
  return [...set].sort((a, b) => a - b);
}

export type StrongHit = { chapter: number; verse: number };
export type StrongBookHits = { book: number; hits: StrongHit[]; /** Cuántas veces aparece la palabra en el libro. */ count: number };
export type StrongResult = { /** Veces que aparece. */ total: number; /** Versículos distintos. */ verses: number; books: StrongBookHits[] };

/** Los versículos de un libro que tienen ese número de Strong (sin mirar la letra). El libro tiene que estar cargado. */
export function strongInBook(book: number, strong: string): StrongBookHits {
  const out: StrongBookHits = { book, hits: [], count: 0 };
  if (!validBook(book)) return out;
  const b = books[book];
  const lex = lexes[origLang(book)];
  if (!b || !lex || langOfStrong(strong) !== origLang(book)) return out;
  const lemmas = new Set(lex.byBase.get(strongBase(strong)) ?? []);
  if (!lemmas.size) return out;
  const want = new Set<number>();
  b.lemmaOf.forEach((li, f) => { if (lemmas.has(li)) want.add(f); });
  if (!want.size) return out;
  for (let c = 0; c < b.chapters.length; c++) {
    const ch = b.chapters[c];
    for (let v = 0; v < ch.length; v++) {
      let n = 0;
      for (const f of decodeNums(ch[v])) if (want.has(f)) n++;
      if (n) { out.hits.push({ chapter: c + 1, verse: v + 1 }); out.count += n; }
    }
  }
  return out;
}

/**
 * Todos los versículos de la Biblia que tienen ese número de Strong. Solo abre los libros donde aparece
 * (la tabla de lemas lo dice), de a uno y dejando respirar a la pantalla. `alive` deja cortar un pedido viejo: devuelve null.
 */
export async function strongVerses(strong: string, alive: () => boolean = () => true, onProgress?: (done: number, of: number) => void): Promise<StrongResult | null> {
  const out: StrongResult = { total: 0, verses: 0, books: [] };
  await ensureStrong(strong);
  const list = strongBooks(strong);
  for (let i = 0; i < list.length; i++) {
    if (i % 4 === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
      if (!alive()) return null;
      onProgress?.(i, list.length);
    }
    await ensureOrig(list[i]);
    const r = strongInBook(list[i], strong);
    if (!r.hits.length) continue;
    out.books.push(r);
    out.total += r.count;
    out.verses += r.hits.length;
  }
  return alive() ? out : null;
}

// ---------- Definiciones (solo griego) ----------

/** ¿Hay definición larga para este idioma? Del hebreo no: la de la fuente pide un permiso aparte y no se incluye. */
export const hasDefinitions = (strong: string): boolean => langOfStrong(strong) === 'G';

/** En qué archivo de definiciones está un número griego. */
export function defChunk(strong: string): number {
  const n = parseInt((strong ?? '').slice(1), 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n / 500), ORIG_DEF_CHUNKS - 1) : 0;
}
/** Deja lista la definición de un número griego (se bajan de a 500 números). Nunca falla. */
export async function ensureDefinition(strong: string): Promise<void> {
  if (!hasDefinitions(strong)) return;
  const k = defChunk(strong);
  if (defs[k]) return;
  try { defs[k] = await fetchOrigDefs(k); } catch { /* sin conexión */ }
}
/** La definición del léxico (en inglés). '' si no hay, si es hebreo o si falta ensureDefinition. */
export function definition(strong: string): string {
  if (!hasDefinitions(strong)) return '';
  const d = defs[defChunk(strong)];
  if (!d) return '';
  if (d[strong]) return d[strong];
  // Si vino sin letra (o con otra), sirve cualquier sentido de ese número.
  for (const s of strongSenses(strong)) if (d[s.strong]) return d[s.strong];
  return '';
}
