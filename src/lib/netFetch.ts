// Modo sin conexión para todo lo que la app le pide a la base.
//  - Cada lectura que sale bien se guarda en el teléfono. Si después no hay señal (o la señal es muy lenta),
//    la pantalla se abre con lo último guardado.
//  - Los cambios que se pueden repetir sin problema (asistencia, quiénes salieron, etc.) se anotan
//    y se suben solos cuando vuelve la señal.
//  - Todo lo demás necesita internet: falla con el aviso de "Sin conexión".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { classify, evictions, hashKey, patchCached, replayOutcome, type CacheIndex, type Queued } from './offlineCore';

const P = 'lamies.net.';
const K = { index: `${P}index`, queue: `${P}queue`, uid: `${P}uid`, entry: (k: string) => `${P}c.${k}` };
const CAP = Platform.OS === 'web' ? 3_000_000 : 4_000_000;
const MAX_ENTRY = 700_000;
const SLOW_READ_MS = 8000;
const SLOW_WRITE_MS = 10000;
const PATCHABLE = new Set(['rpc/attendance_sheet', 'rpc/outing_sheet', 'class_attendance', 'bible_plans']);

type Stored = { s: number; t: string; ct: string | null; cr: string | null };
type QueuedReq = Queued & { h: Record<string, string> };

let base = '';
let apiKey = '';
let getToken: () => Promise<string | null> = async () => null;

