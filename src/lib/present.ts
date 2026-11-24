// Modo presentación: la lista del culto, sus diapositivas y lo que se manda a la pantalla.
// Solo lógica: sin pantalla ni base, para poder probarse sola.
import { bookName, chapterText, chaptersIn, findBook, type BibleVersion } from './bible';
import { lyricBlocks } from './songs';
import { parseOutline, refLabel } from './sermonOutline';

/** Un archivo que subió la iglesia (foto, video o música) en el depósito "present". */
export type MediaRef = { path: string; name: string };

export type PresentItemType = 'countdown' | 'song' | 'passage' | 'image' | 'video' | 'music' | 'text' | 'notice' | 'announcements' | 'sermon';

type Base = { id: string; title: string };
export type CountdownItem = Base & { type: 'countdown'; minutes: number; message: string };
export type SongItem = Base & {
  type: 'song';
  /** La canción del Cancionero de donde salió (la letra de acá se puede cambiar sin tocar el Cancionero). */
  songId: string | null;
  lyrics: string;
  /** Pasar sola de diapositiva. */
  auto: boolean;
  /** Segundos por diapositiva. */
  secs: number;
  /** Velocidad: 0.5 (lento) a 2 (rápido). */
  speed: number;
  /** Pista que suena mientras avanza (opcional). */
  audio: MediaRef | null;
};
export type PassageItem = Base & { type: 'passage'; ref: string; version: string; perSlide: number };
export type ImageItem = Base & { type: 'image'; media: MediaRef | null };
export type VideoItem = Base & { type: 'video'; media: MediaRef | null };
export type MusicItem = Base & { type: 'music'; media: MediaRef | null };
export type TextItem = Base & { type: 'text'; body: string };
export type NoticeItem = Base & { type: 'notice'; body: string };
/** Una diapositiva de anuncio ya armada (título amarillo y detalle). */
export type NoticeCard = { title: string; body: string };
/**
 * Anuncios y próximos eventos de la app, en rueda antes del culto. Las diapositivas se guardan en la lista
 * (para que anden sin conexión) y se vuelven a traer de la app al abrir la lista o al tocar "Actualizar".
 */
export type AnnouncementsItem = Base & {
  type: 'announcements';
  /** Segundos por diapositiva. */
  secs: number;
  /** Anuncios de los últimos N días. */
  days: number;
  /** Eventos de los próximos N días. */
  ahead: number;
  anns: boolean;
  events: boolean;
  /** Sumar también las reuniones que se repiten todas las semanas. */
  weekly: boolean;
  cards: NoticeCard[];
  /** Cuándo se trajeron de la app (0 = nunca). */
  loadedAt: number;
};
/** La prédica: se pega el bosquejo y salen el título, un punto por diapositiva y los versículos de cada cita. */
export type SermonItem = Base & { type: 'sermon'; outline: string; version: string; perSlide: number };
export type PresentItem = CountdownItem | SongItem | PassageItem | ImageItem | VideoItem | MusicItem | TextItem | NoticeItem | AnnouncementsItem | SermonItem;

export const ITEM_TYPES: { type: PresentItemType; label: string; icon: string }[] = [
  { type: 'song', label: 'Canción', icon: 'music' },
  { type: 'passage', label: 'Pasaje bíblico', icon: 'book-open' },
  { type: 'countdown', label: 'Cuenta regresiva', icon: 'clock' },
  { type: 'image', label: 'Foto', icon: 'image' },
  { type: 'video', label: 'Video', icon: 'film' },
  { type: 'music', label: 'Música', icon: 'headphones' },
  { type: 'text', label: 'Texto libre', icon: 'type' },
  { type: 'notice', label: 'Anuncio', icon: 'volume-2' },
  { type: 'announcements', label: 'Anuncios de la app', icon: 'bell' },
  { type: 'sermon', label: 'Prédica (bosquejo)', icon: 'align-left' },
];
export const typeInfo = (t: PresentItemType) => ITEM_TYPES.find((x) => x.type === t) ?? ITEM_TYPES[0];

