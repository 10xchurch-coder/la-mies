// Lo que la persona marca en su Biblia: resaltados de color, notas y versículos guardados.
// Va por libro, capítulo y versículo (no por versión): se ve igual en cualquier versión.
import { supabase } from './supabase';
import { tx } from './i18n';

export type BibleMark = { book: number; chapter: number; verse: number; color: string | null; note: string | null; saved: boolean; updated_at?: string };

/** Las marcas de un capítulo, por número de versículo. */
export async function chapterMarks(book: number, chapter: number): Promise<Record<number, BibleMark>> {
  const r = await supabase.from('bible_marks').select('book, chapter, verse, color, note, saved').eq('book', book).eq('chapter', chapter).limit(400);
  const out: Record<number, BibleMark> = {};
  for (const m of (r.data ?? []) as BibleMark[]) out[m.verse] = m;
  return out;
}

/** Cambia una parte (color, nota o guardado) en varios versículos. Lo que queda vacío del todo se borra. */
export async function setMarks(book: number, chapter: number, current: Record<number, BibleMark>, verses: number[], patch: Partial<Pick<BibleMark, 'color' | 'note' | 'saved'>>): Promise<Record<number, BibleMark>> {
  const next = { ...current };
  const up: BibleMark[] = [];
  const del: number[] = [];
  for (const verse of verses) {
    const m: BibleMark = { ...(current[verse] ?? { book, chapter, verse, color: null, note: null, saved: false }), ...patch };
    if (m.note != null && !m.note.trim()) m.note = null;
    if (!m.color && !m.note && !m.saved) { del.push(verse); delete next[verse]; } else { up.push(m); next[verse] = m; }
  }
  const { data } = await supabase.auth.getUser();
  const me = data.user?.id;
  if (!me) throw new Error(tx('Sin sesión'));
  if (up.length) {
    const r = await supabase.from('bible_marks').upsert(up.map((m) => ({ profile_id: me, book: m.book, chapter: m.chapter, verse: m.verse, color: m.color, note: m.note, saved: m.saved, updated_at: new Date().toISOString() })), { onConflict: 'profile_id,book,chapter,verse' });
    if (r.error) throw r.error;
  }
  if (del.length) {
    const r = await supabase.from('bible_marks').delete().eq('profile_id', me).eq('book', book).eq('chapter', chapter).in('verse', del);
    if (r.error) throw r.error;
  }
  return next;
}

/** Todo lo que marcó la persona, lo más nuevo primero. */
export async function myMarks(): Promise<BibleMark[]> {
  const r = await supabase.from('bible_marks').select('book, chapter, verse, color, note, saved, updated_at').order('updated_at', { ascending: false }).limit(2000);
  if (r.error) throw r.error;
  return (r.data ?? []) as BibleMark[];
}
