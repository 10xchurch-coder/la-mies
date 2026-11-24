// Alta de una iglesia nueva: lo que se pide a la base. Crear iglesias e invitar pastores lo decide la base (0080):
// solo el administrador de la red, o quien trae una invitación válida y sin usar.
import { supabase } from './supabase';
import type { Profile } from '@/types';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

export type NetworkChurch = {
  id: string; name: string; city: string | null; timezone: string; created_at: string; accounts: number; pastors: number;
  setup_pending: boolean; join_code: string | null; invite_expires_at: string | null;
};

export const networkChurches = async () => (ok(await supabase.rpc('admin_network_churches')) ?? []) as NetworkChurch[];

export async function createChurch(o: { name: string; city: string; timezone: string; joinCode: string }): Promise<{ church_id: string; join_code: string }> {
  return ok(await supabase.rpc('admin_create_church', { p_name: o.name, p_city: o.city, p_timezone: o.timezone, p_join_code: o.joinCode || null })) as { church_id: string; join_code: string };
}
/** Devuelve el código de la invitación. Se ve una sola vez: la base no lo guarda. */
export const createPastorInvite = async (churchId: string, days: number) => ok(await supabase.rpc('admin_create_pastor_invite', { p_church: churchId, p_days: days })) as string;
export const revokePastorInvites = async (churchId: string) => { ok(await supabase.rpc('admin_revoke_pastor_invites', { p_church: churchId })); };

/** Usar la invitación de pastor al crear la cuenta. */
export async function acceptPastorInvite(token: string, name: string, phone: string): Promise<Profile> {
  return ok(await supabase.rpc('admin_accept_pastor_invite', { p_token: token, p_display_name: name, p_phone: phone })) as Profile;
}

export async function saveSetup(o: { step?: number; done?: boolean; motto?: string | null }): Promise<void> {
  ok(await supabase.rpc('admin_setup_save', { p_step: o.step ?? null, p_done: !!o.done, p_motto: o.motto ?? null }));
}
