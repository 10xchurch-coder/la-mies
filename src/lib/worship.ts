// Alabanza: canciones, orden del culto y equipo de cada día.
import { supabase } from '@/lib/supabase';

export type Song = {
  id: string; title: string; author: string | null; song_key: string | null; bpm: number | null; themes: string | null;
  lyrics: string | null; chords: string | null; link: string | null; notes: string | null; archived: boolean;
};
export type WorshipPlan = { id: string; on_date: string; service_id: string | null; title: string | null; notes: string | null; published: boolean };
export type ItemKind = 'song' | 'reading' | 'prayer' | 'offering' | 'announcements' | 'special' | 'sermon' | 'other';
export type WorshipItem = { id: string; plan_id: string; sort: number; kind: ItemKind; title: string; song_id: string | null; song_key: string | null; minutes: number | null; who: string | null; note: string | null };
export type TeamRow = { id: string; plan_id: string; profile_id: string; role: string; status: 'pending' | 'yes' | 'no' };
export type SongUsage = { song_id: string; times: number; last_used: string | null };

export const KIND_LABEL: Record<ItemKind, string> = {
  song: 'Canción', reading: 'Lectura bíblica', prayer: 'Oración', offering: 'Ofrenda', announcements: 'Anuncios', special: 'Especial', sermon: 'Predicación', other: 'Otro',
};
export const KIND_ICON: Record<ItemKind, 'music' | 'book-open' | 'heart' | 'gift' | 'volume-2' | 'star' | 'mic' | 'more-horizontal'> = {
  song: 'music', reading: 'book-open', prayer: 'heart', offering: 'gift', announcements: 'volume-2', special: 'star', sermon: 'mic', other: 'more-horizontal',
};
export const ROLES = ['Dirige', 'Voz', 'Coro', 'Piano', 'Guitarra', 'Bajo', 'Batería', 'Sonido', 'Proyección'];

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

export async function worshipAccess(): Promise<{ see: boolean; plan: boolean }> {
  const [a, b] = await Promise.all([supabase.rpc('can_see_worship'), supabase.rpc('can_plan_worship')]);
  return { see: !!a.data, plan: !!b.data };
}
export async function listSongs(): Promise<Song[]> {
  return ok(await supabase.from('songs').select('*').order('title')) ?? [];
}
export async function getSong(id: string): Promise<Song | null> {
  return ok(await supabase.from('songs').select('*').eq('id', id).maybeSingle());
}
export async function saveSong(id: string | null, s: Partial<Song>): Promise<string> {
  if (id) { ok(await supabase.from('songs').update(s).eq('id', id)); return id; }
  return (ok(await supabase.from('songs').insert(s).select('id').single()) as { id: string }).id;
}
export async function songUsage(): Promise<Record<string, SongUsage>> {
  const rows = (ok(await supabase.rpc('song_usage')) ?? []) as SongUsage[];
  return Object.fromEntries(rows.map((r) => [r.song_id, r]));
}
export async function listPlans(): Promise<WorshipPlan[]> {
  return ok(await supabase.from('worship_plans').select('*').order('on_date', { ascending: false }).limit(60)) ?? [];
}
export async function getPlan(id: string): Promise<{ plan: WorshipPlan | null; items: WorshipItem[]; team: TeamRow[] }> {
  const [p, i, t] = await Promise.all([
    supabase.from('worship_plans').select('*').eq('id', id).maybeSingle(),
    supabase.from('worship_items').select('*').eq('plan_id', id).order('sort'),
    supabase.from('worship_team').select('*').eq('plan_id', id),
  ]);
  return { plan: ok(p) as WorshipPlan | null, items: (ok(i) ?? []) as WorshipItem[], team: (ok(t) ?? []) as TeamRow[] };
}
export async function createPlan(onDate: string, serviceId: string | null, title: string | null): Promise<string> {
  return (ok(await supabase.from('worship_plans').insert({ on_date: onDate, service_id: serviceId, title }).select('id').single()) as { id: string }).id;
}
export async function updatePlan(id: string, patch: Partial<WorshipPlan>): Promise<void> { ok(await supabase.from('worship_plans').update(patch).eq('id', id)); }
export async function deletePlan(id: string): Promise<void> { ok(await supabase.from('worship_plans').delete().eq('id', id)); }
export async function copyPlan(id: string, date: string): Promise<string> { return ok(await supabase.rpc('worship_copy', { p_plan: id, p_date: date })) as string; }
export async function addItem(planId: string, item: Partial<WorshipItem>): Promise<void> { ok(await supabase.from('worship_items').insert({ ...item, plan_id: planId })); }
export async function updateItem(id: string, patch: Partial<WorshipItem>): Promise<void> { ok(await supabase.from('worship_items').update(patch).eq('id', id)); }
export async function deleteItem(id: string): Promise<void> { ok(await supabase.from('worship_items').delete().eq('id', id)); }
/** Sube o baja un punto del orden: intercambia el lugar con el vecino. */
export async function moveItem(items: WorshipItem[], index: number, dir: -1 | 1): Promise<void> {
  const a = items[index], b = items[index + dir];
  if (!a || !b) return;
  const sa = a.sort === b.sort ? b.sort + dir : b.sort;
  await Promise.all([updateItem(a.id, { sort: sa }), updateItem(b.id, { sort: a.sort })]);
}
export async function addTeam(planId: string, profileId: string, role: string): Promise<void> { ok(await supabase.from('worship_team').insert({ plan_id: planId, profile_id: profileId, role })); }
export async function removeTeam(id: string): Promise<void> { ok(await supabase.from('worship_team').delete().eq('id', id)); }
export async function answerTeam(id: string, yes: boolean): Promise<void> { ok(await supabase.rpc('worship_answer', { p_team: id, p_yes: yes })); }

/** Minutos totales del culto (lo que tenga duración cargada). */
export const totalMinutes = (items: Pick<WorshipItem, 'minutes'>[]) => items.reduce((n, i) => n + (i.minutes ?? 0), 0);
