// La parte de las reacciones que no toca la red: se puede probar sola.
export type ReactionSource = 'church' | 'outing' | 'ministry' | 'dm' | 'pastor';
export type Reaction = { emoji: string; total: number; mine: boolean; names: string[] };
export type ReactionMap = Record<string, Reaction[]>;

/** Las que se ofrecen al mantener apretado un mensaje. */
export const REACTIONS = ['❤️', '👍', '🙏', '😂', '😮', '😢'] as const;

export const myReaction = (list: Reaction[] | undefined): string | null => list?.find((r) => r.mine)?.emoji ?? null;

/** Cómo queda la lista de un mensaje después de que yo toco una reacción (para verlo al instante, sin esperar al servidor). */
export function applyReaction(list: Reaction[] | undefined, emoji: string, myName: string): Reaction[] {
  const had = myReaction(list);
  let out = (list ?? []).map((r) => (r.mine ? { ...r, mine: false, total: r.total - 1, names: r.names.filter((n, i, a) => !(n === myName && a.indexOf(n) === i)) } : r)).filter((r) => r.total > 0);
  if (had === emoji) return out; // toqué la mía: se saca
  const at = out.find((r) => r.emoji === emoji);
  if (at) out = out.map((r) => (r === at ? { ...r, mine: true, total: r.total + 1, names: [...r.names, myName] } : r));
  else out = [...out, { emoji, total: 1, mine: true, names: [myName] }];
  return out;
}

