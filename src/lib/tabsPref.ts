// La barra de abajo: cada uno elige qué 5 pestañas ve y en qué orden (se guarda en el teléfono).
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Feather } from '@expo/vector-icons';
import type React from 'react';
import { tx } from './i18n';

export type TabKey = 'mapa' | 'personas' | 'iglesia' | 'chat' | 'yo' | 'predicas' | 'eventos' | 'oracion' | 'crecimiento' | 'directorio' | 'biblia';
type IconName = React.ComponentProps<typeof Feather>['name'];

export const TAB_OPTIONS: { key: TabKey; title: string; icon: IconName; fixed?: boolean }[] = [
  { key: 'mapa', get title() { return tx('Mapa'); }, icon: 'map' },
  { key: 'biblia', get title() { return tx('Biblia'); }, icon: 'book-open' },
  { key: 'personas', get title() { return tx('Personas'); }, icon: 'users' },
  { key: 'iglesia', get title() { return tx('Iglesia'); }, icon: 'home', fixed: true },
  { key: 'chat', get title() { return tx('Chat'); }, icon: 'message-circle' },
  { key: 'yo', get title() { return tx('Yo'); }, icon: 'user', fixed: true },
  { key: 'predicas', get title() { return tx('Prédicas'); }, icon: 'play-circle' },
  { key: 'eventos', get title() { return tx('Calendario'); }, icon: 'calendar' },
  { key: 'oracion', get title() { return tx('Oración'); }, icon: 'heart' },
  { key: 'crecimiento', get title() { return tx('Crecimiento'); }, icon: 'sunrise' },
  { key: 'directorio', get title() { return tx('Directorio'); }, icon: 'book' },
];
export const ALL_TABS = TAB_OPTIONS.map((t) => t.key);
export const DEFAULT_TABS: TabKey[] = ['mapa', 'biblia', 'iglesia', 'chat', 'yo'];
/** La barra de antes (con Personas donde ahora va la Biblia). Quien la tenía guardada tal cual pasa a la nueva. */
const OLD_DEFAULT: TabKey[] = ['mapa', 'personas', 'iglesia', 'chat', 'yo'];
export const upgradeTabs = (list: TabKey[]): TabKey[] => (list.join() === OLD_DEFAULT.join() ? DEFAULT_TABS : list);
/** Nombre del archivo de cada pestaña: las que también son pantallas sueltas usan una copia "t-…" para no mezclarse. */
export const tabRoute = (k: TabKey): string => (['chat', 'eventos', 'oracion', 'directorio', 'crecimiento', 'predicas', 'biblia', 'personas'].includes(k) ? `t-${k}` : k);
export const tabKeyOfRoute = (r: string): TabKey | null => ALL_TABS.find((k) => tabRoute(k) === r) ?? null;
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
      current = upgradeTabs(normalizeTabs(JSON.parse(raw)));
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
