// Chats en vivo: el de toda la iglesia, el de los que están en salida de evangelismo y el de cada ministerio.
import { supabase } from './supabase';
import type { ChatAttachment } from './files';

export type ChatRoomKind = 'church' | 'outing' | 'ministry';
export type ChatKind = 'text' | 'image' | 'file' | 'poll' | 'location' | 'live' | 'announcement';
export type ChatMessage = {
  id: string; user_id: string; name: string; photo_path: string | null; body: string; created_at: string; mine: boolean;
  kind: ChatKind; attachment_path: string | null; attachment_name: string | null; attachment_size: number | null;
  lat: number | null; lng: number | null; live_until: string | null; live_updated_at: string | null;
};
export type PollOption = { message_id: string; option_id: string; sort: number; label: string; votes: number; mine: boolean; multiple: boolean; closes_at: string | null; voters: number };
import type { Receipt } from './chatTicks';
export type { Receipt } from './chatTicks';
export type ChatPrivacy = { show_online: boolean; read_receipts: boolean };
export type RoomRef = { room: ChatRoomKind; ministryId?: string | null };

const TABLE: Record<ChatRoomKind, string> = { church: 'church_chat_messages', outing: 'outing_chat_messages', ministry: 'ministry_messages' };
export const chatTable = (room: ChatRoomKind) => TABLE[room];
export const roomKey = (r: RoomRef) => (r.room === 'ministry' ? `ministry:${r.ministryId}` : r.room);

/** Mensajes del más nuevo al más viejo. */
export async function chatList(r: RoomRef, before?: string | null): Promise<ChatMessage[]> {
  const { data, error } = r.room === 'ministry'
    ? await supabase.rpc('ministry_chat_list', { p_ministry: r.ministryId, p_before: before ?? null, p_limit: 60 })
    : await supabase.rpc(r.room === 'church' ? 'church_chat_list' : 'outing_chat_list', { p_before: before ?? null, p_limit: 60 });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

const base = (r: RoomRef) => (r.room === 'ministry' ? { ministry_id: r.ministryId } : {});

export async function chatSend(r: RoomRef, body: string, announce = false): Promise<void> {
  const row: Record<string, unknown> = { ...base(r), body: body.trim().slice(0, r.room === 'ministry' ? 4000 : 1000) };
  if (r.room === 'ministry') row.kind = announce ? 'announcement' : 'message';
  const { error } = await supabase.from(TABLE[r.room]).insert(row);
  if (error) throw error;
}

export async function chatSendAttachment(r: RoomRef, a: ChatAttachment, caption = ''): Promise<void> {
  const { error } = await supabase.from(TABLE[r.room]).insert({
    ...base(r), kind: a.kind, body: caption.trim().slice(0, 1000), attachment_path: a.path, attachment_name: a.name, attachment_size: a.size || null,
  });
  if (error) throw error;
}

export async function chatDelete(r: RoomRef, id: string): Promise<void> {
  const { error } = await supabase.from(TABLE[r.room]).delete().eq('id', id);
  if (error) throw error;
}

// ---------- Ubicación ----------
/** Una ubicación (liveMinutes = null) o ubicación en tiempo real por 15, 30 o 60 minutos. Devuelve el id del mensaje. */
export async function chatSendLocation(r: RoomRef, lat: number, lng: number, liveMinutes: 15 | 30 | 60 | null = null, label = ''): Promise<string> {
  const { data, error } = await supabase.rpc('chat_send_location', { p_room: r.room, p_ministry: r.ministryId ?? null, p_lat: lat, p_lng: lng, p_live_minutes: liveMinutes, p_label: label });
  if (error) throw error;
  return data as string;
}
export async function chatLiveUpdate(room: ChatRoomKind, id: string, lat: number, lng: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('chat_live_update', { p_room: room, p_id: id, p_lat: lat, p_lng: lng });
  if (error) return true; // sin señal: se sigue intentando
  return data !== false;
}
export async function chatLiveStop(room: ChatRoomKind, id: string): Promise<void> {
  const { error } = await supabase.rpc('chat_live_stop', { p_room: room, p_id: id });
  if (error) throw error;
}

// ---------- Tildes y privacidad ----------
export async function chatMarkRead(r: RoomRef): Promise<void> {
  await supabase.rpc('chat_mark_read', { p_room: r.room, p_ministry: r.ministryId ?? null });
}
export async function chatMarkDelivered(): Promise<void> {
  await supabase.rpc('chat_mark_delivered');
}
export async function chatReceipts(r: RoomRef): Promise<Receipt[]> {
  const { data, error } = await supabase.rpc('chat_receipts', { p_room: r.room, p_ministry: r.ministryId ?? null });
  if (error) throw error;
  return (data ?? []) as Receipt[];
}
export async function chatMyPrivacy(): Promise<ChatPrivacy> {
  const { data } = await supabase.rpc('chat_my_privacy');
  const row = (Array.isArray(data) ? data[0] : data) as ChatPrivacy | undefined;
  return { show_online: row?.show_online ?? true, read_receipts: row?.read_receipts ?? true };
}
export async function chatSetPrivacy(p: ChatPrivacy): Promise<void> {
  const { error } = await supabase.rpc('chat_set_privacy', { p_show_online: p.show_online, p_read_receipts: p.read_receipts });
  if (error) throw error;
}

export { ticksFor, type Ticks } from './chatTicks';

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
