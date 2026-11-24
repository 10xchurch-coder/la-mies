// La imagen de un versículo que arma la persona: forma, letra, tamaño, color, y cómo se ve la foto de fondo.
// Sin nada de la app, para poder probarse sola.
export type ArtShape = '1x1' | '3x4' | '9x16';
export const ART_SHAPES: { id: ArtShape; label: string; w: number; h: number }[] = [
  { id: '1x1', label: 'Cuadrada', w: 1440, h: 1440 },
  { id: '3x4', label: 'Vertical', w: 1440, h: 1920 },
  { id: '9x16', label: 'Para estados', w: 1440, h: 2560 },
];
export const shapeOf = (id: string | undefined) => ART_SHAPES.find((s) => s.id === id) ?? ART_SHAPES[0];

export type ArtLook = {
  shape: ArtShape;
  /** Tamaño de la letra: 0 (chica) a 6 (grande). */
  size: number;
  /** Letra blanca (true) o negra (false). */
  white: boolean;
  /** Cuánto se ve la foto: 0 (apenas) a 4 (entera). */
  opacity: number;
  /** Desenfoque de la foto: 0 (nítida) a 4 (muy borrosa). */
  blur: number;
  /** Brillo de la foto: 0 (oscura) a 4 (clara); 2 es como viene. */
  bright: number;
};
export const DEFAULT_ART: ArtLook = { shape: '1x1', size: 3, white: true, opacity: 3, blur: 0, bright: 2 };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
export const step = (v: number, dir: 1 | -1, max: number) => clamp(v + dir, 0, max);

/** Cuánto se ve la foto (0.25 a 1). */
export const photoOpacity = (l: ArtLook) => [0.25, 0.45, 0.65, 0.82, 1][clamp(l.opacity, 0, 4)];
/** Desenfoque en puntos, para una imagen de 360 de ancho (se agranda parejo). */
export const blurRadius = (l: ArtLook) => [0, 2, 5, 9, 14][clamp(l.blur, 0, 4)];
/** Capa de brillo encima de la foto: color y cuánto tapa. */
export function brightLayer(l: ArtLook): { color: string; alpha: number } {
  const b = clamp(l.bright, 0, 4);
  if (b === 2) return { color: '#000000', alpha: 0 };
  return b < 2 ? { color: '#000000', alpha: b === 0 ? 0.5 : 0.25 } : { color: '#FFFFFF', alpha: b === 4 ? 0.45 : 0.22 };
}
/** Una capa suave detrás del texto para que siempre se lea: oscura con letra blanca, clara con letra negra. */
export const readLayer = (l: ArtLook) => ({ color: l.white ? '#000000' : '#FFFFFF', alpha: 0.28 });

/** Tamaño de la letra (para 360 de ancho) según el largo del texto y lo que eligió la persona. */
export function artFontSize(len: number, l: ArtLook): number {
  const base = len > 420 ? 13 : len > 300 ? 15 : len > 200 ? 17.5 : len > 120 ? 20.5 : len > 60 ? 24 : 28;
  return Math.round(base * [0.7, 0.8, 0.9, 1, 1.12, 1.26, 1.42][clamp(l.size, 0, 6)] * 10) / 10;
}
