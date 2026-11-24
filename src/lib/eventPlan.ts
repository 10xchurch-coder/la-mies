// Planificador de eventos: entradas, programa, oradores, equipo, tareas, avisos y la página pública.
import { supabase } from './supabase';
import { WEB_URL } from './share';
import type { DoorTotals, ScanResult } from './tags';

export type TicketType = { id: string; event_id: string; name: string; description: string | null; price: number; capacity: number | null; color: string | null; sort: number; active: boolean; pay_url: string | null };
export type Speaker = { id: string; event_id: string; name: string; role: string | null; bio: string | null; sort: number };
export type Session = { id: string; event_id: string; starts_at: string; ends_at: string | null; title: string; description: string | null; place: string | null; speaker_id: string | null };
/** kind: 'organizer' puede cambiar el evento; 'volunteer' solo sirve en un turno. */
export type TeamRow = { event_id: string; profile_id: string; role: string | null; kind: 'organizer' | 'volunteer' };
export type EventTask = { id: string; event_id: string; title: string; done: boolean; assignee_id: string | null; due_on: string | null };
export type EventUpdate = { id: string; body: string; created_at: string };
export type PlanStats = { registrations: number; people: number; checked_in: number; paid: number; expected: number; web: number; door: number };
export type PlanReg = {
  id: string; name: string; phone: string | null; email: string | null; people: number; ticket_code: string; type_name: string | null;
  price: number; paid_amount: number; checked_in_at: string | null; source: string; walk_in: boolean; created_at: string;
  checked_out_at: string | null; entrance: string | null; chip_at: string | null;
};
export type Recording = { title: string; url: string };
export type PlanEvent = {
  id: string; title: string; starts_at: string; ends_at: string | null; place: string | null; registration: boolean; reg_price: number | null; reg_capacity: number | null;
  slug: string | null; public_page: boolean; stream_url: string | null; stream_access: 'all' | 'registered' | 'paid'; recordings: Recording[]; pay_info: string | null; faq: string | null; pay_url: string | null;
};

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

const EV_COLS = 'id, title, starts_at, ends_at, place, registration, reg_price, reg_capacity, slug, public_page, stream_url, stream_access, recordings, pay_info, faq, pay_url';
export const planEvent = async (id: string) => ok(await supabase.from('events').select(EV_COLS).eq('id', id).maybeSingle()) as unknown as PlanEvent | null;
export const updatePlanEvent = async (id: string, patch: Partial<PlanEvent>) => { ok(await supabase.from('events').update(patch).eq('id', id)); };
export const canPlan = async (id: string) => !!ok(await supabase.rpc('can_plan_event', { p_event: id }));

export async function planStats(id: string): Promise<PlanStats> {
  const rows = ok(await supabase.rpc('event_plan_stats', { p_event: id })) as PlanStats[] | null;
  const r = rows?.[0];
  return { registrations: r?.registrations ?? 0, people: r?.people ?? 0, checked_in: r?.checked_in ?? 0, paid: Number(r?.paid ?? 0), expected: Number(r?.expected ?? 0), web: r?.web ?? 0, door: r?.door ?? 0 };
}
export const planRegs = async (id: string, q: string, offset: number) =>
  (ok(await supabase.rpc('event_plan_registrations_v2', { p_event: id, p_q: q || null, p_offset: offset, p_limit: 50 })) ?? []) as PlanReg[];
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
export const team = async (id: string) => (ok(await supabase.from('event_team').select('event_id, profile_id, role, kind').eq('event_id', id)) ?? []) as TeamRow[];

export async function saveRow(table: Table, row: Record<string, unknown> & { id?: string; event_id: string }): Promise<void> {
  const { id, ...rest } = row;
  ok(id ? await supabase.from(table).update(rest).eq('id', id) : await supabase.from(table).insert(rest));
}
export const removeRow = async (table: Table, id: string) => { ok(await supabase.from(table).delete().eq('id', id)); };
export const setTeam = async (eventId: string, profileId: string, role: string | null) => { ok(await supabase.from('event_team').upsert({ event_id: eventId, profile_id: profileId, role, kind: 'organizer' })); };
/** Saca a alguien de los organizadores. Si tiene turnos para servir, queda como voluntario (así no pierde sus turnos). */
export const removeTeam = async (eventId: string, profileId: string) => {
  const has = ok(await supabase.from('event_shifts').select('id').eq('event_id', eventId).eq('profile_id', profileId).is('cancelled_at', null).limit(1)) ?? [];
  if (has.length) ok(await supabase.from('event_team').update({ kind: 'volunteer' }).eq('event_id', eventId).eq('profile_id', profileId));
  else ok(await supabase.from('event_team').delete().eq('event_id', eventId).eq('profile_id', profileId));
};

/** El enlace de la página pública del evento (se abre sin la app y sin cuenta). */
export const publicUrl = (slug: string, token?: string | null) => `${WEB_URL}/e/${slug}${token ? `?t=${token}` : ''}`;

