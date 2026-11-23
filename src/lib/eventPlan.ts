// Planificador de eventos: entradas, programa, oradores, equipo, tareas, avisos y la página pública.
import { supabase } from './supabase';
import { WEB_URL } from './share';

export type TicketType = { id: string; event_id: string; name: string; description: string | null; price: number; capacity: number | null; color: string | null; sort: number; active: boolean };
export type Speaker = { id: string; event_id: string; name: string; role: string | null; bio: string | null; sort: number };
export type Session = { id: string; event_id: string; starts_at: string; ends_at: string | null; title: string; description: string | null; place: string | null; speaker_id: string | null };
export type TeamRow = { event_id: string; profile_id: string; role: string | null };
export type EventTask = { id: string; event_id: string; title: string; done: boolean; assignee_id: string | null; due_on: string | null };
export type EventUpdate = { id: string; body: string; created_at: string };
export type PlanStats = { registrations: number; people: number; checked_in: number; paid: number; expected: number; web: number; door: number };
export type PlanReg = {
  id: string; name: string; phone: string | null; email: string | null; people: number; ticket_code: string; type_name: string | null;
  price: number; paid_amount: number; checked_in_at: string | null; source: string; walk_in: boolean; created_at: string;
};
export type Recording = { title: string; url: string };
export type PlanEvent = {
  id: string; title: string; starts_at: string; ends_at: string | null; place: string | null; registration: boolean; reg_price: number | null; reg_capacity: number | null;
  slug: string | null; public_page: boolean; stream_url: string | null; stream_access: 'all' | 'registered' | 'paid'; recordings: Recording[]; pay_info: string | null; faq: string | null;
};

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

const EV_COLS = 'id, title, starts_at, ends_at, place, registration, reg_price, reg_capacity, slug, public_page, stream_url, stream_access, recordings, pay_info, faq';
export const planEvent = async (id: string) => ok(await supabase.from('events').select(EV_COLS).eq('id', id).maybeSingle()) as unknown as PlanEvent | null;
export const updatePlanEvent = async (id: string, patch: Partial<PlanEvent>) => { ok(await supabase.from('events').update(patch).eq('id', id)); };
export const canPlan = async (id: string) => !!ok(await supabase.rpc('can_plan_event', { p_event: id }));

export async function planStats(id: string): Promise<PlanStats> {
  const rows = ok(await supabase.rpc('event_plan_stats', { p_event: id })) as PlanStats[] | null;
  const r = rows?.[0];
  return { registrations: r?.registrations ?? 0, people: r?.people ?? 0, checked_in: r?.checked_in ?? 0, paid: Number(r?.paid ?? 0), expected: Number(r?.expected ?? 0), web: r?.web ?? 0, door: r?.door ?? 0 };
}
export const planRegs = async (id: string, q: string, offset: number) =>
  (ok(await supabase.rpc('event_plan_registrations', { p_event: id, p_q: q || null, p_offset: offset, p_limit: 50 })) ?? []) as PlanReg[];
export const setPaid = async (reg: string, amount: number) => { ok(await supabase.rpc('event_set_paid', { p_reg: reg, p_amount: amount })); };
export const setPublic = async (id: string, on: boolean) => ok(await supabase.rpc('event_set_public', { p_event: id, p_on: on })) as string;
export const postUpdate = async (id: string, body: string) => { ok(await supabase.rpc('event_post_update', { p_event: id, p_body: body })); };

type Table = 'event_ticket_types' | 'event_speakers' | 'event_sessions' | 'event_tasks' | 'event_updates';
async function list<T>(table: Table, eventId: string, order: string, asc = true): Promise<T[]> {
  return (ok(await supabase.from(table).select('*').eq('event_id', eventId).order(order, { ascending: asc })) ?? []) as T[];
}
export const ticketTypes = (id: string) => list<TicketType>('event_ticket_types', id, 'sort');
export const speakers = (id: string) => list<Speaker>('event_speakers', id, 'sort');
export const sessions = (id: string) => list<Session>('event_sessions', id, 'starts_at');
export const tasks = (id: string) => list<EventTask>('event_tasks', id, 'created_at');
export const updates = (id: string) => list<EventUpdate>('event_updates', id, 'created_at', false);
export const team = async (id: string) => (ok(await supabase.from('event_team').select('event_id, profile_id, role').eq('event_id', id)) ?? []) as TeamRow[];

export async function saveRow(table: Table, row: Record<string, unknown> & { id?: string; event_id: string }): Promise<void> {
  const { id, ...rest } = row;
  ok(id ? await supabase.from(table).update(rest).eq('id', id) : await supabase.from(table).insert(rest));
}
export const removeRow = async (table: Table, id: string) => { ok(await supabase.from(table).delete().eq('id', id)); };
export const setTeam = async (eventId: string, profileId: string, role: string | null) => { ok(await supabase.from('event_team').upsert({ event_id: eventId, profile_id: profileId, role })); };
export const removeTeam = async (eventId: string, profileId: string) => { ok(await supabase.from('event_team').delete().eq('event_id', eventId).eq('profile_id', profileId)); };

/** El enlace de la página pública del evento (se abre sin la app y sin cuenta). */
export const publicUrl = (slug: string, token?: string | null) => `${WEB_URL}/e/${slug}${token ? `?t=${token}` : ''}`;

// ---------- La página pública ----------
export type PublicEvent = {
  church: { name: string; logo: string | null; tz: string };
  event: {
    title: string; starts_at: string; ends_at: string | null; all_day: boolean; place: string | null; description: string | null; cost: string | null; transport: string | null;
    bring: string | null; program: string | null; faq: string | null; pay_info: string | null; contact_name: string | null; contact_phone: string | null;
    registration: boolean; price: number | null; left: number | null; stream_access: 'all' | 'registered' | 'paid'; has_stream: boolean; has_recordings: boolean;
  };
  types: { id: string; name: string; description: string | null; price: number; color: string | null; left: number | null }[];
  speakers: { id: string; name: string; role: string | null; bio: string | null }[];
  sessions: { id: string; starts_at: string; ends_at: string | null; title: string; description: string | null; place: string | null; speaker_id: string | null }[];
  updates: { body: string; at: string }[];
  stream: { url: string | null; recordings: Recording[] } | null;
  ticket: { name: string; people: number; code: string; token: string; type: string | null; to_pay: number; paid_amount: number; paid: boolean; checked_in: boolean } | null;
};
export const publicEvent = async (slug: string, token?: string | null) => ok(await supabase.rpc('event_public', { p_slug: slug, p_token: token ?? null })) as PublicEvent | null;
export const publicRegister = async (slug: string, r: { name: string; phone: string; email: string; people: number; type: string | null }) =>
  ok(await supabase.rpc('event_public_register', { p_slug: slug, p_name: r.name, p_phone: r.phone, p_email: r.email || null, p_people: r.people, p_type: r.type })) as { token: string; code: string; already: boolean };

/** "09:30" + la fecha del evento → fecha y hora completas. Null si la hora está mal escrita. */
export function atTime(dayISO: string, hhmm: string): string | null {
  const m = /^(\d{1,2})[:.h]?(\d{2})?$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] ?? 0);
  if (h > 23 || mi > 59) return null;
  const d = new Date(`${dayISO}T00:00:00`);
  d.setHours(h, mi, 0, 0);
  return d.toISOString();
}
