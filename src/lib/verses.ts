// Versículos de memoria de los chicos y sus premios.
// Solo lógica: sin pantalla ni base, para poder probarse sola.

import { tx } from './i18n';
export type MemoryVerse = { id: string; class_id: string | null; reference: string; body: string | null; position: number; active: boolean };
export type VerseDone = { verse_id: string; contact_id: string; learned_on?: string };

export type Badge = { at: number; name: string; emoji: string };
/** Un premio a los 5, a los 10 y a los 25 versículos. */
export const BADGES: Badge[] = [
  { at: 5, get name() { return tx('Semilla'); }, emoji: '🌱' },
  { at: 10, get name() { return tx('Espiga'); }, emoji: '🌾' },
  { at: 25, get name() { return tx('Cosecha'); }, emoji: '🏆' },
];

/** Los premios que ya ganó. */
export const badgesEarned = (count: number): Badge[] => BADGES.filter((b) => count >= b.at);
/** El premio más alto que ya ganó (o null). */
export const topBadge = (count: number): Badge | null => badgesEarned(count).pop() ?? null;
/** El premio que sigue y cuántos versículos le faltan (null si ya ganó todos). */
export function nextBadge(count: number): { badge: Badge; missing: number } | null {
  const b = BADGES.find((x) => count < x.at);
  return b ? { badge: b, missing: b.at - count } : null;
}

/** Cuántos versículos aprendió cada chico. Solo cuentan los versículos que siguen en la lista. */
export function countByChild(done: VerseDone[], activeVerseIds?: Iterable<string>): Map<string, number> {
  const ok = activeVerseIds ? new Set(activeVerseIds) : null;
  const seen = new Set<string>();
  const out = new Map<string, number>();
  for (const d of done) {
    if (ok && !ok.has(d.verse_id)) continue;
    const k = `${d.verse_id}|${d.contact_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.set(d.contact_id, (out.get(d.contact_id) ?? 0) + 1);
  }
  return out;
}

/** "3 versículos", "1 versículo". */
export const versesLabel = (n: number): string => `${n} ${n === 1 ? tx('versículo') : 'versículos'}`;

/** Lo que se le dice al chico (o al maestro) sobre lo que falta. */
export function progressText(count: number): string {
  const next = nextBadge(count);
  if (!next) return tx('¡Ganó todos los premios!');
  return tx('{v1} para el premio {name} {emoji}', { v1: next.missing === 1 ? tx('Le falta 1 versículo') : tx('Le faltan {missing} versículos', { missing: next.missing }), name: next.badge.name, emoji: next.badge.emoji });
}