// ---------- La página pública ----------
export type PublicEvent = {
  church: { name: string; logo: string | null; tz: string };
  event: {
    title: string; starts_at: string; ends_at: string | null; all_day: boolean; place: string | null; description: string | null; cost: string | null; transport: string | null;
    bring: string | null; program: string | null; faq: string | null; pay_info: string | null; pay_url?: string | null; contact_name: string | null; contact_phone: string | null;
    registration: boolean; price: number | null; left: number | null; stream_access: 'all' | 'registered' | 'paid'; has_stream: boolean; has_recordings: boolean;
  };
  types: { id: string; name: string; description: string | null; price: number; color: string | null; left: number | null; pay_url?: string | null }[];
  speakers: { id: string; name: string; role: string | null; bio: string | null }[];
  sessions: { id: string; starts_at: string; ends_at: string | null; title: string; description: string | null; place: string | null; speaker_id: string | null }[];
  updates: { body: string; at: string }[];
  stream: { url: string | null; recordings: Recording[] } | null;
  ticket: { name: string; people: number; code: string; token: string; type: string | null; to_pay: number; paid_amount: number; paid: boolean; checked_in: boolean; pay_url?: string | null } | null;
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

/** ¿Sirve como enlace de pago? Tiene que ser una dirección completa que empiece con https:// */
export const validPayUrl = (u: string): boolean => /^https:\/\/\S+$/i.test(u.trim()) && u.trim().length <= 500;

// ---------- La puerta: entrada, salida y contador en vivo ----------
export type ScanAnswer = { id: string; name: string; people: number; event_id: string; event_title: string | null; occurs_on: string; result: ScanResult };
/** Lee una credencial en la puerta (por el código del QR o del chip, o eligiendo a la persona). `out`: está saliendo. */
export const doorScan = async (by: { code?: string; reg?: string }, entrance: string | null, out = false) =>
  ok(await supabase.rpc('event_door_scan', { p_code: by.code ?? null, p_reg: by.reg ?? null, p_entrance: entrance || null, p_out: out })) as ScanAnswer;
export const doorWalkin = async (eventId: string, on: string, name: string, phone: string | null, people: number, entrance: string | null) =>
  ok(await supabase.rpc('event_door_walkin', { p_event: eventId, p_on: on, p_name: name, p_phone: phone, p_people: people, p_entrance: entrance || null })) as { id: string; name: string; ticket_code: string; already: boolean };
export type DoorLive = DoorTotals & { capacity: number | null; at: string };
/** Los números de la puerta en este momento. Null si no tenés permiso. */
export const doorLive = async (eventId: string, on: string) => ok(await supabase.rpc('event_door_live', { p_event: eventId, p_on: on })) as DoorLive | null;
export const markChip = async (reg: string) => { ok(await supabase.rpc('event_mark_chip', { p_reg: reg })); };

// ---------- Quién estuvo en cada momento del programa ----------
export type SessionCount = { session_id: string; registrations: number; people: number };
export type SessionPerson = { registration_id: string; name: string; people: number; scanned_at: string };
export const sessionScan = async (session: string, by: { code?: string; reg?: string }) =>
  ok(await supabase.rpc('event_session_scan', { p_session: session, p_code: by.code ?? null, p_reg: by.reg ?? null })) as { id: string; name: string; people: number; session_title: string; result: 'ok' | 'already' };
export const sessionCounts = async (eventId: string) => (ok(await supabase.rpc('event_session_counts', { p_event: eventId })) ?? []) as SessionCount[];
export const sessionPeople = async (session: string) => (ok(await supabase.rpc('event_session_people', { p_session: session })) ?? []) as SessionPerson[];

// ---------- Turnos de voluntarios ----------
export type Shift = { id: string; event_id: string; profile_id: string; place: string; starts_at: string; ends_at: string | null; note: string | null };
const SHIFT_COLS = 'id, event_id, profile_id, place, starts_at, ends_at, note';
export const shifts = async (eventId: string) =>
  (ok(await supabase.from('event_shifts').select(SHIFT_COLS).eq('event_id', eventId).is('cancelled_at', null).order('starts_at')) ?? []) as Shift[];
/** Mis turnos para servir en este evento. */
export const myShifts = async (eventId: string, me: string) =>
  (ok(await supabase.from('event_shifts').select(SHIFT_COLS).eq('event_id', eventId).eq('profile_id', me).is('cancelled_at', null).order('starts_at')) ?? []) as Shift[];
export const saveShift = async (x: { id?: string; event_id: string; profile_id: string; place: string; starts_at: string; ends_at: string | null; note: string | null }) =>
  ok(await supabase.rpc('event_shift_save', { p_event: x.event_id, p_profile: x.profile_id, p_place: x.place, p_starts: x.starts_at, p_ends: x.ends_at, p_note: x.note, p_id: x.id ?? null })) as string;
export const cancelShift = async (id: string) => { ok(await supabase.rpc('event_shift_cancel', { p_id: id })); };