/** Una diapositiva lista para mostrar. */
export type Slide =
  | { kind: 'text'; text: string; label: string | null; footer: string | null; /** Renglón chico arriba del texto (en la prédica, el punto al que pertenece un sub-punto). */ head?: string }
  | { kind: 'notice'; title: string; body: string }
  | { kind: 'countdown'; minutes: number; message: string }
  | { kind: 'image'; media: MediaRef }
  | { kind: 'video'; media: MediaRef };

export const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const str = (v: unknown, max: number, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);

export const SECS_MIN = 2;
export const SECS_MAX = 120;
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function newItem(type: PresentItemType): PresentItem {
  const id = newId();
  switch (type) {
    case 'countdown': return { id, type, title: 'Cuenta regresiva', minutes: 5, message: 'Ya empezamos' };
    case 'song': return { id, type, title: 'Canción', songId: null, lyrics: '', auto: false, secs: 15, speed: 1, audio: null };
    case 'passage': return { id, type, title: '', ref: '', version: 'rv1909', perSlide: 1 };
    case 'image': return { id, type, title: 'Foto', media: null };
    case 'video': return { id, type, title: 'Video', media: null };
    case 'music': return { id, type, title: 'Música', media: null };
    case 'text': return { id, type, title: 'Texto', body: '' };
    case 'notice': return { id, type, title: 'Anuncio', body: '' };
    case 'announcements': return { id, type, title: 'Anuncios', secs: 10, days: 7, ahead: 14, anns: true, events: true, weekly: false, cards: [], loadedAt: 0 };
    case 'sermon': return { id, type, title: 'Prédica', outline: '', version: 'rv1909', perSlide: 1 };
  }
}

function cleanMedia(v: unknown): MediaRef | null {
  const m = v as { path?: unknown; name?: unknown } | null;
  if (!m || typeof m.path !== 'string' || !m.path) return null;
  return { path: m.path.slice(0, 300), name: str(m.name, 120, 'archivo') };
}

export const MAX_CARDS = 40;
export function cleanCards(v: unknown): NoticeCard[] {
  if (!Array.isArray(v)) return [];
  const out: NoticeCard[] = [];
  for (const c of v as { title?: unknown; body?: unknown }[]) {
    if (!c || typeof c !== 'object') continue;
    const title = str(c.title, 160).trim();
    const body = str(c.body, 600).trim();
    if (title || body) out.push({ title, body });
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

/** Lo que vuelve de la base, revisado: se tira lo que no se entiende y se acomodan los números. */
export function cleanItems(raw: unknown): PresentItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PresentItem[] = [];
  const seen = new Set<string>();
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    let id = str(r.id, 40) || newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const title = str(r.title, 160);
    switch (r.type) {
      case 'countdown': out.push({ id, type: 'countdown', title, minutes: clamp(num(r.minutes, 5), 0.5, 180), message: str(r.message, 200) }); break;
      case 'song': out.push({
        id, type: 'song', title, songId: typeof r.songId === 'string' ? r.songId : null, lyrics: str(r.lyrics, 20000), auto: r.auto === true,
        secs: clamp(Math.round(num(r.secs, 15)), SECS_MIN, SECS_MAX), speed: clamp(num(r.speed, 1), 0.5, 2), audio: cleanMedia(r.audio),
      }); break;
      case 'passage': out.push({ id, type: 'passage', title, ref: str(r.ref, 80), version: str(r.version, 20, 'rv1909'), perSlide: clamp(Math.round(num(r.perSlide, 1)), 1, 4) }); break;
      case 'image': out.push({ id, type: 'image', title, media: cleanMedia(r.media) }); break;
      case 'video': out.push({ id, type: 'video', title, media: cleanMedia(r.media) }); break;
      case 'music': out.push({ id, type: 'music', title, media: cleanMedia(r.media) }); break;
      case 'text': out.push({ id, type: 'text', title, body: str(r.body, 20000) }); break;
      case 'notice': out.push({ id, type: 'notice', title, body: str(r.body, 2000) }); break;
      case 'announcements': out.push({
        id, type: 'announcements', title, secs: clamp(Math.round(num(r.secs, 10)), SECS_MIN, SECS_MAX), days: clamp(Math.round(num(r.days, 7)), 1, 60),
        ahead: clamp(Math.round(num(r.ahead, 14)), 1, 90), anns: r.anns !== false, events: r.events !== false, weekly: r.weekly === true,
        cards: cleanCards(r.cards), loadedAt: Math.max(0, num(r.loadedAt, 0)),
      }); break;
      case 'sermon': out.push({ id, type: 'sermon', title, outline: str(r.outline, 20000), version: str(r.version, 20, 'rv1909'), perSlide: clamp(Math.round(num(r.perSlide, 1)), 1, 4) }); break;
      default: break;
    }
  }
  return out;
}

