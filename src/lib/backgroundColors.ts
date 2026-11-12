// Los fondos de color del versículo (sin pantalla, para poder usarlos también al dibujar la imagen de la web).
/** Fondos de color (opcionales; lo normal es "auto" = la foto del día). */
export const BACKGROUNDS: Record<string, { label: string; colors: [string, string, string] }> = {
  campo:    { label: 'Campo',    colors: ['#1F6B45', '#2F8F5B', '#9CCB8E'] },
  cielo:    { label: 'Cielo',    colors: ['#1E3A8A', '#2563EB', '#93C5FD'] },
  amanecer: { label: 'Amanecer', colors: ['#7C2D12', '#EA580C', '#FDE68A'] },
  noche:    { label: 'Noche',    colors: ['#0F172A', '#1E293B', '#475569'] },
  rio:      { label: 'Río',      colors: ['#134E4A', '#0D9488', '#99F6E4'] },
  montana:  { label: 'Montaña',  colors: ['#44403C', '#78716C', '#D6D3D1'] },
};
