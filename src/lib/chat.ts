// Chats en vivo: el de toda la iglesia y el de los que están en salida de evangelismo.
import { supabase } from './supabase';

export type ChatRoomKind = 'church' | 'outing';
export type ChatMessage = { id: string; user_id: string; name: string; photo_path: string | null; body: string; created_at: string; mine: boolean };

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

export async function chatDelete(room: ChatRoomKind, id: string): Promise<void> {
  const { error } = await supabase.from(TABLE[room]).delete().eq('id', id);
  if (error) throw error;
}