// ---------- Canciones ----------

/** Reparte una estrofa larga en partes parejas de hasta `max` líneas (8 líneas -> 4 y 4, no 6 y 2). */
export function splitLines(lines: string[], max: number): string[][] {
  if (lines.length <= max) return [lines];
  const parts = Math.ceil(lines.length / max);
  const size = Math.ceil(lines.length / parts);
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size));
  return out;
}

/** La letra en diapositivas: una por estrofa o coro. Las estrofas largas se parten para que se lean de lejos. */
export function songSlides(lyrics: string, maxLines = 6): Slide[] {
  const out: Slide[] = [];
  for (const b of lyricBlocks(lyrics)) {
    if (!b.lines.length) continue;
    for (const part of splitLines(b.lines, maxLines)) out.push({ kind: 'text', text: part.join('\n'), label: b.label, footer: null });
  }
  return out;
}

// ---------- Biblia ----------

export type PassageRef = { book: number; chapter: number; from: number; to: number | null };

/**
 * Entiende "Juan 3:16", "Juan 3:16-18", "1 Juan 1.9", "Salmo 23" (capítulo entero) y "Judas 3" (libro de un solo capítulo).
 * `to` null = hasta el final del capítulo. null si no se entiende.
 */
export function parsePassage(text: string): PassageRef | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?)\s+(\d+)(?:\s*[:.,]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?$/);
  if (!m) return null;
  const book = findBook(m[1]);
  if (book < 0) return null;
  const a = Number(m[2]);
  if (m[3] === undefined) {
    // "Judas 3": en los libros de un capítulo, el número es el versículo.
    if (chaptersIn(book) === 1 && a > 1) return { book, chapter: 1, from: a, to: a };
    if (a < 1 || a > chaptersIn(book)) return null;
    return { book, chapter: a, from: 1, to: null };
  }
  if (a < 1 || a > chaptersIn(book)) return null;
  const from = Number(m[3]);
  const to = m[4] !== undefined ? Number(m[4]) : from;
  if (from < 1 || to < from) return null;
  return { book, chapter: a, from, to };
}

/** "Juan 3:16–18" */
export function passageLabel(book: number, chapter: number, from: number, to: number): string {
  return `${bookName(book)} ${chapter}:${from === to ? from : `${from}–${to}`}`;
}

/** El pasaje en diapositivas, con `perSlide` versículos en cada una y la cita abajo. [] si no existe. */
export function passageSlides(version: BibleVersion, ref: PassageRef | null, perSlide = 1): Slide[] {
  if (!ref) return [];
  const text = chapterText(version, ref.book, ref.chapter);
  if (!text.length || ref.from > text.length) return [];
  const last = Math.min(ref.to ?? text.length, text.length);
  const step = clamp(Math.round(perSlide) || 1, 1, 4);
  const out: Slide[] = [];
  for (let v = ref.from; v <= last; v += step) {
    const end = Math.min(v + step - 1, last);
    const body: string[] = [];
    for (let n = v; n <= end; n++) body.push(end > v ? `${n} ${text[n - 1]}` : text[n - 1]);
    out.push({ kind: 'text', text: body.join(' '), label: null, footer: `${passageLabel(ref.book, ref.chapter, v, end)} (${version.short})` });
  }
  return out;
}

// ---------- Texto libre ----------

/** Texto libre: cada párrafo (separado por una línea vacía) es una diapositiva. */
export function textSlides(body: string): Slide[] {
  return (body ?? '').replace(/\r/g, '').split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join('\n'))
    .filter(Boolean)
    .map((text) => ({ kind: 'text' as const, text, label: null, footer: null }));
}

