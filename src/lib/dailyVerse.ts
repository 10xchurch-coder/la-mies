// El versículo del día en la Biblia de cada iglesia.
// Los devocionales se escriben con el versículo en una versión (hoy, Reina-Valera 1960). Cada iglesia elige:
//   - mostrarlo tal como se escribió (así lo usa la iglesia anfitriona), o
//   - mostrarlo en la versión que la iglesia puso de inicio (lo normal para las demás).
// Si la cita no se entiende o ese texto no está, queda el que se escribió, con su sigla. Nunca se muestra una sigla que no es.
import { VERSIONS, chapterText, ensureBook, getChurchBible, type BibleVersion } from './bible';
import { churchDefault } from './bibleChurch';
import { parseRef } from './bibleStudy';

export const WRITTEN_SHORT = 'RV1960';
let asWritten = true;
/** Lo carga la app al entrar (columna churches.daily_verse_written). Sin dato, se deja como se escribió. */
export function setDailyVerseWritten(v: boolean | null | undefined): void { asWritten = v !== false; }

/** La sigla que va al lado del versículo del día. */
export const bibleOf = (item: object | null | undefined): string => (item as { bible?: string | null } | null | undefined)?.bible ?? WRITTEN_SHORT;

/** Junta los versículos de una cita ("Juan 3:16-17") en una versión. null si no se puede. */
export function verseTextIn(version: BibleVersion, reference: string): string | null {
  const p = parseRef(reference, version);
  if (!p || p.verse == null) return null;
  const all = chapterText(version, p.book, p.chapter);
  const out = all.slice(p.verse - 1, p.end ?? p.verse).map((t) => (t ?? '').trim()).filter(Boolean);
  return out.length ? out.join(' ') : null;
}

/** Deja el versículo del día en la Biblia de la iglesia. Devuelve el mismo objeto con `verse` y `bible` (la sigla). */
export async function localizeDaily<T extends { reference: string; verse: string; bible?: string | null }>(d: T): Promise<T> {
  if (asWritten) return { ...d, bible: WRITTEN_SHORT };
  try {
    const version = churchDefault(VERSIONS, getChurchBible());
    const p = parseRef(d.reference);
    if (!p || p.verse == null) return { ...d, bible: WRITTEN_SHORT };
    await ensureBook(version, p.book);
    const text = verseTextIn(version, d.reference);
    return text ? { ...d, verse: text, bible: version.short } : { ...d, bible: WRITTEN_SHORT };
  } catch {
    return { ...d, bible: WRITTEN_SHORT };
  }
}