// ---------- Estado: ¿hay señal? ¿cuántos cambios faltan subir? ----------
export type NetState = { online: boolean; pending: number };
let state: NetState = { online: true, pending: 0 };
const listeners = new Set<(s: NetState) => void>();
export const netState = (): NetState => state;
export function subscribeNet(fn: (s: NetState) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function setState(patch: Partial<NetState>) {
  const next = { ...state, ...patch };
  if (next.online === state.online && next.pending === state.pending) return;
  const back = next.online && !state.online;
  state = next;
  listeners.forEach((fn) => fn(state));
  if (back) flushQueue().catch(() => undefined);
}

// ---------- Guardado ----------
let index: CacheIndex | null = null;
let queue: QueuedReq[] | null = null;
let loading: Promise<void> | null = null;
function ready(): Promise<void> {
  loading ??= (async () => {
    try {
      const [[, i], [, q]] = await AsyncStorage.multiGet([K.index, K.queue]);
      index = i ? (JSON.parse(i) as CacheIndex) : {};
      queue = q ? (JSON.parse(q) as QueuedReq[]) : [];
    } catch {
      index = {};
      queue = [];
    }
    setState({ pending: queue?.length ?? 0 });
  })();
  return loading;
}
let indexTimer: ReturnType<typeof setTimeout> | null = null;
function saveIndexSoon() {
  if (indexTimer) return;
  indexTimer = setTimeout(() => {
    indexTimer = null;
    if (index) AsyncStorage.setItem(K.index, JSON.stringify(index)).catch(() => undefined);
  }, 1500);
}
async function saveQueue() {
  setState({ pending: queue?.length ?? 0 });
  try { await AsyncStorage.setItem(K.queue, JSON.stringify(queue ?? [])); } catch { /* sin espacio */ }
}

async function put(key: string, path: string, args: string, v: Stored) {
  await ready();
  if (!index || v.t.length > MAX_ENTRY) return;
  try {
    await AsyncStorage.setItem(K.entry(key), JSON.stringify(v));
    index[key] = { n: v.t.length + 100, t: Date.now(), p: path, a: args.length <= 400 ? args : '' };
    const out = evictions(index, CAP);
    for (const k of out) delete index[k];
    if (out.length) AsyncStorage.multiRemove(out.map(K.entry)).catch(() => undefined);
    saveIndexSoon();
  } catch {
    // Sin espacio: se libera la mitad de lo guardado y se sigue.
    const out = evictions(index, CAP / 2);
    for (const k of out) delete index[k];
    AsyncStorage.multiRemove(out.map(K.entry)).catch(() => undefined);
    saveIndexSoon();
  }
}
async function get(key: string): Promise<Stored | null> {
  await ready();
  if (!index?.[key]) return null;
  try {
    const raw = await AsyncStorage.getItem(K.entry(key));
    if (!raw) return null;
    index[key].t = Date.now();
    saveIndexSoon();
    return JSON.parse(raw) as Stored;
  } catch {
    return null;
  }
}
const NULL_BODY = new Set([204, 205, 304]);
function toResponse(v: Stored, head: boolean): Response {
  const headers: Record<string, string> = {};
  if (v.ct) headers['content-type'] = v.ct;
  if (v.cr) headers['content-range'] = v.cr;
  return new Response(head || NULL_BODY.has(v.s) || v.t === '' ? null : v.t, { status: v.s, headers });
}

/** Un cambio (pendiente o recién hecho) se refleja en las planillas guardadas. */
async function patchCaches(q: Queued) {
  await ready();
  if (!index) return;
  for (const [key, e] of Object.entries(index)) {
    if (!PATCHABLE.has(e.p)) continue;
    const v = await get(key);
    if (!v) continue;
    const text = patchCached(q, e.p, e.a, v.t);
    if (text != null && text !== v.t) await put(key, e.p, e.a, { ...v, t: text });
  }
}

// ---------- Subir lo pendiente ----------
let flushing = false;
export async function flushQueue(): Promise<number> {
  await ready();
  if (flushing || !queue?.length) return 0;
  flushing = true;
  let done = 0;
  try {
    const token = await getToken();
    if (!token) return 0;
    while (queue.length) {
      const q = queue[0];
      let res: Response;
      try {
        res = await fetch(`${base}/rest/v1/${q.path}${q.query}`, { method: q.method, headers: { ...q.h, apikey: apiKey, Authorization: `Bearer ${token}` }, body: q.body ?? undefined });
      } catch {
        setState({ online: false });
        break;
      }
      setState({ online: true });
      if (replayOutcome(res.status) === 'retry') break;
      if (res.status >= 400 && res.status !== 409) console.warn('No se pudo subir un cambio pendiente', q.path, res.status);
      queue.shift();
      done++;
      await saveQueue();
    }
  } finally {
    flushing = false;
  }
  return done;
}

const isAbort = (e: unknown) => !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
const sleep = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** El `fetch` que usa Supabase: igual al de siempre, con lo guardado como respaldo. */
export function makeOfflineFetch(supabaseUrl: string, anonKey: string): typeof fetch {
  base = supabaseUrl.replace(/\/$/, '');
  apiKey = anonKey;
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const at = url.indexOf('/rest/v1/');
    const run = async () => {
      try {
        const res = await fetch(input, init);
        setState({ online: true });
        return res;
      } catch (e) {
        if (!isAbort(e)) setState({ online: false });
        throw e;
      }
    };
    if (!url.startsWith(base) || at < 0) return run();

    const rest = url.slice(at + 9);
    const cut = rest.indexOf('?');
    const path = cut < 0 ? rest : rest.slice(0, cut);
    const query = cut < 0 ? '' : rest.slice(cut);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const prefer = headers.get('prefer') ?? '';
    const body = typeof init?.body === 'string' ? init.body : null;
    const kind = classify(method, path, prefer);
    if (kind === 'pass') return run();

    if (kind === 'read') {
      const key = hashKey([method, rest, body ?? '', headers.get('accept') ?? '', headers.get('range') ?? '', prefer].join(' '));
      const args = body ?? query;
      // Sin sesión (la app abrió sin señal y no pudo renovarla): lo que venga de la base no es del hermano.
      // Se usa lo guardado y no se guarda nada nuevo.
      const anonymous = (headers.get('authorization') ?? '') === `Bearer ${apiKey}`;
      if (anonymous) {
        const saved = await get(key);
        if (saved) return toResponse(saved, method === 'HEAD');
        return run();
      }
      // La respuesta de la base se devuelve tal cual; aparte se guarda una copia. Si guardar falla, no pasa nada.
      const net = run().then((res) => {
        if (res.ok) {
          try {
            const ct = res.headers.get('content-type');
            const cr = res.headers.get('content-range');
            const status = res.status;
            (method === 'HEAD' ? Promise.resolve('') : res.clone().text())
              .then((t) => put(key, path, args, { s: status, t, ct, cr }))
              .catch(() => undefined);
          } catch { /* sin copia */ }
        }
        return res;
      });
      try { await ready(); } catch { return net; }
      if (!index?.[key]) return net;
      // Hay algo guardado: si no hay señal, o tarda demasiado, se muestra eso.
      const first = await Promise.race([net.then((res) => ({ res }), (err: unknown) => ({ err })), sleep(SLOW_READ_MS, { slow: true })]);
      if ('res' in first) return first.res;
      if ('err' in first && isAbort(first.err)) throw first.err;
      const saved = await get(key);
      if (saved) {
        net.catch(() => undefined);
        return toResponse(saved, method === 'HEAD');
      }
      if ('err' in first) throw first.err;
      return net;
    }

    // Cambio que se puede anotar para después.
    const q: QueuedReq = { id: newId(), method, path, query, body, prefer, at: Date.now(), h: {} };
    for (const name of ['content-type', 'prefer', 'accept-profile', 'content-profile']) {
      const v = headers.get(name);
      if (v) q.h[name] = v;
    }
    const tried = await Promise.race([run().then((res) => ({ res }), (err: unknown) => ({ err })), sleep(SLOW_WRITE_MS, { slow: true })]);
    if ('res' in tried) {
      if (tried.res.ok) patchCaches(q).catch(() => undefined);
      return tried.res;
    }
    if ('err' in tried && isAbort(tried.err)) throw tried.err;
    await ready();
    queue?.push(q);
    await saveQueue();
    await patchCaches(q).catch(() => undefined);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
}

export function setTokenGetter(fn: () => Promise<string | null>) {
  getToken = fn;
}

/** Borra todo lo guardado (al cerrar sesión o al entrar con otra cuenta). */
export async function clearOfflineData(): Promise<void> {
  await ready().catch(() => undefined);
  index = {};
  queue = [];
  setState({ pending: 0 });
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(P));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* nada */ }
}