// ---------- Prédica ----------

/** Tope de versículos por cita en la prédica (un capítulo entero largo no llena la lista de diapositivas). */
export const SERMON_MAX_VERSES = 40;

/**
 * El bosquejo en diapositivas: el título, una por punto (los sub-puntos llevan arriba el punto al que pertenecen)
 * y, después de cada punto, los versículos de sus citas con el texto de la Biblia de la app.
 */
export function sermonSlides(outline: string, version: BibleVersion, perSlide = 1): Slide[] {
  const o = parseOutline(outline);
  const out: Slide[] = [];
  if (o.title) out.push({ kind: 'notice', title: o.title, body: '' });
  for (const p of o.parts) {
    if (p.kind === 'point') {
      out.push({ kind: 'text', text: p.text, label: null, footer: p.refs.length ? p.refs.map(refLabel).join(' · ') : null, ...(p.parent ? { head: p.parent } : {}) });
    }
    for (const r of p.refs) {
      const total = chapterText(version, r.book, r.chapter).length;
      const last = Math.min(r.to ?? total, total, r.from + SERMON_MAX_VERSES - 1);
      out.push(...passageSlides(version, { ...r, to: last }, perSlide));
    }
  }
  return out;
}

/** Las diapositivas de una parte de la lista. La música no tiene: suena y la pantalla queda como está. */
export function itemSlides(item: PresentItem, version: BibleVersion): Slide[] {
  switch (item.type) {
    case 'countdown': return [{ kind: 'countdown', minutes: item.minutes, message: item.message }];
    case 'song': return songSlides(item.lyrics);
    case 'passage': return passageSlides(version, parsePassage(item.ref), item.perSlide);
    case 'image': return item.media ? [{ kind: 'image', media: item.media }] : [];
    case 'video': return item.media ? [{ kind: 'video', media: item.media }] : [];
    case 'music': return [];
    case 'text': return textSlides(item.body);
    case 'notice': return item.title.trim() || item.body.trim() ? [{ kind: 'notice', title: item.title.trim(), body: item.body.trim() }] : [];
    case 'announcements': return item.cards.map((c) => ({ kind: 'notice' as const, title: c.title, body: c.body }));
    case 'sermon': return sermonSlides(item.outline, version, item.perSlide);
  }
}

/** El nombre que se ve en la lista. */
export function itemTitle(item: PresentItem): string {
  if (item.type === 'passage') return item.ref.trim() || 'Pasaje bíblico';
  if (item.type === 'countdown') return `Cuenta regresiva · ${item.minutes} min`;
  if (item.type === 'sermon') return parseOutline(item.outline).title || item.title.trim() || 'Prédica';
  return item.title.trim() || typeInfo(item.type).label;
}

/** ¿Esta parte pasa sola? Cada cuánto, y si al terminar vuelve a empezar (los anuncios dan vueltas). */
export function autoOf(item: PresentItem | null | undefined): { ms: number; loop: boolean } | null {
  if (!item) return null;
  if (item.type === 'song' && item.auto) return { ms: autoMs(item.secs, item.speed), loop: false };
  if (item.type === 'announcements') return { ms: autoMs(item.secs, 1), loop: true };
  return null;
}

/** La diapositiva que sigue cuando avanza sola. null = queda quieta (la última de una canción, o una sola diapositiva). */
export function autoNext(total: number, index: number, loop: boolean): number | null {
  if (total <= 1) return null;
  if (index + 1 < total) return index + 1;
  return loop ? 0 : null;
}

// ---------- Avanzar ----------

export type Pos = { item: number; slide: number };

/**
 * La diapositiva siguiente (+1) o anterior (-1). Al terminar una parte pasa a la que sigue (salteando las que
 * no tienen diapositivas, como la música). null si no hay más.
 */
