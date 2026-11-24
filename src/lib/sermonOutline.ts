// Bosquejo de la prédica: del texto pegado (título, puntos y citas) salen las partes para armar diapositivas.
// Solo lógica: sin pantalla ni base, para poder probarse sola.
import { bookName, chaptersIn } from './bible';
import { EN_BOOKS } from './bibleStudyData';
import { BOOKS } from './biblePlan';

/** Una cita ya entendida. `to` null = hasta el final del capítulo. */
export type OutlineRef = { book: number; chapter: number; from: number; to: number | null };

export type OutlinePart =
  /** Un punto (o sub-punto) del bosquejo. `parent` es el punto de arriba cuando la línea es un sub-punto. */
  | { kind: 'point'; text: string; parent: string | null; refs: OutlineRef[] }
  /** Una línea que es solo citas. */
  | { kind: 'refs'; refs: OutlineRef[] };

export type Outline = { title: string; parts: OutlinePart[] };

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

// Abreviaturas comunes (las de la Reina-Valera y otras que se usan al escribir rápido), en el orden de los libros.
const ABBR: string[][] = [
  ['gn', 'gen'], ['ex', 'exo'], ['lv', 'lev'], ['nm', 'num'], ['dt', 'deut'], ['jos'], ['jue', 'jc'], ['rt'],
  ['1 s', '1 sam', '1 sm'], ['2 s', '2 sam', '2 sm'], ['1 r', '1 re', '1 rey'], ['2 r', '2 re', '2 rey'], ['1 cr', '1 cro'], ['2 cr', '2 cro'], ['esd'], ['neh'],
  ['est'], ['jb'], ['sal', 'salmo', 'sl'], ['pr', 'prov', 'pro'], ['ec', 'ecl'], ['cnt', 'cant', 'cantar de los cantares'], ['is', 'isa'], ['jer', 'jr'],
  ['lm', 'lam'], ['ez', 'eze'], ['dn', 'dan'], ['os'], ['jl'], ['am'], ['abd'], ['jon'], ['mi', 'miq'],
  ['nah'], ['hab'], ['sof'], ['hag'], ['zac'], ['mal'],
  ['mt', 'mat'], ['mr', 'mc', 'mar'], ['lc', 'luc'], ['jn'], ['hch', 'hech', 'hechos de los apostoles'], ['ro', 'rom', 'rm'], ['1 co', '1 cor'], ['2 co', '2 cor'],
  ['ga', 'gal'], ['ef', 'efe'], ['fil', 'flp'], ['col'], ['1 ts', '1 tes'], ['2 ts', '2 tes'], ['1 ti', '1 tim'],
  ['2 ti', '2 tim'], ['tit'], ['flm', 'filem'], ['he', 'heb'], ['stg', 'sant'], ['1 p', '1 pe', '1 ped'], ['2 p', '2 pe', '2 ped'], ['1 jn'], ['2 jn'],
  ['3 jn'], ['jud'], ['ap', 'apoc'],
];
const NAMES = new Map<string, number>();
BOOKS.forEach((b, i) => NAMES.set(plain(b[0]), i));
ABBR.forEach((list, i) => list.forEach((a) => { if (!NAMES.has(a)) NAMES.set(a, i); }));
// También los nombres en inglés ("John 3:16"), por si el bosquejo se escribe con la app en inglés. Los de castellano mandan.
EN_BOOKS.forEach((name, i) => { if (!NAMES.has(plain(name))) NAMES.set(plain(name), i); });
if (!NAMES.has('psalm')) NAMES.set('psalm', 18);
const FULL = BOOKS.map((b) => plain(b[0]));

const ORDINAL: Record<string, string> = {
  '1': '1', '2': '2', '3': '3', i: '1', ii: '2', iii: '3',
  '1ra': '1', '1ro': '1', '1a': '1', '1ª': '1', '1º': '1', '1°': '1', '2da': '2', '2do': '2', '2a': '2', '2ª': '2', '2º': '2', '2°': '2',
  '3ra': '3', '3ro': '3', '3a': '3', '3ª': '3', '3º': '3', '3°': '3', primera: '1', primero: '1', segunda: '2', segundo: '2', tercera: '3', tercero: '3',
};

/**
 * El libro por su nombre, completo o abreviado: "Juan", "Jn", "1 Co", "1ra de Corintios", "I Juan", "S. Juan", "Apoc.", "Rom".
 * -1 si no es un libro.
 */