/** Lo guardado es de una sola cuenta: si entra otra persona, se borra. */
export async function setOfflineUser(uid: string | null): Promise<void> {
  if (!uid) return clearOfflineData();
  try {
    const prev = await AsyncStorage.getItem(K.uid);
    if (prev && prev !== uid) await clearOfflineData();
    if (prev !== uid) await AsyncStorage.setItem(K.uid, uid);
  } catch { /* nada */ }
}

/** Mientras no hay señal se prueba cada tanto; cuando vuelve, se sube lo pendiente. */
export function startNetSync(): () => void {
  ready().then(() => flushQueue()).catch(() => undefined);
  const check = async () => {
    if (!base) return;
    if (!state.online) {
      try {
        await fetch(`${base}/auth/v1/health`, { headers: { apikey: apiKey } });
        setState({ online: true });
      } catch {
        return;
      }
    }
    if (state.pending) flushQueue().catch(() => undefined);
  };
  const t = setInterval(check, 20000);
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
  const w = typeof window !== 'undefined' && Platform.OS === 'web' ? window : null;
  const on = () => { check(); };
  const off = () => setState({ online: false });
  w?.addEventListener('online', on);
  w?.addEventListener('offline', off);
  return () => {
    clearInterval(t);
    sub.remove();
    w?.removeEventListener('online', on);
    w?.removeEventListener('offline', off);
  };
}
