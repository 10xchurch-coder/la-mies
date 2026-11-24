// Reacciones a los mensajes (❤️ 👍 🙏 …), iguales en todos los chats: iglesia, salida, ministerios, privados y el hilo con el pastor.
// Una por persona por mensaje: tocar otra la cambia, tocar la misma la saca.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

import { applyReaction, type Reaction, type ReactionMap, type ReactionSource } from './reactionsCore';
export { REACTIONS, applyReaction, myReaction, type Reaction, type ReactionMap, type ReactionSource } from './reactionsCore';

export async function reactionsList(source: ReactionSource, ids: string[]): Promise<ReactionMap> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc('chat_reactions_list', { p_source: source, p_messages: ids });
  if (error) throw error;
  const out: ReactionMap = {};
  for (const r of (data ?? []) as (Reaction & { message_id: string })[]) (out[r.message_id] ??= []).push({ emoji: r.emoji, total: r.total, mine: r.mine, names: r.names ?? [] });
  return out;
}

export async function react(source: ReactionSource, messageId: string, emoji: string | null): Promise<void> {
  const { error } = await supabase.rpc('chat_react', { p_source: source, p_message: messageId, p_emoji: emoji });
  if (error) throw error;
}

/** Las reacciones de los mensajes que se están viendo. `reload` se llama cuando el chat se actualiza. */
export function useReactions(source: ReactionSource, ids: string[], myName: string, onError?: (e: unknown) => void) {
  const [map, setMap] = useState<ReactionMap>({});
  const key = ids.slice(0, 150).join(',');
  const keyRef = useRef(key);
  keyRef.current = key;
  const busy = useRef(0);
  const reload = useCallback(() => {
    const k = keyRef.current;
    if (!k || busy.current) return;
    reactionsList(source, k.split(',')).then((m) => { if (keyRef.current === k && !busy.current) setMap(m); }).catch(() => undefined);
  }, [source]);
  useEffect(() => { reload(); }, [key, reload]);
  const toggle = useCallback((messageId: string, emoji: string) => {
    setMap((old) => ({ ...old, [messageId]: applyReaction(old[messageId], emoji, myName) }));
    busy.current += 1;
    return react(source, messageId, emoji)
      .catch((e) => { onError?.(e); })
      .finally(() => { busy.current -= 1; reload(); });
  }, [source, myName, reload, onError]);
  return { map, toggle, reload };
}
