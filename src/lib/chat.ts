// Chats en vivo: el de toda la iglesia y el de los que están en salida de evangelismo.
import { supabase } from './supabase';
import type { ChatAttachment } from './files';

export type ChatRoomKind = 'church' | 'outing';
export type ChatMessage = {
  id: string; user_id: string; name: string; photo_path: string | null; body: string; created_at: string; mine: boolean;
  kind: 'text' | 'image' | 'file' | 'poll'; attachment_path: string | null; attachment_name: string | null; attachment_size: number | null;
};
export type PollOption = { message_id: string; option_id: string; sort: number; label: string; votes: number; mine: boolean; multiple: boolean; closes_at: string | null; voters: number };

const TABLE: Record<ChatRoomKind, string> = { church: 'church_chat_messages', outing: 'outing_chat_messages' };
const LIST: Record<ChatRoomKind, string> = { church: 'church_chat_list', outing: 'outing_chat_list' };
export const chatTable = (room: ChatRoomKind) => TABLE[room];

/** Mensajes del más nuevo al más viejo. */
export async function chatList(room: ChatRoomKind, before?: string | null): Promise<ChatMessage[]> {
  const { data, error } = await supabase.rpc(LIST[room], { p_before: before ?? null, p_limit: 60 });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function chatSend(room: ChatRoomKind, body: string): Promise<void> {
  const { error } = await supabase.from(TABLE[room]).insert({ body: body.trim().slice(0, 1000) });
  if (error) throw error;
}

export async function chatSendAttachment(room: ChatRoomKind, a: ChatAttachment, caption = ''): Promise<void> {
  const { error } = await supabase.from(TABLE[room]).insert({
    kind: a.kind, body: caption.trim().slice(0, 1000), attachment_path: a.path, attachment_name: a.name, attachment_size: a.size || null,
  });
  if (error) throw error;
}

export async function chatDelete(room: ChatRoomKind, id: string): Promise<void> {
  const { error } = await supabase.from(TABLE[room]).delete().eq('id', id);
  if (error) throw error;
}

// ---------- Encuestas (solo en el chat de la iglesia) ----------
export async function createPoll(question: string, options: string[], multiple: boolean, closesAt: Date | null): Promise<void> {
  const { error } = await supabase.rpc('create_chat_poll', { p_question: question, p_options: options, p_multiple: multiple, p_closes_at: closesAt ? closesAt.toISOString() : null });
  if (error) throw error;
}

export async function votePoll(optionId: string): Promise<void> {
  const { error } = await supabase.rpc('vote_chat_poll', { p_option: optionId });
  if (error) throw error;
}

export async function pollResults(messageIds: string[]): Promise<Record<string, PollOption[]>> {
  if (!messageIds.length) return {};
  const { data, error } = await supabase.rpc('chat_poll_results', { p_messages: messageIds });
  if (error) throw error;
  const out: Record<string, PollOption[]> = {};
  for (const r of (data ?? []) as PollOption[]) (out[r.message_id] ??= []).push(r);
  return out;
}
