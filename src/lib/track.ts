// Qué hacemos con los puntos GPS de una salida:
//  - calcular la distancia caminada (ignorando saltos raros del GPS),
//  - detectar velocidad de vehículo (para frenar la salida sola),
//  - convertir el recorrido en "veredas cubiertas" (cobertura).

import { haversine, matchPoint, type Road, type Side } from './geo';

export type TrackPoint = {
  t: number; // ms desde 1970 (Date.now())
  lat: number;
  lng: number;
  acc?: number | null; // precisión en metros
  spd?: number | null; // m/s según el GPS
  hdg?: number | null;
};

export const WALK_MAX_ACCURACY_M = 50;
/** 5,5 m/s = 20 km/h: más rápido que cualquiera caminando o trotando. */
export const VEHICLE_SPEED_MPS = 5.5;
/** Hace falta ir rápido durante al menos esta cantidad de puntos seguidos... */
export const VEHICLE_MIN_POINTS = 4;
/** ...y durante al menos estos segundos, para no creerle a un salto del GPS. */
export const VEHICLE_MIN_SECONDS = 20;

export function speedBetween(a: TrackPoint, b: TrackPoint): number {
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0) return 0;
  return haversine(a, b) / dt;
}

/** Distancia caminada, descartando puntos imprecisos y saltos imposibles. */
export function walkedDistance(points: TrackPoint[]): number {
  let total = 0;
  let prev: TrackPoint | null = null;
  for (const p of points) {
    if (p.acc != null && p.acc > WALK_MAX_ACCURACY_M) continue;
    if (prev) {
      const d = haversine(prev, p);
      const v = speedBetween(prev, p);
      // Un salto de 100 m en 2 segundos no es caminar: lo ignoramos.
      if (v < 10) total += d;
    }
    prev = p;
  }
  return total;
}

export type VehicleCheck = {
  vehicle: boolean;
  /** Índice del último punto en el que todavía se iba caminando (para recortar ahí). */
  lastWalkingIndex: number;
};

/** Mira el final de la lista: ¿se está moviendo a velocidad de vehículo? */
export function detectVehicle(points: TrackPoint[]): VehicleCheck {
  const n = points.length;
  if (n < VEHICLE_MIN_POINTS + 1) return { vehicle: false, lastWalkingIndex: n - 1 };
  let fastCount = 0;
  let fastSince = -1;
  for (let i = n - 1; i >= 1; i--) {
    const p = points[i];
    const q = points[i - 1];
    if (p.acc != null && p.acc > WALK_MAX_ACCURACY_M) break;
    const v = p.spd != null && p.spd >= 0 ? Math.max(p.spd, speedBetween(q, p)) : speedBetween(q, p);
    if (v >= VEHICLE_SPEED_MPS) {
      fastCount++;
      fastSince = i - 1;
    } else {
      break;
    }
  }
  if (fastCount >= VEHICLE_MIN_POINTS && fastSince >= 0) {
    const seconds = (points[n - 1].t - points[fastSince].t) / 1000;
    if (seconds >= VEHICLE_MIN_SECONDS) {
      return { vehicle: true, lastWalkingIndex: fastSince };
    }
  }
  return { vehicle: false, lastWalkingIndex: n - 1 };
}

export type SideOverride = { roadId: number; since: number; side: Side };

export type CoverageEvent = { road_id: number; seg: number; side: Side; at: string };

export type CoverageResult = {
  events: CoverageEvent[];
  blocks: number;
};

/**
 * Convierte los puntos del recorrido en veredas cubiertas.
 * Una vereda cuenta como cubierta cuando al menos 2 puntos quedaron sobre ese tramo
 * (así un punto suelto cruzando la calle no la marca).
 */
export function coverageFromTrack(points: TrackPoint[], roads: Road[], overrides: SideOverride[] = []): CoverageResult {
  const hits = new Map<string, { road_id: number; seg: number; side: Side; count: number; last: number }>();
  for (const p of points) {
    if (p.acc != null && p.acc > WALK_MAX_ACCURACY_M) continue;
    const m = matchPoint(p, roads);
    if (!m) continue;
    let side = m.side;
    for (const o of overrides) {
      if (o.roadId === m.roadId && p.t >= o.since) side = o.side;
    }
    const key = `${m.roadId}:${m.seg}:${side}`;
    const h = hits.get(key);
    if (h) {
      h.count++;
      h.last = Math.max(h.last, p.t);
    } else {
      hits.set(key, { road_id: m.roadId, seg: m.seg, side, count: 1, last: p.t });
    }
  }
  const events: CoverageEvent[] = [];
  const blocks = new Set<string>();
  for (const h of hits.values()) {
    if (h.count < 2) continue;
    events.push({ road_id: h.road_id, seg: h.seg, side: h.side, at: new Date(h.last).toISOString() });
    blocks.add(`${h.road_id}:${h.seg}`);
  }
  return { events, blocks: blocks.size };
}
