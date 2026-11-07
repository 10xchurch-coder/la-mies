// Qué hacemos con los puntos GPS de una salida:
//  - calcular la distancia caminada (ignorando saltos raros del GPS),
//  - detectar velocidad de vehículo (para frenar la salida sola),
//  - convertir el recorrido en "veredas cubiertas" (cobertura).

import { bearing, haversine, projectOnSegment, sideOfSegment, type Road, type Side } from './geo';

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

/** Reglas para marcar una vereda (las mismas que usa el servidor en recompute_session_coverage). */
export const COVER = {
  /** Precisión del GPS mínima para contar un punto (metros). */
  maxAccuracy: 25,
  /** Distancia máxima del punto al eje de la calle (la vereda está a 5–10 m del eje). */
  maxDist: 20,
  /** El punto tiene que caer "dentro" del tramo, no pasado de una punta (así una esquina no marca la calle que cruza). */
  tMin: 0.03,
  tMax: 0.97,
  /** Si se está caminando, el rumbo tiene que ir a lo largo de la calle (± grados). */
  maxAngle: 35,
  /** Desde cuántos metros entre el punto anterior y el siguiente se considera que se está caminando. */
  movingMeters: 8,
  /** Puntos mínimos por vereda y tramo. */
  minPoints: 3,
  /** Hay que recorrer al menos esta parte del tramo (o 25 m). */
  minSpanShare: 0.5,
  minSpanMeters: 25,
  /** Si en el tramo una vereda tiene menos de esta parte de los puntos, es ruido del GPS y no cuenta. */
  minSideShare: 0.3,
  /** A menos de esto del eje no se sabe de qué vereda es el punto (el GPS y el mapa tienen unos metros de error):
   *  el punto cuenta para el tramo, pero no para elegir la vereda. */
  sideBand: 2.5,
} as const;

function angleDiff(a: number, b: number): number {
  // diferencia entre rumbos sin importar el sentido (0..90)
  let d = Math.abs(a - b) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

type Hit = { roadId: number; seg: number; side: Side; along: number; t: number; dist: number; forced?: boolean };

/**
 * Convierte los puntos del recorrido en veredas cubiertas.
 * Una vereda de un tramo cuenta cuando:
 *  - al menos 3 puntos precisos (≤ 25 m) caen a ≤ 20 m del eje y dentro del tramo (no en la esquina),
 *  - caminando a lo largo de esa calle (no cruzándola),
 *  - cubren al menos la mitad del tramo (o 25 m),
 *  - y esa vereda tiene al menos el 30% de los puntos del tramo (si no, es el GPS saltando a la vereda de enfrente).
 * Los puntos a menos de 2,5 m del eje cuentan para el tramo pero no deciden la vereda.
 */
export function coverageFromTrack(points: TrackPoint[], roads: Road[], overrides: SideOverride[] = []): CoverageResult {
  const good = points.filter((p) => p.acc == null || p.acc <= COVER.maxAccuracy).sort((a, b) => a.t - b.t);
  const byKey = new Map<string, Hit[]>();
  for (let i = 0; i < good.length; i++) {
    const p = good[i];
    const prev = good[i - 1];
    const next = good[i + 1];
    const moving = prev && next && haversine(prev, next) >= COVER.movingMeters;
    const heading = moving ? bearing(prev, next) : null;
    let best: (Hit & { dist: number }) | null = null;
    for (const r of roads) {
      for (let s = 0; s < r.coords.length - 1; s++) {
        const a = { lat: r.coords[s][0], lng: r.coords[s][1] };
        const b = { lat: r.coords[s + 1][0], lng: r.coords[s + 1][1] };
        // descarte rápido por caja
        const dLat = COVER.maxDist / 111320;
        if (p.lat < Math.min(a.lat, b.lat) - dLat || p.lat > Math.max(a.lat, b.lat) + dLat) continue;
        const dLng = dLat / Math.cos((p.lat * Math.PI) / 180);
        if (p.lng < Math.min(a.lng, b.lng) - dLng || p.lng > Math.max(a.lng, b.lng) + dLng) continue;
        const pr = projectOnSegment(p, a, b);
        if (pr.dist > COVER.maxDist || pr.t <= COVER.tMin || pr.t >= COVER.tMax) continue;
        if (heading != null && angleDiff(heading, bearing(a, b)) > COVER.maxAngle) continue;
        if (best && pr.dist >= best.dist) continue;
        const len = haversine(a, b);
        best = { roadId: r.id, seg: s, side: sideOfSegment(p, a, b), along: pr.t * len, t: p.t, dist: pr.dist };
      }
    }
    if (!best) continue;
    for (const o of overrides) if (o.roadId === best.roadId && p.t >= o.since) { best.side = o.side; best.forced = true; }
    const k = `${best.roadId}:${best.seg}`;
    const list = byKey.get(k) ?? [];
    list.push(best);
    byKey.set(k, list);
  }

  const lenOf = new Map<string, number>();
  for (const r of roads) for (let s = 0; s < r.coords.length - 1; s++) {
    lenOf.set(`${r.id}:${s}`, haversine({ lat: r.coords[s][0], lng: r.coords[s][1] }, { lat: r.coords[s + 1][0], lng: r.coords[s + 1][1] }));
  }

  const events: CoverageEvent[] = [];
  const blocks = new Set<string>();
  for (const [k, all] of byKey) {
    const len = lenOf.get(k) ?? 0;
    const needSpan = Math.min(COVER.minSpanMeters, len * COVER.minSpanShare);
    // 1) ¿Se recorrió el tramo? (con todos los puntos, sepan o no de qué vereda son)
    if (all.length < (len < 20 ? 2 : COVER.minPoints)) continue;
    const spanAll = Math.max(...all.map((h) => h.along)) - Math.min(...all.map((h) => h.along));
    if (spanAll < needSpan) continue;
    // 2) ¿De qué vereda? Solo con los puntos que están claramente de un lado (o con la vereda elegida a mano).
    const raw = all.filter((h) => h.forced || h.dist >= COVER.sideBand);
    // Un punto suelto del otro lado (distinto de los dos vecinos) es el GPS saltando: no cuenta.
    const known = raw.filter((h, i) => {
      const a = raw[i - 1], b = raw[i + 1];
      if (!a && !b) return true;
      return a?.side === h.side || b?.side === h.side;
    });
    if (!known.length) continue;
    for (const side of [1, -1] as const) {
      const hs = known.filter((h) => h.side === side);
      if (hs.length < 2 || hs.length / known.length < COVER.minSideShare) continue;
      // si las dos veredas tienen puntos, cada una tiene que haberse recorrido de verdad
      const other = known.length - hs.length;
      if (other > 0) {
        const span = Math.max(...hs.map((h) => h.along)) - Math.min(...hs.map((h) => h.along));
        if (span < needSpan) continue;
      }
      events.push({ road_id: hs[0].roadId, seg: hs[0].seg, side, at: new Date(Math.max(...all.map((h) => h.t))).toISOString() });
      blocks.add(k);
    }
  }
  return { events, blocks: blocks.size };
}
