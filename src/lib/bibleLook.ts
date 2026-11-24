// Cómo se ve la Biblia al leer: letras, colores de fondo, espacio entre líneas y colores para resaltar.
// Sin nada de la app, para poder probarse sola.
export type BibleFontId = 'sistema' | 'lora' | 'merriweather' | 'literata' | 'garamond' | 'noto' | 'opensans' | 'atkinson';
export type BibleFont = { id: BibleFontId; label: string; hint: string; regular?: string; bold?: string; scale: number };

/** Las letras para elegir. "scale" empareja el tamaño (algunas letras se ven más chicas que otras). */
export const BIBLE_FONTS: BibleFont[] = [
  { id: 'sistema', label: 'Del teléfono', hint: 'La letra de siempre', scale: 1 },
  { id: 'lora', label: 'Lora', hint: 'De libro, cálida', regular: 'Lora_400Regular', bold: 'Lora_700Bold', scale: 1 },
  { id: 'merriweather', label: 'Merriweather', hint: 'De libro, firme', regular: 'Merriweather_400Regular', bold: 'Merriweather_700Bold', scale: 0.94 },
  { id: 'literata', label: 'Literata', hint: 'De libro, suave', regular: 'Literata_400Regular', bold: 'Literata_700Bold', scale: 1 },
  { id: 'garamond', label: 'Garamond', hint: 'Clásica, de Biblia antigua', regular: 'EBGaramond_400Regular', bold: 'EBGaramond_700Bold', scale: 1.12 },
  { id: 'noto', label: 'Noto Serif', hint: 'De libro, clara', regular: 'NotoSerif_400Regular', bold: 'NotoSerif_700Bold', scale: 0.97 },
  { id: 'opensans', label: 'Open Sans', hint: 'Simple y moderna', regular: 'OpenSans_400Regular', bold: 'OpenSans_700Bold', scale: 0.98 },
  { id: 'atkinson', label: 'Atkinson', hint: 'Fácil de leer con poca vista', regular: 'AtkinsonHyperlegible_400Regular', bold: 'AtkinsonHyperlegible_700Bold', scale: 1.02 },
];
export const fontOf = (id: string | undefined): BibleFont => BIBLE_FONTS.find((f) => f.id === id) ?? BIBLE_FONTS[0];

export type BibleThemeId = 'auto' | 'blanco' | 'crema' | 'sepia' | 'grisclaro' | 'gris' | 'grisoscuro' | 'azul' | 'negro';
export type BibleTheme = { id: BibleThemeId; label: string; bg: string; text: string; muted: string; accent: string; line: string; dark: boolean };

/** Los fondos para elegir. "auto" usa los colores de la app (claro u oscuro según el teléfono). */
export const BIBLE_THEMES: BibleTheme[] = [
  { id: 'blanco', label: 'Blanco', bg: '#FFFFFF', text: '#1B1F1C', muted: '#6B716C', accent: '#2F5FA8', line: '#E3E6E1', dark: false },
  { id: 'crema', label: 'Crema', bg: '#FBF6EA', text: '#2A2620', muted: '#7A7264', accent: '#8A5A1C', line: '#E9DFC9', dark: false },
  { id: 'sepia', label: 'Amarillento', bg: '#F1E4C6', text: '#3A2E1C', muted: '#7B6B4E', accent: '#8A4B14', line: '#DCCBA3', dark: false },
  { id: 'grisclaro', label: 'Gris claro', bg: '#EEF0F1', text: '#1E2224', muted: '#646B70', accent: '#2F5FA8', line: '#D8DCDF', dark: false },
  { id: 'gris', label: 'Gris', bg: '#5A6066', text: '#F4F5F6', muted: '#C9CED2', accent: '#BFD6FF', line: '#737A81', dark: true },
  { id: 'grisoscuro', label: 'Gris oscuro', bg: '#2B2F33', text: '#ECEEF0', muted: '#A6ADB3', accent: '#A9C7FF', line: '#41474D', dark: true },
  { id: 'azul', label: 'Azul noche', bg: '#14213A', text: '#E7ECF6', muted: '#9AA9C4', accent: '#A9C7FF', line: '#27375A', dark: true },
  { id: 'negro', label: 'Negro', bg: '#000000', text: '#E6E6E6', muted: '#9A9A9A', accent: '#A9C7FF', line: '#262626', dark: true },
];
export const themeOf = (id: string | undefined): BibleTheme | null => BIBLE_THEMES.find((t) => t.id === id) ?? null;

/** Espacio entre líneas: apretado, normal o amplio. */
export const SPACINGS: { id: 'apretado' | 'normal' | 'amplio'; label: string; factor: number }[] = [
  { id: 'apretado', label: 'Apretado', factor: 1.38 },
  { id: 'normal', label: 'Normal', factor: 1.62 },
  { id: 'amplio', label: 'Amplio', factor: 1.95 },
];
export const spacingOf = (id: string | undefined): number => (SPACINGS.find((s) => s.id === id) ?? SPACINGS[1]).factor;

/** Colores para resaltar. Cada uno con su tono para fondo claro y para fondo oscuro. */
export const MARK_COLORS: { id: string; label: string; light: string; dark: string; dot: string }[] = [
  { id: 'amarillo', label: 'Amarillo', light: '#FFF2A8', dark: '#6B5A00', dot: '#F5D400' },
  { id: 'verde', label: 'Verde', light: '#CDEFCB', dark: '#1F5B2A', dot: '#4CAF50' },
  { id: 'celeste', label: 'Celeste', light: '#CDE6FF', dark: '#1B4A7A', dot: '#3F9BF0' },
  { id: 'rosa', label: 'Rosa', light: '#FFD3E2', dark: '#7A2447', dot: '#EC5E93' },
  { id: 'naranja', label: 'Naranja', light: '#FFDDB8', dark: '#7A4410', dot: '#F28C28' },
  { id: 'violeta', label: 'Violeta', light: '#E3D4FF', dark: '#4A2E86', dot: '#8E63E6' },
];
export const markBg = (color: string | null | undefined, dark: boolean): string | undefined => {
  const c = MARK_COLORS.find((m) => m.id === color);
  return c ? (dark ? c.dark : c.light) : undefined;
};
