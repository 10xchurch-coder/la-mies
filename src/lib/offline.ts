// Contactos cargados sin señal durante una salida: se guardan en el teléfono y se suben solos
// cuando vuelve la señal (al volver a la app o al rato). Cada contacto lleva su id desde el teléfono,
// así nunca se sube dos veces.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { supabase } from './supabase';

const KEY = 'lamies.offline.contacts';

export type OfflineContact = {
  contact: Record<string, unknown> & { id: string; name: string };
  kids: { name: string; age: number | null }[];
  visit: { session_id: string | null; note: string | null; gospel_presented: boolean; promise_day: string | null };
  shares: string[];
  savedAt: number;
};

export function newId(): string {
  // uuid v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** ¿El error es por falta de señal (y no un error de datos)? */
export function isNetworkError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)).toLowerCase();
  return /network|fetch|internet|timed? ?out|failed to|offline|conexi/.test(m);
}

async function read(): Promise<OfflineContact[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as OfflineContact[]; } catch { return []; }
}
async function write(list: OfflineContact[]) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sin espacio */ }
}

/** Sube un contacto con su visita, hijos y con quién se comparte. Si ya estaba (reintento), sigue. */
export async function uploadContact(x: OfflineContact): Promise<void> {
  const { error } = await supabase.from('contacts').insert(x.contact);
  if (error && !/duplicate key/i.test(error.message)) throw error;
  const id = x.contact.id;
  const { count } = await supabase.from('contact_visits').select('id', { count: 'exact', head: true }).eq('contact_id', id);
  if (!count) {
    if (x.kids.length) {
      const r = await supabase.from('contact_children').insert(x.kids.map((k) => ({ contact_id: id, name: k.name, age: k.age })));
      if (r.error) throw r.error;
    }
    const v = await supabase.from('contact_visits').insert({ contact_id: id, ...x.visit });
    if (v.error) throw v.error;
    if (x.shares.length) {
      const s = await supabase.from('contact_shares').insert(x.shares.map((u) => ({ contact_id: id, user_id: u })));
      if (s.error && !/duplicate key/i.test(s.error.message)) throw s.error;
    }
  }
}

export async function queueContact(x: OfflineContact): Promise<void> {
  const list = await read();
  await write([...list.filter((y) => y.contact.id !== x.contact.id), x]);
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

let flushing = false;
/** Intenta subir lo pendiente. Devuelve cuántos subió. */
export async function flushOffline(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let done = 0;
  try {
    const list = await read();
    const left: OfflineContact[] = [];
    for (const x of list) {
      try { await uploadContact(x); done++; } catch (e) { if (isNetworkError(e)) left.push(x); else left.push({ ...x, savedAt: x.savedAt }); }
    }
    await write(left);
  } finally {
    flushing = false;
  }
  return done;
}

/** Reintenta al volver a la app y cada 2 minutos. */
export function startOfflineSync(): () => void {
  flushOffline().catch(() => undefined);
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') flushOffline().catch(() => undefined); });
  const t = setInterval(() => { flushOffline().catch(() => undefined); }, 120000);
  return () => { sub.remove(); clearInterval(t); };
}
