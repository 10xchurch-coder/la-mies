// Colores y medidas de la app (los mismos del diseño).
import { useSyncExternalStore } from 'react';
import { tx } from '@/lib/i18n';

export type Palette = {
  green: string; greenDark: string; greenSoft: string; greenText: string;
  blue: string; blueSoft: string; blueText: string; blueLight: string;
  amber: string; amberSoft: string; amberText: string;
  red: string; redSoft: string; redText: string;
  violet: string; violetSoft: string; violetText: string;
  teal: string; tealSoft: string; tealText: string;
  pink: string; pinkSoft: string; pinkText: string;
  gray: string; orange: string; orangeMid: string; orangeLight: string; tan: string;
  graySoft: string; grayText: string;
  text: string; muted: string; label: string; border: string; input: string;
  bg: string; bgSoft: string; bgPage: string; mapBg: string;
};

const LIGHT: Palette = {
  green: '#1F6B45',
  greenDark: '#154D32',
  greenSoft: '#DDF1E4',
  greenText: '#145C38',
  blue: '#2F6DB5',
  blueSoft: '#DCE8F7',
  blueText: '#1D4F8C',
  blueLight: '#9DBBE3',
  amber: '#B85C00',
  amberSoft: '#FFF1E0',
  amberText: '#8A4500',
  red: '#B3261E',
  redSoft: '#F8E1DF',
  redText: '#8E1D16',
  violet: '#6D4BC3',
  violetSoft: '#E9E2F8',
  violetText: '#4E3396',
  teal: '#0F7F87',
  tealSoft: '#D9F0F1',
  tealText: '#0B5D63',
  pink: '#C2387A',
  pinkSoft: '#FBE1EC',
  pinkText: '#932259',
  gray: '#B9BEC4',
  orange: '#E0670B',
  orangeMid: '#F29B38',
  orangeLight: '#F6C88C',
  tan: '#D8C9B6',
  graySoft: '#ECEEEF',
  grayText: '#4B5257',
  text: '#1A1D1A',
  muted: '#5B615C',
  label: '#3E443F',
  border: '#E3E6E1',
  input: '#CFD4CF',
  bg: '#FFFFFF',
  bgSoft: '#F0F2EE',
  bgPage: '#F4F5F2',
  mapBg: '#E3E7DF',
};

// Modo oscuro: mismos nombres, otros valores. Los verdes se aclaran un poco para que se lean sobre fondo oscuro.
const DARK: Palette = {
  green: '#2E9A63',
  greenDark: '#1F6B45',
  greenSoft: '#173426',
  greenText: '#8FD8B0',
  blue: '#5B95E0',
  blueSoft: '#1B2E47',
  blueText: '#A9C8F2',
  blueLight: '#3F6FB0',
  amber: '#E08A2E',
  amberSoft: '#3A2A14',
  amberText: '#F3C27A',
  red: '#E0574E',
  redSoft: '#3F1F1C',
  redText: '#F3A09A',
  violet: '#9B80E6',
  violetSoft: '#2A2245',
  violetText: '#CBBBF5',
  teal: '#35AEB6',
  tealSoft: '#12343A',
  tealText: '#9FDDE2',
  pink: '#E36AA3',
  pinkSoft: '#40192C',
  pinkText: '#F4AFCD',
  gray: '#5D646B',
  orange: '#F0812A',
  orangeMid: '#F29B38',
  orangeLight: '#B98B5A',
  tan: '#7A6E5E',
  graySoft: '#2A2F2C',
  grayText: '#C2C8C4',
  text: '#ECF1ED',
  muted: '#9DA69F',
  label: '#C9D1CB',
  border: '#2B332E',
  input: '#3B453E',
  bg: '#101512',
  bgSoft: '#1A211C',
  bgPage: '#0C100E',
  mapBg: '#1E2622',
};

export type ThemeMode = 'light' | 'dark';

/** Los colores actuales. Es el mismo objeto siempre: al cambiar de modo se reemplazan sus valores. */
export const colors: Palette = { ...LIGHT };

let currentMode: ThemeMode = 'light';
let version = 0;
const listeners = new Set<() => void>();

export function getThemeMode(): ThemeMode {
  return currentMode;
}

export function setThemeMode(mode: ThemeMode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  Object.assign(colors, mode === 'dark' ? DARK : LIGHT);
  version++;
  listeners.forEach((l) => l());
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentMode,
    () => currentMode,
  );
}

/** Estilos que dependen de los colores: se vuelven a crear cuando cambia el modo. */
export function themed<T extends object>(factory: () => T): T {
  let built = factory();
  let builtAt = version;
  return new Proxy(built, {
    get(_t, prop) {
      if (builtAt !== version) {
        built = factory();
        builtAt = version;
      }
      return (built as Record<PropertyKey, unknown>)[prop as string];
    },
  });
}

export const radius = { card: 14, button: 14, pill: 999, input: 12 } as const;

/** Color de una vereda según cuándo se cubrió por última vez. Un solo color por "edad", no por persona.
 *  Evangelismo: verde, azul y gris. Volantes: naranjas. */
export function coverageColor(lastCoveredAt: string | Date, kind: 'soulwinning' | 'flyers' = 'soulwinning'): string {
  const age = Date.now() - new Date(lastCoveredAt).getTime();
  const day = 24 * 3600 * 1000;
  if (kind === 'flyers') {
    if (age <= 7 * day) return colors.orange;
    if (age <= 30 * day) return colors.orangeLight;
    return colors.tan;
  }
  if (age <= 7 * day) return colors.green;
  if (age <= 30 * day) return colors.blue;
  return colors.gray;
}

export const COVERAGE_LEGEND = [
  { color: colors.green, get label() { return tx('Esta semana'); } },
  { color: colors.blue, get label() { return tx('Este mes'); } },
  { color: colors.gray, get label() { return tx('Hace más de un mes'); } },
];

export const FLYERS_LEGEND = [
  { color: colors.orange, get label() { return tx('Esta semana'); } },
  { color: colors.orangeLight, get label() { return tx('Este mes'); } },
  { color: colors.tan, get label() { return tx('Hace más de un mes'); } },
];

/** Un color por área de la app (personas, crecer, comunidad...): el fuerte, el fondo suave y el del texto. */
export type Tone = 'green' | 'blue' | 'amber' | 'violet' | 'teal' | 'pink' | 'red';
export function toneOf(t: Tone | undefined): { solid: string; soft: string; text: string } {
  switch (t) {
    case 'blue': return { solid: colors.blue, soft: colors.blueSoft, text: colors.blueText };
    case 'amber': return { solid: colors.amber, soft: colors.amberSoft, text: colors.amberText };
    case 'violet': return { solid: colors.violet, soft: colors.violetSoft, text: colors.violetText };
    case 'teal': return { solid: colors.teal, soft: colors.tealSoft, text: colors.tealText };
    case 'pink': return { solid: colors.pink, soft: colors.pinkSoft, text: colors.pinkText };
    case 'red': return { solid: colors.red, soft: colors.redSoft, text: colors.redText };
    default: return { solid: colors.green, soft: colors.greenSoft, text: colors.greenText };
  }
}
