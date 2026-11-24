// Los fondos de color del versículo (sin pantalla, para poder usarlos también al dibujar la imagen de la web).
/** Fondos de color (opcionales; lo normal es "auto" = la foto del día). */
import { tx } from './i18n';
export const BACKGROUNDS: Record<string, { label: string; colors: [string, string, string] }> = {
  campo:    { get label() { return tx('Campo'); },    colors: ['#1F6B45', '#2F8F5B', '#9CCB8E'] },
  cielo:    { get label() { return tx('Cielo'); },    colors: ['#1E3A8A', '#2563EB', '#93C5FD'] },
  amanecer: { get label() { return tx('Amanecer'); }, colors: ['#7C2D12', '#EA580C', '#FDE68A'] },
  noche:    { get label() { return tx('Noche'); },    colors: ['#0F172A', '#1E293B', '#475569'] },
  rio:      { get label() { return tx('Río'); },      colors: ['#134E4A', '#0D9488', '#99F6E4'] },
  montana:  { get label() { return tx('Montaña'); },  colors: ['#44403C', '#78716C', '#D6D3D1'] },
};
