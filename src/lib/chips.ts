// Chips de las personas (asistencia de los domingos) y etiquetas de los chicos (entrada y retiro).
// La clave de cada chip es al azar y vive en la base: el chip no lleva el nombre ni el número de nadie.
import { supabase } from './supabase';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

// ---------- Chips de las personas ----------
export type PersonChip = { id: string; contact_id: string; name: string; photo_path: string | null; label: string | null; created_at: string; last_used_at: string | null };
/** Crea la clave de un chip nuevo. Es la única vez que la app ve la clave: hay que grabarla enseguida. */
export const newPersonChip = async (contact: string, label: string | null) =>
  ok(await supabase.rpc('person_chip_new', { p_contact: contact, p_label: label })) as { id: string; token: string; name: string };
export const revokePersonChip = async (id: string) => { ok(await supabase.rpc('person_chip_revoke', { p_id: id })); };
export const personChips = async (contact?: string | null) => (ok(await supabase.rpc('person_chips_list', { p_contact: contact ?? null })) ?? []) as PersonChip[];
/** La persona apoyó su chip: queda presente. Por dentro usa set_attendance, igual que la pantalla de Asistencia. */
export const chipAttendance = async (token: string, date: string, service: string) =>
  ok(await supabase.rpc('chip_attendance', { p_token: token, p_date: date, p_service: service })) as { contact_id: string; name: string; photo_path: string | null; already: boolean };

// ---------- Etiquetas de los chicos ----------
export type ChildTags = { checkin_id: string; code: string; child_tag: string; pickup_tag: string; room: string; name: string };
/** Entrada del chico con sus dos etiquetas (la del chico y la del adulto). */
export const checkInChildTags = async (child: string, room: string, broughtBy: string | null) =>
  ok(await supabase.rpc('child_checkin_tags', { p_child: child, p_room: room, p_brought_by: broughtBy })) as ChildTags;
export const childTags = async (checkin: string) => ok(await supabase.rpc('child_tags', { p_checkin: checkin })) as ChildTags;
export type PickupAnswer = { matched: boolean; name: string; child_id?: string; siblings?: { checkin_id: string; name: string }[] };
/** Retiro: `child` es la entrada del chico (de la lista) o la clave de su etiqueta; `adult`, el código o la clave de la etiqueta del adulto. */
export const pickupChild = async (child: string, adult: string) => ok(await supabase.rpc('child_pickup', { p_child: child, p_adult: adult })) as PickupAnswer;
