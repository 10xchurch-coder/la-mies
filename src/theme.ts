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
 *  Evangelismo: verde y azules. Volantes: naranjas. */
export function coverageColor(lastCoveredAt: string | Date, kind: 'soulwinning' | 'flyers' = 'soulwinning'): string {
  if (kind === 'flyers') {
    const ageF = Date.now() - new Date(lastCoveredAt).getTime();
    const dayF = 24 * 3600 * 1000;
    if (ageF <= dayF && new Date(lastCoveredAt).toDateString() === new Date().toDateString()) return colors.orange;
    if (ageF <= 7 * dayF) return colors.orangeMid;
    if (ageF <= 30 * dayF) return colors.orangeLight;
    return colors.tan;
  }
  const age = Date.now() - new Date(lastCoveredAt).getTime();
  const day = 24 * 3600 * 1000;
  const now = new Date();
  const d = new Date(lastCoveredAt);
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return colors.green;
  if (age <= 7 * day) return colors.blue;
  if (age <= 30 * day) return colors.blueLight;
  return colors.gray;
}

export const COVERAGE_LEGEND = [
  { color: colors.green, label: 'Hoy' },
  { color: colors.blue, label: 'Esta semana' },
  { color: colors.blueLight, label: 'Este mes' },
  { color: colors.gray, label: 'Hace más de un mes' },
];

export const FLYERS_LEGEND = [
  { color: colors.orange, label: 'Hoy' },
  { color: colors.orangeMid, label: 'Esta semana' },
  { color: colors.orangeLight, label: 'Este mes' },
  { color: colors.tan, label: 'Hace más de un mes' },
];