export function findBookLoose(name: string): number {
  let t = plain(name ?? '');
  if (!t) return -1;
  // "San Juan", "S. Mateo": el "san" no cuenta (pero Santiago sí es un libro).
  t = t.replace(/^(san|s) (?=\S)/, '');
  let n = '';
  const m = t.match(/^(\S+)\s+(?:de\s+)?(.+)$/);
  if (m && ORDINAL[m[1]] && !/^\d/.test(m[2])) { n = ORDINAL[m[1]]; t = m[2].replace(/^(san|s) (?=\S)/, ''); }
  else {
    // "1Juan", "2Co" (pegado)
    const g = t.match(/^([123])([a-z].*)$/);
    if (g) { n = g[1]; t = g[2]; }
  }
  const key = n ? `${n} ${t}` : t;
  const hit = NAMES.get(key);
  if (hit !== undefined) return hit;
  if (t.length < 3) return -1;
  // Un comienzo que apunta a un solo libro: "Filip" -> Filipenses, "1 Tesal" -> 1 Tesalonicenses.
  const found: number[] = [];
  FULL.forEach((f, i) => { if (f.startsWith(key) && /^\d/.test(f) === !!n) found.push(i); });
  return found.length === 1 ? found[0] : -1;
}

const L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const NUM_PREFIX = '(?:[123]|III|II|I|[123](?:ra|ro|da|do|a|ª|º|°)|[Pp]rimer[ao]|[Ss]egund[ao]|[Tt]ercer[ao])';
// Libro + capítulo:versículo, con rango opcional ("3:16-18" o "3:16-4:2").
const REF = new RegExp(
  `(?<![${L}\\d])((?:${NUM_PREFIX}\\.?\\s*(?:de\\s+)?)?(?:(?:San|S\\.)\\s+)?[${L}]+\\.?(?:\\s+de\\s+los\\s+[${L}]+)?)\\s*(\\d{1,3})\\s*[:.]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3})(?:\\s*[:.]\\s*(\\d{1,3}))?)?`,
  'g',
);
// Lo que sigue a una cita y usa el mismo libro: "; 10:9-10" (otro capítulo) o ", 18" / " y 20-21" (otro versículo).
const MORE_CHAPTER = /^\s*(?:[;,]|y)\s*(\d{1,3})\s*[:.]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/;
const MORE_VERSE = /^\s*(?:,|y)\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?(?=\s*(?:[,;)\].]|y\s+\d|$))/;

function pushRange(out: OutlineRef[], book: number, chapter: number, from: number, to: number | null, toChapter?: number): boolean {
  const max = chaptersIn(book);
  if (chapter < 1 || chapter > max || from < 1) return false;
  if (toChapter !== undefined && toChapter !== chapter) {
    // "Juan 3:16-4:2": del 3:16 al final, los capítulos del medio enteros, y el último hasta el versículo pedido.
    if (toChapter < chapter || toChapter > max || toChapter - chapter > 3 || to === null || to < 1) return false;
    out.push({ book, chapter, from, to: null });
    for (let c = chapter + 1; c < toChapter; c++) out.push({ book, chapter: c, from: 1, to: null });
    out.push({ book, chapter: toChapter, from: 1, to });
    return true;
  }
  if (to !== null && to < from) return false;
  out.push({ book, chapter, from, to });
  return true;
}

export type FoundRefs = { refs: OutlineRef[]; /** La línea sin las citas. */ rest: string };

/** Todas las citas de una línea: "Dios ama (Juan 3:16-18; Ro 5:8, 10:9-10 y 1 Jn 1:9)". */
export function findRefs(line: string): FoundRefs {
  const text = line ?? '';
  const refs: OutlineRef[] = [];
  const cuts: [number, number][] = [];
  REF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF.exec(text))) {
    // Se prueba el nombre entero y, si no sirve, sin las palabras de adelante ("Leé Juan 3:16", "2. Juan 3:16").
    const words = m[1].split(/\s+/);
    const chapter = Number(m[2]);
    const from = Number(m[3]);
    let book = -1;
    let nameStart = m.index;
    for (let k = 0; k < words.length && book < 0; k++) {
      const name = words.slice(k).join(' ');
      const b = findBookLoose(name);
      if (b < 0) continue;
      const ok = m[5] !== undefined
        ? pushRange(refs, b, chapter, from, Number(m[5]), Number(m[4]))
        : pushRange(refs, b, chapter, from, m[4] !== undefined ? Number(m[4]) : from);
      if (ok) { book = b; nameStart = m.index + m[1].lastIndexOf(name); }
    }
    if (book < 0) { REF.lastIndex = m.index + Math.max(1, m[1].length); continue; }
    let end = m.index + m[0].length;
    let lastChapter = m[5] !== undefined ? Number(m[4]) : chapter;
    // Más citas del mismo libro, pegadas a esta.
    for (;;) {
      const tail = text.slice(end);
      const c = tail.match(MORE_CHAPTER);
      if (c) {
        const f = Number(c[2]);
        if (!pushRange(refs, book, Number(c[1]), f, c[3] !== undefined ? Number(c[3]) : f)) break;
        lastChapter = Number(c[1]);
        end += c[0].length;
        continue;
      }
      const v = tail.match(MORE_VERSE);
      if (v) {
        const f = Number(v[1]);
        if (!pushRange(refs, book, lastChapter, f, v[2] !== undefined ? Number(v[2]) : f)) break;
        end += v[0].length;
        continue;
      }
      break;
    }
    cuts.push([nameStart, end]);
    REF.lastIndex = end;
  }
  let rest = '';
  let at = 0;
  for (const [a, b] of cuts) { rest += text.slice(at, a); at = b; }
  rest += text.slice(at);
  // Se limpia lo que quedó alrededor de las citas: paréntesis vacíos, la sigla de la versión, separadores sueltos.
  rest = rest
    .replace(/\(\s*(?:RVR?\s?\d{2,4}|RV|NVI|LBLA|NTV|DHH)\s*\)/gi, ' ')
    .replace(/[([]\s*(?:[;,·y]|\s)*[)\]]/g, ' ')
    .replace(/\s+([,;.:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;:·–—-]+$/g, '')
    .trim();
  return { refs, rest };
}

