// Las tildes de un mensaje (sin dependencias, para poder probarlas).
export type Receipt = { user_id: string; name: string; photo_path: string | null; delivered_at: string | null; read_at: string | null };
export type Ticks = 'sent' | 'delivered' | 'read';
/** Las tildes de un mensaje mío: ✓ enviado, ✓✓ llegó a todos, ✓✓ azul lo vieron todos. */
export function ticksFor(createdAt: string, receipts: Receipt[]): Ticks {
  if (!receipts.length) return 'sent';
  const t = new Date(createdAt).getTime();
  const at = (v: string | null) => (v ? new Date(v).getTime() >= t : false);
  if (receipts.every((x) => at(x.read_at))) return 'read';
  if (receipts.every((x) => at(x.delivered_at) || at(x.read_at))) return 'delivered';
  return 'sent';
}

