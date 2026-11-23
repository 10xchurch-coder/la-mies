// Mensajes privados entre dos hermanos de la iglesia. Solo los ven los dos.
import { supabase } from './supabase';
import type { ChatAttachment } from './files';

export type DmMessage = {
  id: string; body: string; kind: 'text' | 'image' | 'file'; attachment_path: string | null; attachment_name: string | null; attachment_size: number | null;
  created_at: string; mine: boolean; read_at: string | null;
};
export type DmThreadRow = {
  other_id: string; name: string; photo_path: string | null; last_body: string; last_kind: 'text' | 'image' | 'file'; last_name: string | null;
  last_at: string; last_mine: boolean; unread: number;
};
export type DmPerson = { id: string; name: string; photo_path: string | null; title: string | null; i_blocked: boolean };
export type DmReport = { id: string; reporter: string; sender: string; sender_id: string; body: string; reason: string | null; created_at: string; resolved_at: string | null };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const dmInbox = async () => (await rpc<DmThreadRow[] | null>('dm_inbox')) ?? [];
export const dmThread = async (withId: string) => (await rpc<DmMessage[] | null>('dm_thread', { p_with: withId })) ?? [];
export const dmPeople = async () => (await rpc<DmPerson[] | null>('dm_people')) ?? [];
export const dmUnread = async () => Number((await rpc<number | null>('dm_unread')) ?? 0);
export const dmRead = (withId: string) => rpc<void>('dm_read', { p_with: withId });
export const dmSend = (to: string, body: string) => rpc<string>('dm_send', { p_to: to, p_body: body });
export const dmSendAttachment = (to: string, a: ChatAttachment, caption = '') =>
  rpc<string>('dm_send', { p_to: to, p_body: caption, p_kind: a.kind, p_path: a.path, p_name: a.name, p_size: a.size || null });
export const dmDelete = (id: string) => rpc<void>('dm_delete', { p_id: id });
export const dmBlock = (user: string, on: boolean) => rpc<void>('dm_block', { p_user: user, p_on: on });
export const dmReport = (messageId: string, reason: string) => rpc<void>('dm_report', { p_message: messageId, p_reason: reason });
export const dmReports = async () => (await rpc<DmReport[] | null>('dm_reports_list')) ?? [];
export const dmReportResolve = (id: string) => rpc<void>('dm_report_resolve', { p_id: id });

/** Lo que se muestra en la lista como último mensaje. */
export function dmPreview(r: Pick<DmThreadRow, 'last_body' | 'last_kind' | 'last_name'>): string {
  if (r.last_kind === 'image') return `📷 Foto${r.last_body ? ` · ${r.last_body}` : ''}`;
  if (r.last_kind === 'file') return /^voz-/i.test(r.last_name ?? '') ? '🎤 Mensaje de voz' : `📄 ${r.last_name ?? 'Documento'}`;
  return r.last_body;
}
