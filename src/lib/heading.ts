// Hacia dónde apunta el teléfono (brújula), para dibujar el abanico del punto azul en el mapa.
// Solo la cuenta: sin React ni sensores, así se puede probar sola.

/** Lleva cualquier ángulo a 0–360. */
export const norm360 = (d: number) => ((d % 360) + 360) % 360;

/**
 * Rumbo (0 = norte, 90 = este) a partir del evento de orientación del navegador.
 * - iPhone: trae webkitCompassHeading, que ya es el rumbo.
 * - Android: alpha crece hacia la izquierda, así que el rumbo es 360 − alpha, y solo sirve si el evento es "absoluto".
 * Devuelve null cuando el dato no sirve como brújula.
 */
export function headingFromOrientation(e: { webkitCompassHeading?: number | null; alpha?: number | null; absolute?: boolean }, screenAngle = 0): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) return norm360(e.webkitCompassHeading + screenAngle);
  if (e.absolute && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) return norm360(360 - e.alpha + screenAngle);
  return null;
}

/** Suaviza el rumbo para que el abanico no tiemble, tomando siempre el camino corto (350° → 10° pasa por 0°). */
export function smoothHeading(prev: number | null, next: number, k = 0.35): number {
  if (prev === null) return norm360(next);
  const diff = ((next - prev + 540) % 360) - 180;
  return norm360(prev + diff * k);
}

/** ¿Cambió lo suficiente como para volver a dibujar? */
export function headingMoved(a: number | null, b: number, min = 3): boolean {
  if (a === null) return true;
  return Math.abs(((b - a + 540) % 360) - 180) >= min;
}
