// Base de mentira. El "tiempo real" entre aparatos se imita con otro BroadcastChannel que llega un poco más tarde:
// así una ventana recibe lo mismo por dos caminos, como pasa de verdad con dos pestañas de la misma computadora.
type Cb = (m: { payload: unknown }) => void;
const w = window as unknown as { __rt?: { opened: number; removed: number; subscribed: number; sent: number }; __plans?: unknown[]; __rtOff?: boolean };
w.__rt = w.__rt ?? { opened: 0, removed: 0, subscribed: 0, sent: 0 };
const channels = new Map<string, FakeChannel>();

class FakeChannel {
  bc: BroadcastChannel;
  handlers: Record<string, Cb[]> = {};
  joined = false;
  constructor(public topic: string) {
    this.bc = new BroadcastChannel(`fake-rt-${topic}`);
    this.bc.onmessage = (e) => { const { event, payload } = e.data as { event: string; payload: unknown }; setTimeout(() => (this.handlers[event] ?? []).forEach((h) => h({ payload })), 60); };
  }
  on(_type: string, f: { event: string }, cb: Cb) {
    if (this.joined) throw new Error('cannot add `broadcast` callbacks after `subscribe()`'); // igual que Supabase
    (this.handlers[f.event] = this.handlers[f.event] ?? []).push(cb);
    return this;
  }
  subscribe(cb: (s: string) => void) {
    if (this.joined) throw new Error('tried to subscribe multiple times');
    this.joined = true;
    w.__rt!.subscribed++;
    setTimeout(() => cb(w.__rtOff ? 'CHANNEL_ERROR' : 'SUBSCRIBED'), 150);
    return this;
  }
  async send(m: { event: string; payload: unknown }) { w.__rt!.sent++; this.bc.postMessage({ event: m.event, payload: m.payload }); return 'ok'; }
}

const rows = (table: string) => (table === 'service_plans' ? (w.__plans ?? JSON.parse(localStorage.getItem('harness-plans') ?? 'null')) : null) as Record<string, unknown>[] | null;
function query(table: string) {
  let list = rows(table);
  const q = {
    select: () => q, order: () => q, limit: () => q, gte: () => q,
    eq: (col: string, v: unknown) => { if (list && col === 'id') list = list.filter((r) => r.id === v); return q; },
    maybeSingle: async () => (list ? { data: list[0] ?? null, error: null } : { data: null, error: { message: 'relation does not exist' } }),
    then: (ok: (r: unknown) => unknown) => Promise.resolve(list ? { data: list, error: null } : { data: null, error: { message: 'relation "service_plans" does not exist', code: '42P01' } }).then(ok),
  };
  return q;
}

export const supabase = {
  realtime: { setAuth: async () => undefined },
  channel(topic: string) {
    // Igual que Supabase: el mismo tema devuelve el mismo canal.
    let c = channels.get(topic);
    if (!c) { c = new FakeChannel(topic); channels.set(topic, c); w.__rt!.opened++; }
    return c;
  },
  async removeChannel(c: FakeChannel) { channels.delete(c.topic); c.bc.close(); w.__rt!.removed++; return 'ok'; },
  from: (table: string) => query(table),
};
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