export function step(counts: number[], pos: Pos | null, dir: 1 | -1): Pos | null {
  if (!pos) {
    if (dir === -1) return null;
    const first = counts.findIndex((c) => c > 0);
    return first >= 0 ? { item: first, slide: 0 } : null;
  }
  const s = pos.slide + dir;
  if (s >= 0 && s < (counts[pos.item] ?? 0)) return { item: pos.item, slide: s };
  for (let i = pos.item + dir; i >= 0 && i < counts.length; i += dir) {
    if (counts[i] > 0) return { item: i, slide: dir === 1 ? 0 : counts[i] - 1 };
  }
  return null;
}

/** Cuánto se queda cada diapositiva cuando avanza sola, en milisegundos. */
export function autoMs(secs: number, speed: number): number {
  return Math.round((clamp(secs || 15, SECS_MIN, SECS_MAX) * 1000) / clamp(speed || 1, 0.5, 2));
}

/** 75 -> "1:15". Nunca baja de 0:00. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * El tamaño de letra más grande con el que el texto entra en un cuadro de w x h (calculado a ojo por cantidad
 * de letras; las líneas largas se cortan solas). Las MAYÚSCULAS son más anchas y se cuentan así.
 * Si achicando un poco la letra ninguna línea se corta, se prefiere eso: una estrofa se lee mejor con sus renglones enteros.
 */
export function fitFont(text: string, w: number, h: number, max = h / 5): number {
  const lines = (text || ' ').split('\n');
  const letters = (text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) ?? []).length;
  const upper = (text.match(/[A-ZÁÉÍÓÚÜÑ]/g) ?? []).length;
  const charW = 0.56 + 0.16 * (letters ? upper / letters : 0);
  const fits = (fs: number) => {
    const perLine = Math.max(1, Math.floor(w / (fs * charW)));
    const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
    return rows * fs * 1.3 <= h;
  };
  let lo = 8;
  // Una palabra sola (o un link largo) no se corta: la letra se achica hasta que entre a lo ancho.
  const word = (text || ' ').split(/\s+/).reduce((n, x) => Math.max(n, x.length), 1);
  let hi = Math.max(lo, Math.min(Math.floor(max), Math.floor(w / (word * charW))));
  if (!fits(hi)) {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    hi = lo;
  }
  // `hi` entra. ¿Y sin cortar ningún renglón?
  const longest = lines.reduce((n, l) => Math.max(n, l.length), 1);
  const whole = Math.min(hi, Math.floor(w / (longest * charW)), Math.floor(h / (lines.length * 1.3)));
  return whole >= hi * 0.72 && whole >= 8 ? whole : hi;
}

// ---------- Lo que viaja a la pantalla ----------

export type LiveSlide =
  | { kind: 'text'; text: string; label: string | null; footer: string | null; /** Renglón chico arriba del texto (en la prédica, el punto al que pertenece un sub-punto). */ head?: string }
  | { kind: 'notice'; title: string; body: string }
  /** endsAt: hora (reloj del operador) en que llega a cero. */
  | { kind: 'countdown'; endsAt: number; message: string }
  | { kind: 'image'; url: string }
  /** startedAt cambia cada vez que el video tiene que arrancar de nuevo. */
  | { kind: 'video'; url: string; playing: boolean; startedAt: number };

/** Lo que necesita la vista de escenario (los que cantan y el que predica): qué viene después. */
export type StageInfo = {
  /** El texto de la diapositiva que sigue. null si no hay más. */
  next: string | null;
  nextLabel: string | null;
  /** La parte de la lista que está en pantalla ("Sublime gracia"). */
  item: string;
  /** Diapositiva número n de total, dentro de esa parte. */
  n: number;
  total: number;
};

/** Una diapositiva en pocas palabras, para la vista de escenario. */
export function slideWords(s: Slide): { text: string; label: string | null } {
  switch (s.kind) {
    case 'text': return { text: s.text, label: s.label ?? s.head ?? s.footer };
    case 'notice': return { text: [s.title, s.body].filter(Boolean).join('\n'), label: null };
    case 'countdown': return { text: `Cuenta regresiva · ${s.minutes} min`, label: null };
    case 'image': return { text: `Foto: ${s.media.name}`, label: null };
    case 'video': return { text: `Video: ${s.media.name}`, label: null };
  }
}

