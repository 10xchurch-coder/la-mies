// Lo que las pantallas de discipulado, decisiones, visitas nuevas y clase de miembros le piden a la base.
import { supabase } from './supabase';
import type { CareRow, DecisionKind, DecisionState, DiscRow, Done } from './personas';
import { tx } from './i18n';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

// ---------- Ajustes (nombre del curso y lecciones) ----------

export type PeopleSettings = { disc_course_name: string | null; disc_lessons: string[]; member_lessons: string[]; member_final: string | null };
const EMPTY: PeopleSettings = { disc_course_name: null, disc_lessons: [], member_lessons: [], member_final: null };

export async function peopleSettings(): Promise<PeopleSettings> {
  const r = await supabase.from('people_settings').select('disc_course_name, disc_lessons, member_lessons, member_final').maybeSingle();
  return (r.data as PeopleSettings | null) ?? EMPTY;
}

/** Lo que se manda vacío (undefined) no se cambia. */
export async function savePeopleSettings(p: { course?: string; disc?: string[]; member?: string[]; final?: string }): Promise<void> {
  ok(await supabase.rpc('personas_save_settings', { p_course: p.course ?? null, p_disc: p.disc ?? null, p_member: p.member ?? null, p_final: p.final ?? null }));
}

// ---------- Discipulado ----------

export type DiscList = { total: number; lead: boolean; rows: DiscRow[] };
export const discList = async () => ok(await supabase.rpc('personas_disc_list')) as DiscList;
export const discStart = async (contact: string, teacher: string | null) => { ok(await supabase.rpc('personas_disc_start', { p_contact: contact, p_teacher: teacher })); };
export const discTeacher = async (contact: string, teacher: string | null) => { ok(await supabase.rpc('personas_disc_teacher', { p_contact: contact, p_teacher: teacher })); };
export const discLesson = async (contact: string, lesson: number, on: string | null, undo = false) => {
  ok(await supabase.rpc('personas_disc_lesson', { p_contact: contact, p_lesson: lesson, p_on: on, p_undo: undo }));
};
export const discActive = async (contact: string, active: boolean) => { ok(await supabase.rpc('personas_disc_active', { p_contact: contact, p_active: active })); };

/** Los hermanos que pueden enseñar (miembros), para elegir. */
export async function teacherChoices(): Promise<{ id: string; name: string; photo_path: string | null }[]> {
  const r = await supabase.from('contacts').select('id, name, photo_path').eq('archived', false).eq('status', 'member').order('name').limit(1000);
  return (r.data ?? []) as { id: string; name: string; photo_path: string | null }[];
}

/** Todas las personas que esta cuenta puede ver, para elegir a quién anotarle algo. */
export async function personChoices(): Promise<{ id: string; name: string; photo_path: string | null; status: string }[]> {
  const r = await supabase.from('contacts').select('id, name, photo_path, status').eq('archived', false).neq('status', 'inactive').order('name').limit(2000);
  return (r.data ?? []) as { id: string; name: string; photo_path: string | null; status: string }[];
}

// ---------- La ficha de una persona ----------

export type PersonInfo = {
  can: boolean; can_lesson: boolean; staff: boolean; total: number; lessons: Done;
  track: { teacher_id: string | null; teacher_name: string | null; started_on: string; finished_on: string | null; active: boolean; last_met: string | null } | null;
  mclass: { started_on: string; done: Done; final_on: string | null } | null;
  care: { gift_on: string | null; gift_by: string | null; visit_on: string | null; visit_by: string | null } | null;
  decisions: { id: string; kind: DecisionKind; on_date: string; note: string | null }[];
};
export const personInfo = async (contact: string) => ok(await supabase.rpc('personas_person', { p_contact: contact })) as PersonInfo | null;

// ---------- Decisiones ----------

