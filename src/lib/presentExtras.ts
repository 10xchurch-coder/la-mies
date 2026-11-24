// Modo presentación: anuncios y eventos de la app convertidos en diapositivas, y el orden del culto convertido en lista.
// Solo lógica: sin pantalla ni base, para poder probarse sola.
import { MAX_CARDS, newItem, parsePassage, type NoticeCard, type PresentItem } from './present';
import { findRefs, refLabel } from './sermonOutline';
import { typeInfo as planType, type PlanItem } from './servicePlan';
import { searchKey } from './songs';
import { tx, txList } from './i18n';

// ---------- Anuncios y eventos ----------

export type AnnLike = { title: string; body: string; audience: string; created_at: string };
export type EventLike = { title: string; starts_at: string; ends_at: string | null; all_day: boolean; place: string | null; weekly: boolean; yearly?: boolean };
export type CardOptions = { days: number; ahead: number; anns: boolean; events: boolean; weekly: boolean };

const DAYS = txList(['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']);
const MONTHS = txList(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']);
const DAY_MS = 86400000;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) => Math.round((midnight(a).getTime() - midnight(b).getTime()) / DAY_MS);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const hhmm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const dayMonth = (d: Date) => tx('{d} de {month}', { d: d.getDate(), month: MONTHS[d.getMonth()] });

/** "Hoy", "Mañana", "Sábado 28 de noviembre". */
export function dayWords(d: Date, now: Date): string {
  const n = dayDiff(d, now);
  if (n === 0) return tx('Hoy');
  if (n === 1) return tx('Mañana');
  return `${cap(DAYS[d.getDay()])} ${dayMonth(d)}`;
}

/** Cuándo es, tal como va en la diapositiva: "Sábado 28 de noviembre · 19:00 h", "Del 28 de noviembre al 2 de diciembre". */
export function whenWords(start: Date, end: Date | null, allDay: boolean, now: Date): string {
  if (end && dayDiff(end, start) >= 1) return `Del ${dayMonth(start)} al ${dayMonth(end)}`;
  return allDay ? dayWords(start, now) : `${dayWords(start, now)} · ${hhmm(start)} h`;
}

