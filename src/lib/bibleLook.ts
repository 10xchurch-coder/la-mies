// Cómo se ve la Biblia al leer: letras, colores de fondo, espacio entre líneas y colores para resaltar.
// Sin nada de la app, para poder probarse sola.
import { tx } from './i18n';
export type BibleFontId = 'sistema' | 'lora' | 'merriweather' | 'literata' | 'garamond' | 'noto' | 'opensans' | 'atkinson';
export type BibleFont = { id: BibleFontId; label: string; hint: string; regular?: string; bold?: string; scale: number };

/** Las letras para elegir. "scale" empareja el tamaño (algunas letras se ven más chicas que otras). */
export const BIBLE_FONTS: BibleFont[] = [
  { id: 'sistema', get label() { return tx('Del teléfono'); }, get hint() { return tx('La letra de siempre'); }, scale: 1 },
  { id: 'lora', get label() { return tx('Lora'); }, get hint() { return tx('De libro, cálida'); }, regular: 'Lora_400Regular', bold: 'Lora_700Bold', scale: 1 },
  { id: 'merriweather', get label() { return tx('Merriweather'); }, get hint() { return tx('De libro, firme'); }, regular: 'Merriweather_400Regular', bold: 'Merriweather_700Bold', scale: 0.94 },
  { id: 'literata', get label() { return tx('Literata'); }, get hint() { return tx('De libro, suave'); }, regular: 'Literata_400Regular', bold: 'Literata_700Bold', scale: 1 },
  { id: 'garamond', get label() { return tx('Garamond'); }, get hint() { return tx('Clásica, de Biblia antigua'); }, regular: 'EBGaramond_400Regular', bold: 'EBGaramond_700Bold', scale: 1.12 },
  { id: 'noto', get label() { return tx('Noto Serif'); }, get hint() { return tx('De libro, clara'); }, regular: 'NotoSerif_400Regular', bold: 'NotoSerif_700Bold', scale: 0.97 },
  { id: 'opensans', get label() { return tx('Open Sans'); }, get hint() { return tx('Simple y moderna'); }, regular: 'OpenSans_400Regular', bold: 'OpenSans_700Bold', scale: 0.98 },
  { id: 'atkinson', get label() { return tx('Atkinson'); }, get hint() { return tx('Fácil de leer con poca vista'); }, regular: 'AtkinsonHyperlegible_400Regular', bold: 'AtkinsonHyperlegible_700Bold', scale: 1.02 },
];
export const fontOf = (id: string | undefined): BibleFont => BIBLE_FONTS.find((f) => f.id === id) ?? BIBLE_FONTS[0];

export type BibleThemeId = 'auto' | 'blanco' | 'crema' | 'sepia' | 'grisclaro' | 'gris' | 'grisoscuro' | 'azul' | 'negro';
export type BibleTheme = { id: BibleThemeId; label: string; bg: string; text: string; muted: string; accent: string; line: string; dark: boolean };

/** Los fondos para elegir. "auto" usa los colores de la app (claro u oscuro según el teléfono). */
export const BIBLE_THEMES: BibleTheme[] = [
  { id: 'blanco', get label() { return tx('Blanco'); }, bg: '#FFFFFF', text: '#1B1F1C', muted: '#6B716C', accent: '#2F5FA8', line: '#E3E6E1', dark: false },
  { id: 'crema', get label() { return tx('Crema'); }, bg: '#FBF6EA', text: '#2A2620', muted: '#7A7264', accent: '#8A5A1C', line: '#E9DFC9', dark: false },
  { id: 'sepia', get label() { return tx('Amarillento'); }, bg: '#F1E4C6', text: '#3A2E1C', muted: '#7B6B4E', accent: '#8A4B14', line: '#DCCBA3', dark: false },
  { id: 'grisclaro', get label() { return tx('Gris claro'); }, bg: '#EEF0F1', text: '#1E2224', muted: '#646B70', accent: '#2F5FA8', line: '#D8DCDF', dark: false },
  { id: 'gris', get label() { return tx('Gris'); }, bg: '#5A6066', text: '#F4F5F6', muted: '#C9CED2', accent: '#BFD6FF', line: '#737A81', dark: true },
  { id: 'grisoscuro', get label() { return tx('Gris oscuro'); }, bg: '#2B2F33', text: '#ECEEF0', muted: '#A6ADB3', accent: '#A9C7FF', line: '#41474D', dark: true },
  { id: 'azul', get label() { return tx('Azul noche'); }, bg: '#14213A', text: '#E7ECF6', muted: '#9AA9C4', accent: '#A9C7FF', line: '#27375A', dark: true },
  { id: 'negro', get label() { return tx('Negro'); }, bg: '#000000', text: '#E6E6E6', muted: '#9A9A9A', accent: '#A9C7FF', line: '#262626', dark: true },
];
export const themeOf = (id: string | undefined): BibleTheme | null => BIBLE_THEMES.find((t) => t.id === id) ?? null;

/** Espacio entre líneas: apretado, normal o amplio. */
export const SPACINGS: { id: 'apretado' | 'normal' | 'amplio'; label: string; factor: number }[] = [
  { id: 'apretado', get label() { return tx('Apretado'); }, factor: 1.38 },
  { id: 'normal', get label() { return tx('Normal'); }, factor: 1.62 },
  { id: 'amplio', get label() { return tx('Amplio'); }, factor: 1.95 },
];
export const spacingOf = (id: string | undefined): number => (SPACINGS.find((s) => s.id === id) ?? SPACINGS[1]).factor;

/** Colores para resaltar. Cada uno con su tono para fondo claro y para fondo oscuro. */
export const MARK_COLORS: { id: string; label: string; light: string; dark: string; dot: string }[] = [
  { id: 'amarillo', get label() { return tx('Amarillo'); }, light: '#FFF2A8', dark: '#6B5A00', dot: '#F5D400' },
  { id: 'verde', get label() { return tx('Verde'); }, light: '#CDEFCB', dark: '#1F5B2A', dot: '#4CAF50' },
  { id: 'celeste', get label() { return tx('Celeste'); }, light: '#CDE6FF', dark: '#1B4A7A', dot: '#3F9BF0' },
  { id: 'rosa', get label() { return tx('Rosa'); }, light: '#FFD3E2', dark: '#7A2447', dot: '#EC5E93' },
  { id: 'naranja', get label() { return tx('Naranja'); }, light: '#FFDDB8', dark: '#7A4410', dot: '#F28C28' },
  { id: 'violeta', get label() { return tx('Violeta'); }, light: '#E3D4FF', dark: '#4A2E86', dot: '#8E63E6' },
];
export const markBg = (color: string | null | undefined, dark: boolean): string | undefined => {
  const c = MARK_COLORS.find((m) => m.id === color);
  return c ? (dark ? c.dark : c.light) : undefined;
};