export type DecisionRow = { id: string; contact_id: string; name: string; kind: DecisionKind; on_date: string; note: string | null; mine: boolean };
export const recordDecision = async (contact: string, kind: DecisionKind, on: string | null, note: string) =>
  ok(await supabase.rpc('personas_decision', { p_contact: contact, p_kind: kind, p_on: on, p_note: note.trim() || null })) as DecisionState & { id: string };
export const recentDecisions = async () => ok(await supabase.rpc('personas_decisions_recent')) as DecisionRow[];
/** Borra el renglón de la lista. La ficha de la persona no cambia (sus fechas se corrigen desde la ficha). */
export async function removeDecision(id: string): Promise<void> {
  const r = await supabase.from('decisions').delete().eq('id', id).select('id');
  if (r.error) throw r.error;
  if (!r.data?.length) throw new Error(tx('No tenés permiso para borrar esto.'));
}

// ---------- Regalo de bienvenida y visita ----------

export const careList = async () => ok(await supabase.rpc('personas_care_list')) as CareRow[];
export const careMark = async (contact: string, what: 'gift' | 'visit', undo = false) => {
  ok(await supabase.rpc('personas_care_mark', { p_contact: contact, p_what: what, p_on: null, p_undo: undo }));
};

// ---------- Clase de miembros ----------

export type MemberClassRow = { id: string; name: string; photo_path: string | null; phone: string | null; status: string; started_on: string; done: Done; final_on: string | null };
export const memberClassList = async () => ok(await supabase.rpc('personas_mclass_list')) as MemberClassRow[];
export const memberClassSet = async (contact: string, lesson: number | null, done = true) => {
  ok(await supabase.rpc('personas_mclass_set', { p_contact: contact, p_lesson: lesson, p_done: done, p_on: null }));
};
export const memberClassFinal = async (contact: string, undo = false) => { ok(await supabase.rpc('personas_mclass_final', { p_contact: contact, p_on: null, p_undo: undo })); };
/** Lo saca de la clase (por si se lo anotó por error). Solo el pastor o la secretaría. */
export async function memberClassRemove(contact: string): Promise<void> {
  const r = await supabase.from('member_class').delete().eq('contact_id', contact).select('contact_id');
  if (r.error) throw r.error;
  if (!r.data?.length) throw new Error(tx('Solo el pastor o la secretaría lo pueden sacar de la clase.'));
}

// ---------- Tarjeta de visita (QR de la puerta) ----------

export const visitToken = async (rotate = false) => ok(await supabase.rpc('personas_visit_link', { p_rotate: rotate })) as string;
export type VisitCard = { id: string; contact_id: string | null; name: string; phone: string | null; heard: string | null; prayer: string | null; is_new: boolean; created_at: string };
export async function visitCards(): Promise<VisitCard[]> {
  const r = await supabase.from('visit_cards').select('id, contact_id, name, phone, heard, prayer, is_new, created_at').order('created_at', { ascending: false }).limit(40);
  return (r.data ?? []) as VisitCard[];
}
/** Sin cuenta: lo que ve la visita al abrir el QR. null si el código ya no sirve. */
export const visitCardPublic = async (token: string) => ok(await supabase.rpc('visit_card_public', { p_token: token })) as { church: string; city: string | null; logo: string | null } | null;
export const visitCardSubmit = async (token: string, v: { name: string; phone: string; heard: string; prayer: string }) =>
  ok(await supabase.rpc('visit_card_submit', { p_token: token, p_name: v.name, p_phone: v.phone, p_heard: v.heard || null, p_prayer: v.prayer.trim() || null })) as { ok: boolean; church: string };

// ---------- Certificados ----------

export type CertKind = 'bautismo' | 'miembro';
export type CertData = { name: string; on_date: string; church: string; city: string | null; pastor: string; logo: string | null; number: string };
export const certificate = async (contact: string, kind: CertKind) => ok(await supabase.rpc('personas_certificate', { p_contact: contact, p_kind: kind })) as CertData | null;
