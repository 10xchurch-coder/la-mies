// Ofrendas por persona: lo que se lee y se guarda en la base. Las reglas de quién ve qué están en la base (0080).
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { downloadText, fileSlug } from './download';
import type { GivingMethod, GivingRow, StatementLine } from './giving';
import { tx } from './i18n';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}
const COLS = 'id, contact_id, person_name, fund_id, on_date, amount, currency, method, note, created_by, created_at, voided_at, void_reason';
const num = (r: GivingRow): GivingRow => ({ ...r, amount: Number(r.amount) });

export type GivingFund = { id: string; name: string; currency: string; active: boolean };
export type GivingPerson = { id: string; name: string; status: string };

export const givingFunds = async () => (ok(await supabase.from('fin_funds').select('id, name, currency, active').order('sort_order')) ?? []) as GivingFund[];

/** Las ofrendas de un año (todas, o las de una persona). De a 1000 por si son muchas. */
export async function listGiving(year: number, contactId?: string | null): Promise<GivingRow[]> {
  const out: GivingRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('admin_giving').select(COLS).gte('on_date', `${year}-01-01`).lte('on_date', `${year}-12-31`);
    if (contactId) q = q.eq('contact_id', contactId);
    const rows = (ok(await q.order('on_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, from + 999)) ?? []) as GivingRow[];
    out.push(...rows.map(num));
    if (rows.length < 1000) break;
  }
  return out;
}

export async function addGiving(g: { contact_id: string; fund_id: string; on_date: string; amount: number; method: GivingMethod; note: string | null }): Promise<void> {
  ok(await supabase.from('admin_giving').insert(g));
}
export async function voidGiving(id: string, reason: string): Promise<void> {
  ok(await supabase.from('admin_giving').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', id));
}
export const searchGivingPeople = async (q: string) => (ok(await supabase.rpc('admin_giving_people', { p_q: q || null })) ?? []) as GivingPerson[];

/** "Mis ofrendas": lo propio. Si la iglesia no lo prendió, la base contesta con un error. */
export async function myGiving(): Promise<StatementLine[]> {
  const rows = (ok(await supabase.rpc('admin_my_giving', { p_year: null })) ?? []) as (StatementLine & { id: string })[];
  return rows.map((r) => ({ on_date: r.on_date, amount: Number(r.amount), currency: r.currency, method: r.method, fund: r.fund, note: r.note }));
}

export type ChurchExtras = {
  my_giving_on: boolean; motto: string | null; setup_pending: boolean; setup_step: number;
  /** La iglesia se dio de alta con la pantalla de iglesias nuevas (no es la primera, que se cargó a mano). */
  is_new: boolean;
};
const NONE: ChurchExtras = { my_giving_on: false, motto: null, setup_pending: false, setup_step: 0, is_new: false };
/** Los ajustes de la iglesia que agrega esta parte (Mis ofrendas, lema, primeros pasos). Si no hay fila, todo apagado. */
export async function churchExtras(): Promise<ChurchExtras> {
  const { data, error } = await supabase.from('admin_church_settings').select('my_giving_on, motto, setup_pending, setup_step, setup_done_at').maybeSingle();
  if (error || !data) return NONE;
  const d = data as { my_giving_on: boolean; motto: string | null; setup_pending: boolean; setup_step: number; setup_done_at: string | null };
  return { my_giving_on: !!d.my_giving_on, motto: d.motto, setup_pending: !!d.setup_pending, setup_step: d.setup_step ?? 0, is_new: !!d.setup_pending || !!d.setup_done_at };
}
export const setMyGiving = async (on: boolean) => { ok(await supabase.rpc('admin_set_my_giving', { p_on: on })); };

/** Imprime la hoja (web) o la comparte como archivo para abrir e imprimir (teléfono). */
export async function printHtml(title: string, html: string): Promise<void> {
  if (Platform.OS !== 'web') { await downloadText(`${fileSlug(title)}.html`, html, 'text/html'); return; }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) { frame.remove(); throw new Error(tx('No se pudo abrir la hoja para imprimir')); }
  doc.open(); doc.write(html); doc.close();
  const win = frame.contentWindow;
  await new Promise((r) => setTimeout(r, 250));
  win.focus();
  win.print();
  setTimeout(() => frame.remove(), 60000);
}