/** Qué está en pantalla y qué sigue, para mandarle a la vista de escenario. */
export function stageOf(parts: { title: string; slides: Slide[]; loop: boolean }[], pos: Pos): StageInfo | null {
  const part = parts[pos.item];
  if (!part || !part.slides[pos.slide]) return null;
  let nextSlide: Slide | null = null;
  let nextPart: string | null = null;
  if (pos.slide + 1 < part.slides.length) nextSlide = part.slides[pos.slide + 1];
  else if (part.loop && part.slides.length > 1) nextSlide = part.slides[0];
  else {
    const np = step(parts.map((p) => p.slides.length), pos, 1);
    if (np) { nextSlide = parts[np.item].slides[np.slide]; nextPart = parts[np.item].title; }
  }
  const w = nextSlide ? slideWords(nextSlide) : null;
  return {
    next: w ? w.text.slice(0, 1200) : null,
    // Si lo que sigue es otra parte de la lista, se avisa cuál.
    nextLabel: w ? (nextPart ? `Sigue: ${nextPart}`.slice(0, 160) : w.label) : null,
    item: part.title.slice(0, 160), n: pos.slide + 1, total: part.slides.length,
  };
}

function cleanStage(v: unknown): StageInfo | undefined {
  const g = v as Partial<StageInfo> | null;
  if (!g || typeof g !== 'object') return undefined;
  return {
    next: typeof g.next === 'string' ? g.next.slice(0, 1200) : null,
    nextLabel: typeof g.nextLabel === 'string' ? g.nextLabel.slice(0, 160) : null,
    item: str(g.item, 160), n: Math.max(0, Math.round(num(g.n, 0))), total: Math.max(0, Math.round(num(g.total, 0))),
  };
}

export type LiveState = {
  v: 1;
  mode: 'slide' | 'black' | 'logo';
  slide: LiveSlide | null;
  /** Cambia con cada cambio de pantalla; el mismo sello repetido no se vuelve a dibujar. */
  stamp: string;
  /** Hora del reloj del operador al mandarlo (para acomodar la cuenta regresiva en otro aparato). */
  at: number;
  /** Para la vista de escenario. Las versiones viejas de la app no lo mandan ni lo miran. */
  stage?: StageInfo;
};

export const BLACK: LiveState = { v: 1, mode: 'black', slide: null, stamp: 'inicio', at: 0 };

export type RemoteCommand = 'next' | 'prev' | 'black' | 'logo';
export const isCommand = (c: unknown): c is RemoteCommand => c === 'next' || c === 'prev' || c === 'black' || c === 'logo';

/** Revisa lo que llegó de otro aparato. null si no sirve. */
export function cleanLive(raw: unknown): LiveState | null {
  const r = raw as Partial<LiveState> | null;
  if (!r || typeof r !== 'object' || r.v !== 1 || typeof r.stamp !== 'string' || typeof r.at !== 'number') return null;
  if (r.mode !== 'slide' && r.mode !== 'black' && r.mode !== 'logo') return null;
  const s = r.slide as LiveSlide | null | undefined;
  if (r.mode === 'slide') {
    if (!s || typeof s !== 'object') return null;
    const okSlide =
      (s.kind === 'text' && typeof s.text === 'string')
      || (s.kind === 'notice' && typeof s.title === 'string' && typeof s.body === 'string')
      || (s.kind === 'countdown' && typeof s.endsAt === 'number')
      || (s.kind === 'image' && typeof s.url === 'string' && /^https:\/\//.test(s.url))
      || (s.kind === 'video' && typeof s.url === 'string' && /^https:\/\//.test(s.url));
    if (!okSlide) return null;
  }
  const out: LiveState = { v: 1, mode: r.mode, slide: r.mode === 'slide' ? (s as LiveSlide) : null, stamp: r.stamp, at: r.at };
  const stage = cleanStage(r.stage);
  if (stage) out.stage = stage;
  return out;
}

/** ¿Hay que tomar lo que llegó? Sí si es más nuevo que lo que se está mostrando. */
export function isNewer(current: LiveState | null, incoming: LiveState): boolean {
  if (!current) return true;
  if (incoming.stamp === current.stamp) return false;
  return incoming.at >= current.at;
}
