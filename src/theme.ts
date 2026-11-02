// Colores y medidas de la app (los mismos del diseño).
export const colors = {
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
} as const;

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
  { color: colors.green, label: 'Esta semana' },
  { color: colors.blue, label: 'Este mes' },
  { color: colors.gray, label: 'Hace más de un mes' },
];

export const FLYERS_LEGEND = [
  { color: colors.orange, label: 'Esta semana' },
  { color: colors.orangeLight, label: 'Este mes' },
  { color: colors.tan, label: 'Hace más de un mes' },
];