/** "Juan 3:16–18", "Salmos 23" (capítulo entero). */
export function refLabel(r: OutlineRef): string {
  if (r.to === null) return r.from === 1 ? `${bookName(r.book)} ${r.chapter}` : `${bookName(r.book)} ${r.chapter}:${r.from}…`;
  return `${bookName(r.book)} ${r.chapter}:${r.from === r.to ? r.from : `${r.from}–${r.to}`}`;
}

const BULLET = /^\s*(?:[-–—•*·▪◦‣>]+|[a-z][.)])\s+/;
/** "1. ", "2) ", "II. ": el número del punto (no es parte de la cita: "1. Juan 3:16" es el punto 1, no 1 Juan). */
const LIST_NUM = /^\s*(?:\d{1,2}|[IVX]{1,4})[.)]\s+/;
const TITLE_WORD = /^\s*(?:t[ií]tulo|tema|pr[eé]dica|mensaje|serm[oó]n)\s*:\s*/i;
/** Una línea que es solo una cita de capítulo entero: "Salmo 23", "(Judas)". */
function wholeChapter(line: string): OutlineRef | null {
  const t = line.replace(/^[\s([]+|[\s)\].;,]+$/g, '');
  const m = t.match(new RegExp(`^([${L}\\d.ªº°]+(?:\\s+[${L}.]+){0,4}?)\\s+(\\d{1,3})$`));
  if (!m) return null;
  const book = findBookLoose(m[1]);
  if (book < 0) return null;
  const n = Number(m[2]);
  if (chaptersIn(book) === 1) return n >= 1 ? { book, chapter: 1, from: n, to: n } : null;
  return n >= 1 && n <= chaptersIn(book) ? { book, chapter: n, from: 1, to: null } : null;
}

/**
 * Lee el bosquejo pegado. La primera línea con texto es el título. Después, cada línea es un punto;
 * las que empiezan con guion o viñeta son sub-puntos del punto de arriba. Las citas se sacan de cada línea.
 */
export function parseOutline(text: string): Outline {
  const lines = (text ?? '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\t/g, ' ').trimEnd()).filter((l) => l.trim());
  if (!lines.length) return { title: '', parts: [] };
  const parts: OutlinePart[] = [];
  let title = '';
  let parent: string | null = null;
  lines.forEach((raw, i) => {
    const sub = BULLET.test(raw);
    const noBullet = raw.replace(BULLET, '').trim();
    const num = noBullet.match(LIST_NUM)?.[0] ?? '';
    const line = noBullet.slice(num.length).trim();
    const whole = wholeChapter(line);
    const found = whole ? { refs: [whole], rest: '' } : findRefs(line);
    const said = found.rest.replace(/^["“”'«»]+|["“”'«»]+$/g, '').trim();
    const words = said && num ? `${num.trim()} ${said}` : said;
    if (i === 0) {
      // El título: si la primera línea es solo una cita, no hay título.
      title = words.replace(TITLE_WORD, '').trim();
      if (found.refs.length) parts.push({ kind: 'refs', refs: found.refs });
      return;
    }
    // ¿Quedó algo para leer además de las citas?
    if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]{2,}/.test(said)) {
      if (found.refs.length) parts.push({ kind: 'refs', refs: found.refs });
      return;
    }
    parts.push({ kind: 'point', text: words, parent: sub ? parent : null, refs: found.refs });
    if (!sub) parent = words;
  });
  return { title, parts };
}
