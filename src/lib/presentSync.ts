// Modo presentación: cómo se hablan el que maneja (operador), la pantalla de salida y el control remoto.
// - En la misma computadora (dos ventanas del navegador): BroadcastChannel, y si no existe, localStorage.
// - Entre aparatos distintos: canal privado de Supabase Realtime, uno por iglesia (ver 0074_modo_presentacion.sql).
import { Platform } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { cleanLive, isCommand, type LiveState, type RemoteCommand } from './present';

export type LinkStatus = 'conectando' | 'conectado' | 'sin-conexion';

type Handlers = {
  onState?: (s: LiveState) => void;
  onCommand?: (c: RemoteCommand) => void;
  /** Cómo está la conexión con los otros aparatos (no con la otra ventana, que anda siempre). */
  onStatus?: (s: LinkStatus) => void;
};

export type PresentLink = {
  sendState: (s: LiveState) => void;
  sendCommand: (c: RemoteCommand) => void;
  /** Lo último que se mandó en esta computadora (para que la pantalla lo muestre apenas se abre). */
  lastLocal: () => LiveState | null;
  close: () => void;
};

type Wire = { t: 'state'; s: LiveState } | { t: 'cmd'; c: RemoteCommand; n: string };

const hasWindow = Platform.OS === 'web' && typeof window !== 'undefined';
const keyOf = (churchId: string) => `lamies-presentar-${churchId}`;

function readLocal(churchId: string): LiveState | null {
  if (!hasWindow) return null;
  try {
    const raw = window.localStorage.getItem(keyOf(churchId));
    return raw ? cleanLive(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function openPresentLink(churchId: string, h: Handlers): PresentLink {
  const key = keyOf(churchId);
  let closed = false;

  const receive = (raw: unknown) => {
    if (closed) return;
    const w = raw as Partial<Wire> | null;
    if (!w || typeof w !== 'object') return;
    if (w.t === 'state') { const s = cleanLive((w as { s?: unknown }).s); if (s) h.onState?.(s); }
    else if (w.t === 'cmd' && isCommand((w as { c?: unknown }).c)) h.onCommand?.((w as { c: RemoteCommand }).c);
  };

  // --- Misma computadora ---
  let bc: BroadcastChannel | null = null;
  let onStorage: ((e: StorageEvent) => void) | null = null;
  if (hasWindow) {
    if (typeof BroadcastChannel !== 'undefined') {
      try { bc = new BroadcastChannel(key); bc.onmessage = (e) => receive(e.data); } catch { bc = null; }
    }
    if (!bc) {
      // Sin BroadcastChannel: al escribir en localStorage, las otras ventanas reciben el aviso "storage".
      onStorage = (e) => {
        if (!e.newValue) return;
        try {
          if (e.key === key) receive({ t: 'state', s: JSON.parse(e.newValue) });
          else if (e.key === `${key}-cmd`) receive(JSON.parse(e.newValue));
        } catch { /* texto roto: se ignora */ }
      };
      window.addEventListener('storage', onStorage);
    }
  }
  const sendLocal = (w: Wire) => {
    if (!hasWindow) return;
    try {
      if (w.t === 'state') window.localStorage.setItem(key, JSON.stringify(w.s));
      else if (!bc) window.localStorage.setItem(`${key}-cmd`, JSON.stringify(w));
    } catch { /* sin lugar o modo privado: sigue por el otro camino */ }
    try { bc?.postMessage(w); } catch { /* ventana cerrándose */ }
  };

  // --- Otros aparatos ---
  let ch: RealtimeChannel | null = null;
  let ready = false;
  h.onStatus?.('conectando');
  const connect = async () => {
    // El canal es privado: la base revisa que sea de mi iglesia (y que sea líder para mandar).
    try { await supabase.realtime.setAuth(); } catch { /* sigue con la sesión que ya tenga */ }
    if (closed) return;
    ch = supabase.channel(`presentar:${churchId}`, { config: { private: true, broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: 'state' }, ({ payload }) => receive({ t: 'state', s: payload }))
      .on('broadcast', { event: 'cmd' }, ({ payload }) => receive(payload))
      .subscribe((status) => {
        if (closed) return;
        ready = status === 'SUBSCRIBED';
        h.onStatus?.(ready ? 'conectado' : status === 'CLOSED' ? 'conectando' : 'sin-conexion');
      });
  };
  connect().catch(() => h.onStatus?.('sin-conexion'));
  const sendRemote = (event: 'state' | 'cmd', payload: unknown) => {
    if (!ch || !ready) return;
    ch.send({ type: 'broadcast', event, payload }).catch(() => undefined);
  };

  return {
    sendState: (s) => { sendLocal({ t: 'state', s }); sendRemote('state', s); },
    sendCommand: (c) => {
      const w: Wire = { t: 'cmd', c, n: `${Date.now()}${Math.random()}` };
      sendLocal(w);
      sendRemote('cmd', w);
    },
    lastLocal: () => readLocal(churchId),
    close: () => {
      closed = true;
      try { bc?.close(); } catch { /* ya cerrado */ }
      if (onStorage) window.removeEventListener('storage', onStorage);
      if (ch) supabase.removeChannel(ch).catch(() => undefined);
    },
  };
}
