// Alta de una iglesia que se anota sola: lo que se pide a la base (0084). Todo lo decide la base:
// quién puede crear una iglesia, quién ve las iglesias nuevas y quién puede importar en otra iglesia.
import { supabase } from './supabase';
import { cleanFacts, type Facts, type SavedSteps, type SignupDraft, type SignupStatus, type StepKey, type StepState } from './alta';
import type { SendRow, ServerCode } from './importSmart';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** Crea la iglesia y deja a esta cuenta como su pastor. Solo sirve para una cuenta nueva, con el correo confirmado y sin iglesia. */
export async function selfServeCreate(f: SignupDraft, timezone: string): Promise<{ church_id: string; join_code: string }> {
  return ok(await supabase.rpc('alta_selfserve_create', {
    p_church: f.church, p_city: f.city, p_province: f.province, p_country: f.country, p_pastor: f.pastor,
    p_whatsapp: f.whatsapp, p_size: f.size || null, p_timezone: timezone,
  })) as { church_id: string; join_code: string };
}

export type AltaState = { steps: SavedSteps; import_help_at: string | null; selfserve: boolean; status: string; facts: Facts };
export async function altaState(): Promise<AltaState> {
  const d = ok(await supabase.rpc('alta_state')) as Record<string, unknown>;
  return { steps: (d.steps ?? {}) as SavedSteps, import_help_at: (d.import_help_at as string | null) ?? null, selfserve: !!d.selfserve, status: String(d.status ?? 'ok'), facts: cleanFacts(d.facts) };
}
export const setStep = async (key: StepKey, state: StepState) => (ok(await supabase.rpc('alta_step_set', { p_key: key, p_state: state })) ?? {}) as SavedSteps;
export const requestImportHelp = async (on: boolean) => ok(await supabase.rpc('alta_request_import_help', { p_on: on })) as string | null;

/** 'suspended' si el equipo de La Mies suspendió la iglesia. Si no se puede saber (sin señal, base vieja), se sigue normal. */
export async function churchStatus(): Promise<'ok' | 'suspended'> {
  const { data, error } = await supabase.rpc('alta_church_status');
  return !error && data === 'suspended' ? 'suspended' : 'ok';
}

// ---------- Para el equipo de La Mies ----------
export type NetSignup = {
  church_id: string; name: string; city: string | null; province: string | null; country: string; pastor_name: string; email: string; whatsapp: string;
  size_hint: string | null; status: SignupStatus; created_at: string; reviewed_at: string | null; suspended_at: string | null; suspend_reason: string | null;
  steps: SavedSteps; import_help_at: string | null; setup_done: boolean | null; facts: Facts;
};
export async function netSignups(): Promise<NetSignup[]> {
  const d = (ok(await supabase.rpc('alta_net_signups')) ?? []) as Record<string, unknown>[];
  return d.map((r) => ({ ...(r as unknown as NetSignup), facts: cleanFacts(r.facts) }));
}
export const netSetStatus = async (church: string, status: SignupStatus, reason?: string) => { ok(await supabase.rpc('alta_net_set_status', { p_church: church, p_status: status, p_reason: reason ?? null })); };

// ---------- Importar ----------
export type ImportResult = { new: number; merged: number; duplicates: number; invalid: number; committed: boolean; rows: ServerCode[]; batch: string | null };
export async function importRows(o: { rows: SendRow[]; status: 'member' | 'visitor' | 'contact'; mode: 'skip' | 'merge'; commit: boolean; batch?: string | null; church?: string | null; file?: string | null }): Promise<ImportResult> {
  return ok(await supabase.rpc('alta_import', {
    p_rows: o.rows, p_status: o.status, p_mode: o.mode, p_commit: o.commit, p_batch: o.batch ?? null, p_church: o.church ?? null, p_file: o.file ?? null,
  })) as ImportResult;
}
export const batchUndo = async (batch: string, on = true) => { ok(await supabase.rpc('alta_batch_undo', { p_batch: batch, p_on: on })); };

export type ImportBatch = { id: string; file_name: string | null; status: string; added: number; merged: number; skipped: number; invalid: number; by_network: boolean; created_at: string; undo_at: string | null };
export async function listBatches(): Promise<ImportBatch[]> {
  return (ok(await supabase.from('alta_import_batches').select('id, file_name, status, added, merged, skipped, invalid, by_network, created_at, undo_at').order('created_at', { ascending: false }).limit(30)) ?? []) as ImportBatch[];
}
export type BatchContact = { id: string; name: string; phone: string | null; status: string; created_at: string; updated_at: string; profile_id: string | null };
export async function batchContacts(batch: string): Promise<BatchContact[]> {
  return (ok(await supabase.from('contacts').select('id, name, phone, status, created_at, updated_at, profile_id').eq('import_batch', batch).order('name').limit(3000)) ?? []) as BatchContact[];
}

/** Un número nuevo para cada importación. */
export function newBatchId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.floor(Math.random() * 16); return (ch === 'x' ? r : (r % 4) + 8).toString(16); });
}
