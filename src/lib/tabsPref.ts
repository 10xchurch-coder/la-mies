// La barra de abajo: cada uno elige qué 5 pestañas ve y en qué orden (se guarda en el teléfono).
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Feather } from '@expo/vector-icons';
import type React from 'react';

export type TabKey = 'mapa' | 'personas' | 'iglesia' | 'chat' | 'yo' | 'predicas' | 'eventos' | 'oracion' | 'crecimiento' | 'directorio';
type IconName = React.ComponentProps<typeof Feather>['name'];

export const TAB_OPTIONS: { key: TabKey; title: string; icon: IconName; fixed?: boolean }[] = [
  { key: 'mapa', title: 'Mapa', icon: 'map' },
  { key: 'personas', title: 'Personas', icon: 'users' },
  { key: 'iglesia', title: 'Iglesia', icon: 'home', fixed: true },
  { key: 'chat', title: 'Chat', icon: 'message-circle' },
  { key: 'yo', title: 'Yo', icon: 'user', fixed: true },
  { key: 'predicas', title: 'Prédicas', icon: 'play-circle' },
  { key: 'eventos', title: 'Calendario', icon: 'calendar' },
  { key: 'oracion', title: 'Oración', icon: 'heart' },
  { key: 'crecimiento', title: 'Crecimiento', icon: 'sunrise' },
  { key: 'directorio', title: 'Directorio', icon: 'book' },
];
export const ALL_TABS = TAB_OPTIONS.map((t) => t.key);
export const DEFAULT_TABS: TabKey[] = ['mapa', 'personas', 'iglesia', 'chat', 'yo'];
export const tabInfo = (k: TabKey) => TAB_OPTIONS.find((t) => t.key === k)!;

const KEY = 'lamies.tabs';
let current: TabKey[] = DEFAULT_TABS;
const listeners = new Set<() => void>();

/** Siempre 5, sin repetir, y con Iglesia y Yo (Yo tiene los Ajustes donde se cambia esto). */
export function normalizeTabs(list: unknown): TabKey[] {
  const ok = Array.isArray(list) ? (list.filter((k, i) => ALL_TABS.includes(k as TabKey) && list.indexOf(k) === i) as TabKey[]) : [];
  let out = ok.slice(0, 5);
  for (const must of ['iglesia', 'yo'] as TabKey[]) {
    if (!out.includes(must)) {
      if (out.length >= 5) {
        const drop = [...out].reverse().find((k) => k !== 'iglesia' && k !== 'yo');
        out = out.filter((k) => k !== drop);
      }
      out.push(must);
    }
  }
  for (const k of DEFAULT_TABS) if (out.length < 5 && !out.includes(k)) out.push(k);
  return out;
}

export async function loadTabs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      current = normalizeTabs(JSON.parse(raw));
      listeners.forEach((l) => l());
    }
  } catch {
    // sin almacenamiento: queda la de siempre
  }
}

export function setTabs(list: TabKey[]): void {
  current = normalizeTabs(list);
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => undefined);
}

export function useTabs(): TabKey[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => current);
}
