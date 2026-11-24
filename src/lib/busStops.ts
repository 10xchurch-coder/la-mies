// Paradas del colectivo: el orden en que pasa a buscar a cada persona o familia, y cuánto le falta para llegar.
// La cuenta es simple y es la MISMA que hace la base para mandar el aviso (bus_notify_near, migración 0075):
//   camino = distancia en línea recta x 1,4 (las calles no van derecho), a 25 km/h,
//   sumando parada por parada en el orden de la ruta.
// Sin nada de la base ni de la pantalla, para poder probarse solo.
import { haversine, type LatLng } from './geo';

export const ROAD_FACTOR = 1.4;
export const BUS_KMH = 25;
/** Se avisa cuando faltan más o menos estos minutos. */
export const NOTICE_MINUTES = 10;
/** A menos de estos metros, el colectivo ya está en la parada. */
export const REACHED_METERS = 150;

/** Minutos que tarda el colectivo en hacer una distancia medida en línea recta (en metros). */
export function etaMinutes(straightMeters: number): number {
  const meters = Math.max(0, straightMeters) * ROAD_FACTOR;
  return meters / ((BUS_KMH * 1000) / 60);
}

export type StopLike = {
  id: string;
  /** El número de orden (1, 2, 3...). */
  pos: number;
  lat: number | null;
  lng: number | null;
  /** El colectivo ya pasó por ahí en este viaje (o el chofer la salteó). */
  reached?: boolean;
  /** "Hoy no viene": salteada a mano. */
  skipped?: boolean;
  /** Ya lo marcaron "subió" hoy. */
  picked?: boolean;
  /** Ya se le avisó en este viaje. */
  notified?: boolean;
};

export function orderStops<T extends { pos: number }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => a.pos - b.pos);
}

/** Sube (-1) o baja (+1) una parada en la lista. Devuelve la lista nueva de ids (la misma si no se puede mover). */
export function moveStop(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * Las paradas que todavía faltan, en orden. Ya no cuentan:
 *  - las que el colectivo ya pasó, y las anteriores a esas (el chofer las salteó);
 *  - las salteadas a mano ("hoy no viene") y las de quien ya subió;
 *  - las que no tienen el lugar marcado en el mapa (no se puede calcular nada).
 */
export function pendingStops<T extends StopLike>(stops: T[]): T[] {
  const sorted = orderStops(stops);
  let last = 0;
  for (const s of sorted) if (s.reached && !s.skipped) last = Math.max(last, s.pos);
  return sorted.filter((s) => s.pos > last && !s.reached && !s.skipped && !s.picked && s.lat != null && s.lng != null);
}

/** Cuántos minutos le faltan al colectivo para cada parada que falta (sumando el camino en orden). */
export function routeEtas(bus: LatLng, stops: StopLike[]): Map<string, number> {
  const out = new Map<string, number>();
  let from = bus;
  let meters = 0;
  for (const s of pendingStops(stops)) {
    const here = { lat: s.lat as number, lng: s.lng as number };
    meters += haversine(from, here);
    from = here;
    out.set(s.id, etaMinutes(meters));
  }
  return out;
}

/** A qué paradas hay que avisarles ahora: faltan 10 minutos o menos y todavía no se les avisó en este viaje. */
export function stopsToNotify(bus: LatLng, stops: StopLike[]): string[] {
  const etas = routeEtas(bus, stops);
  return pendingStops(stops).filter((s) => !s.notified && (etas.get(s.id) ?? Infinity) <= NOTICE_MINUTES).map((s) => s.id);
}

/** "llega en 1 minuto", "llega en unos 7 minutos" */
export function etaLabel(minutes: number | undefined | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const m = Math.round(minutes);
  if (m <= 1) return 'llega en 1 minuto';
  return `llega en unos ${m} minutos`;
}

/** El pedazo de mapa donde entran todos los puntos (con un poco de margen), y nunca más cerca que ~1 km. */
export function regionForPoints(points: { latitude: number; longitude: number }[]): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.5),
  };
}
