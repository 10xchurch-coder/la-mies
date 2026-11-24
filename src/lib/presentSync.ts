// Modo presentación: cómo se hablan el que maneja (operador), la pantalla de salida, la vista de escenario y el control remoto.
// - En el mismo aparato y la misma ventana (una tablet sola): por memoria, directo.
// - En la misma computadora (dos ventanas del navegador): BroadcastChannel, y si no existe, localStorage.
// - Entre aparatos distintos: canal privado de Supabase Realtime, uno por iglesia (ver 0074_modo_presentacion.sql).
// Todas las pantallas abiertas en una misma ventana comparten una sola conexión por iglesia (Supabase no deja
// abrir dos veces el mismo canal), y cada orden del control se toma una sola vez aunque llegue por dos caminos.
import { Platform } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { cleanLive, isCommand, isNewer, type LiveState, type RemoteCommand } from './present';

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

/** La conexión de una iglesia, compartida por todas las pantallas abiertas en esta ventana. */
type Hub = {
  key: string;
  links: Set<Handlers>;
  status: LinkStatus;
  last: LiveState | null;
  /** Órdenes ya tomadas (por su número), para no repetirlas si llegan por dos caminos. */
  seen: string[];
  bc: BroadcastChannel | null;
  onStorage: ((e: StorageEvent) => void) | null;
  ch: RealtimeChannel | null;
  ready: boolean;
  closed: boolean;
};
const hubs = new Map<string, Hub>();
/** Lo último que se mostró, por iglesia. Queda en memoria aunque se cierre la conexión (en la tablet no hay localStorage). */
const lastMem = new Map<string, LiveState>();

function openHub(churchId: string): Hub {
  const key = keyOf(churchId);
  const hub: Hub = { key, links: new Set(), status: 'conectando', last: lastMem.get(key) ?? null, seen: [], bc: null, onStorage: null, ch: null, ready: false, closed: false };

  const setStatus = (s: LinkStatus) => {
    if (hub.closed) return;
    hub.status = s;
    for (const l of [...hub.links]) l.onStatus?.(s);
  };

  // --- Misma computadora, otra ventana ---
  if (hasWindow) {
    if (typeof BroadcastChannel !== 'undefined') {
      try { hub.bc = new BroadcastChannel(key); hub.bc.onmessage = (e) => receive(hub, e.data, null); } catch { hub.bc = null; }
    }
    if (!hub.bc) {
      // Sin BroadcastChannel: al escribir en localStorage, las otras ventanas reciben el aviso "storage".
      hub.onStorage = (e) => {
        if (!e.newValue) return;
        try {
          if (e.key === key) receive(hub, { t: 'state', s: JSON.parse(e.newValue) }, null);
          else if (e.key === `${key}-cmd`) receive(hub, JSON.parse(e.newValue), null);
        } catch { /* texto roto: se ignora */ }
      };
      window.addEventListener('storage', hub.onStorage);
    }
  }

  // --- Otros aparatos ---
  const connect = async () => {
    // El canal es privado: la base revisa que sea de mi iglesia (y que sea líder para mandar).
    try { await supabase.realtime.setAuth(); } catch { /* sigue con la sesión que ya tenga */ }
    if (hub.closed) return;
    const ch = supabase.channel(`presentar:${churchId}`, { config: { private: true, broadcast: { self: false, ack: false } } });
    hub.ch = ch;
    ch.on('broadcast', { event: 'state' }, ({ payload }) => receive(hub, { t: 'state', s: payload }, null))
      .on('broadcast', { event: 'cmd' }, ({ payload }) => receive(hub, payload, null))
      .subscribe((status) => {
        if (hub.closed) return;
        hub.ready = status === 'SUBSCRIBED';
        setStatus(hub.ready ? 'conectado' : status === 'CLOSED' ? 'conectando' : 'sin-conexion');
      });
  };
  connect().catch(() => setStatus('sin-conexion'));
  return hub;
}

/** Reparte lo que llegó (de otra ventana, de otro aparato o de otra pantalla de esta ventana) a quien corresponde. */
function receive(hub: Hub, raw: unknown, from: Handlers | null) {
  if (hub.closed) return;
  const w = raw as Partial<Wire> | null;
  if (!w || typeof w !== 'object') return;
  if (w.t === 'state') {
    const s = cleanLive((w as { s?: unknown }).s);
    if (!s) return;
    if (isNewer(hub.last, s)) { hub.last = s; lastMem.set(hub.key, s); }
    for (const l of [...hub.links]) if (l !== from) l.onState?.(s);
  } else if (w.t === 'cmd' && isCommand((w as { c?: unknown }).c)) {
    const n = (w as { n?: unknown }).n;
    if (typeof n === 'string' && n) {
      if (hub.seen.includes(n)) return;
      hub.seen.push(n);
      if (hub.seen.length > 60) hub.seen.splice(0, hub.seen.length - 60);
    }
    for (const l of [...hub.links]) if (l !== from) l.onCommand?.((w as { c: RemoteCommand }).c);
  }
}

function sendOut(hub: Hub, w: Wire) {
  if (hasWindow) {
    try {
      if (w.t === 'state') window.localStorage.setItem(hub.key, JSON.stringify(w.s));
      else if (!hub.bc) window.localStorage.setItem(`${hub.key}-cmd`, JSON.stringify(w));
    } catch { /* sin lugar o modo privado: sigue por el otro camino */ }
    try { hub.bc?.postMessage(w); } catch { /* ventana cerrándose */ }
  }
  if (hub.ch && hub.ready) {
    try {
      Promise.resolve(hub.ch.send({ type: 'broadcast', event: w.t === 'state' ? 'state' : 'cmd', payload: w.t === 'state' ? w.s : w })).catch(() => undefined);
    } catch { /* canal cerrándose */ }
  }
}

function closeHub(churchId: string, hub: Hub) {
  hub.closed = true;
  if (hubs.get(churchId) === hub) hubs.delete(churchId);
  try { hub.bc?.close(); } catch { /* ya cerrado */ }
  if (hub.onStorage && hasWindow) window.removeEventListener('storage', hub.onStorage);
  if (hub.ch) { try { Promise.resolve(supabase.removeChannel(hub.ch)).catch(() => undefined); } catch { /* ya cerrado */ } }
}

export function openPresentLink(churchId: string, h: Handlers): PresentLink {
  let hub = hubs.get(churchId);
  if (!hub) { hub = openHub(churchId); hubs.set(churchId, hub); }
  const mine = hub;
  mine.links.add(h);
  let closed = false;
  h.onStatus?.(mine.status);

  return {
    sendState: (s) => {
      if (closed) return;
      receive(mine, { t: 'state', s }, h);
      sendOut(mine, { t: 'state', s });
    },
    sendCommand: (c) => {
      if (closed) return;
      const w: Wire = { t: 'cmd', c, n: `${Date.now()}${Math.random()}` };
      receive(mine, w, h);
      sendOut(mine, w);
    },
    lastLocal: () => {
      const stored = readLocal(churchId);
      if (stored && mine.last) return isNewer(stored, mine.last) ? mine.last : stored;
      return stored ?? mine.last;
    },
    close: () => {
      if (closed) return;
      closed = true;
      mine.links.delete(h);
      // Se espera un momento antes de cortar: al pasar de una pantalla a otra, la que entra usa la misma conexión.
      setTimeout(() => { if (!mine.links.size && !mine.closed) closeHub(churchId, mine); }, 400);
    },
  };
}