const short = (t: string, max: number) => {
  const clean = (t ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

/**
 * Las diapositivas de anuncios: primero los anuncios para toda la iglesia de los últimos días (el más nuevo arriba)
 * y después los eventos que vienen, por fecha. Los anuncios para un grupo o para los líderes NO van al proyector.
 */
export function announcementCards(anns: AnnLike[], events: EventLike[], o: CardOptions, now: Date): NoticeCard[] {
  const out: NoticeCard[] = [];
  if (o.anns) {
    const since = now.getTime() - o.days * DAY_MS;
    anns.filter((a) => a.audience === 'all' && new Date(a.created_at).getTime() >= since && new Date(a.created_at).getTime() <= now.getTime() + DAY_MS)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .forEach((a) => out.push({ title: short(a.title, 120), body: short(a.body, 420) }));
  }
  if (o.events) {
    const today = midnight(now);
    const found: { at: Date; card: NoticeCard }[] = [];
    for (const ev of events) {
      const start = new Date(ev.starts_at);
      if (Number.isNaN(start.getTime()) || !ev.title?.trim()) continue;
      const end = ev.ends_at ? new Date(ev.ends_at) : null;
      const len = end && !Number.isNaN(end.getTime()) ? Math.max(0, dayDiff(end, start)) : 0;
      let s: Date | null = null;
      if (ev.weekly) {
        if (!o.weekly) continue;
        // La próxima vez que toca ese día de la semana (si es hoy y todavía no pasó, hoy).
        const d = new Date(today);
        d.setDate(d.getDate() + ((start.getDay() - today.getDay() + 7) % 7));
        d.setHours(start.getHours(), start.getMinutes(), 0, 0);
        if (!ev.all_day && d.getTime() < now.getTime() - 3600000) d.setDate(d.getDate() + 7);
        s = d;
      } else if (ev.yearly) {
        for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
          const d = new Date(start);
          d.setFullYear(y);
          const last = new Date(d); last.setDate(last.getDate() + len);
          if (dayDiff(last, today) >= 0) { s = d; break; }
        }
      } else s = start;
      if (!s) continue;
      const e = len ? new Date(midnight(s).getTime() + len * DAY_MS + 12 * 3600000) : null;
      const until = dayDiff(e ?? s, today);
      const from = dayDiff(s, today);
      // Entra si todavía no terminó y empieza dentro de los días pedidos. Lo de hoy que ya pasó hace más de 3 horas, no.
      if (until < 0 || from > o.ahead) continue;
      if (!len && !ev.all_day && s.getTime() < now.getTime() - 3 * 3600000) continue;
      const lines = [whenWords(s, e, ev.all_day || !!len, now)];
      if (ev.place?.trim()) lines.push(short(ev.place, 120));
      found.push({ at: s, card: { title: short(ev.title, 120), body: lines.join('\n') } });
    }
    found.sort((a, b) => a.at.getTime() - b.at.getTime()).forEach((f) => out.push(f.card));
  }
  return out.slice(0, MAX_CARDS);
}

// ---------- Orden del culto ----------
// El orden del culto se arma en otra parte de la app (ver servicePlan.ts): acá se convierte en partes de la lista.

export type SongLike = { id: string; title: string; lyrics: string };

/** La canción del Cancionero que corresponde: por su número de la base y, si no, por el nombre (sin tildes ni mayúsculas). */
export function matchSong(e: { title: string; songId: string | null }, songs: SongLike[]): SongLike | null {
  if (e.songId) { const byId = songs.find((s) => s.id === e.songId); if (byId) return byId; }
  const k = searchKey(e.title);
  if (!k) return null;
  const same = songs.filter((s) => searchKey(s.title) === k);
  if (same.length) return same[0];
  // "Cuán grande es Él (2 estrofas)" -> si un solo título coincide en parte, es ese.
  const near = songs.filter((s) => { const t = searchKey(s.title); return t.length >= 4 && (k.includes(t) || (k.length >= 4 && t.includes(k))); });
  return near.length === 1 ? near[0] : null;
}

/** El orden del culto convertido en partes de la lista: canciones con su letra, lecturas con su pasaje y lo demás como cartel. */
export function planToItems(entries: PlanItem[], songs: SongLike[]): PresentItem[] {
  const out: PresentItem[] = [];
  for (const e of entries) {
    const label = planType(e.type).label;
    const title = (e.title ?? '').trim() || label;
    const who = (e.whoName ?? '').trim();
    if (e.type === 'song') {
      // Una canción sin nombre ("Canción") no se busca por nombre: se elige a mano.
      const s = matchSong({ title: title === label ? '' : title, songId: e.songId }, songs);
      const it = newItem('song');
      // Si no está en el Cancionero queda sin letra: al abrirla, la app pide elegir la canción.
      out.push(s ? { ...it, title: s.title, songId: s.id, lyrics: s.lyrics } as PresentItem : { ...it, title } as PresentItem);
    } else if (e.type === 'reading') {
      const raw = (e.ref ?? '').trim();
      const direct = raw && parsePassage(raw) ? raw : '';
      const loose = !direct && raw ? findRefs(raw).refs[0] : undefined;
      const ref = direct || (loose ? refLabel(loose).replace('–', '-').replace('…', '') : '');
      if (ref) out.push({ ...newItem('passage'), title, ref } as PresentItem);
      else out.push({ ...newItem('notice'), title, body: [raw, who].filter(Boolean).join('\n') } as PresentItem);
    } else if (e.type === 'sermon') {
      // El título de la prédica y, si en la nota hay citas, van abajo para que se abran solas.
      const note = (e.note ?? '').trim();
      const refs = note && findRefs(note).refs.length ? note : '';
      out.push({ ...newItem('sermon'), title, outline: [title, refs].filter(Boolean).join('\n') } as PresentItem);
    } else if (e.type === 'notices') {
      out.push({ ...newItem('announcements'), title } as PresentItem);
    } else {
      // Oración, ofrenda y lo demás: un cartel con el nombre de la parte y quién la hace.
      out.push({ ...newItem('notice'), title, body: who } as PresentItem);
    }
  }
  return out;
}
