// El menú de la pestaña Iglesia: cada uno lo ordena a su gusto (se guarda en el teléfono).
// Favoritos arriba, el orden de los botones dentro de cada grupo, el orden de los grupos y si el menú va arriba o abajo.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MenuPref = {
  fav: string[];                    // botones fijados arriba, en orden
  order: Record<string, string[]>;  // orden de los botones de cada grupo
  groups: string[];                 // orden de los grupos
  top: boolean;                     // el menú va arriba (antes de los anuncios y el devocional)
};
export const DEFAULT_MENU: MenuPref = { fav: [], order: {}, groups: [], top: false };
export const FAV = 'Favoritos';

const KEY = 'lamies.menu';
let current: MenuPref = DEFAULT_MENU;
const listeners = new Set<() => void>();

export function normalizeMenu(x: unknown): MenuPref {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<MenuPref>;
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 80) : []);
  const order: Record<string, string[]> = {};
  if (o.order && typeof o.order === 'object') for (const [k, v] of Object.entries(o.order)) order[k] = strs(v);
  return { fav: strs(o.fav).filter((k, i, a) => a.indexOf(k) === i), order, groups: strs(o.groups), top: !!o.top };
}

export async function loadMenu(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) { current = normalizeMenu(JSON.parse(raw)); listeners.forEach((l) => l()); }
  } catch { /* sin almacenamiento: queda el menú de siempre */ }
}
export function setMenu(next: MenuPref): void {
  current = normalizeMenu(next);
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => undefined);
}
export const resetMenu = () => setMenu(DEFAULT_MENU);
export function useMenu(): MenuPref {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => current);
}

/** Ordena una lista según el orden guardado; lo que no está en el orden queda al final, en su lugar de siempre. */
export function sortBy<T>(items: T[], keyOf: (t: T) => string, saved: string[] | undefined): T[] {
  if (!saved?.length) return items;
  const idx = (t: T) => { const i = saved.indexOf(keyOf(t)); return i < 0 ? saved.length : i; };
  return items.map((t, i) => ({ t, i })).sort((a, b) => idx(a.t) - idx(b.t) || a.i - b.i).map((x) => x.t);
}

/** Cambia de lugar un elemento (-1 hacia el principio, 1 hacia el final) y devuelve las claves en el nuevo orden. */
export function moved(keys: string[], key: string, dir: -1 | 1): string[] {
  const i = keys.indexOf(key), j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return keys;
  const next = [...keys];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Arma el menú final: Favoritos primero (si hay) y después los grupos en el orden elegido, sin repetir botones. */
export function layout<T extends { show: boolean }>(
  groups: { title: string; tiles: T[] }[], keyOf: (t: T) => string, pref: MenuPref,
): { title: string; tiles: T[] }[] {
  const all = groups.flatMap((g) => g.tiles).filter((t) => t.show);
  const fav = pref.fav.map((k) => all.find((t) => keyOf(t) === k)).filter((t): t is T => !!t);
  const favKeys = new Set(fav.map(keyOf));
  const rest = sortBy(groups, (g) => g.title, pref.groups).map((g) => ({
    title: g.title,
    tiles: sortBy(g.tiles.filter((t) => !favKeys.has(keyOf(t))), keyOf, pref.order[g.title]),
  }));
  return fav.length ? [{ title: FAV, tiles: fav }, ...rest] : rest;
}
