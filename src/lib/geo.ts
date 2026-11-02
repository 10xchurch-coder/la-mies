// Geometría para el mapa: distancias, "¿en qué calle y en qué vereda estoy?",
// y cómo dibujar cada vereda corrida unos metros del eje de la calle.
// Todo en TypeScript puro (sin dependencias) para poder probarlo.

export type LatLng = { lat: number; lng: number };

/** Una calle de OpenStreetMap: sus puntos en orden. Cada par consecutivo es un "tramo" (seg). */
export type Road = {
  id: number;
  name: string | null;
  coords: [number, number][]; // [lat, lng]
  min_lat?: number;
  min_lng?: number;
  max_lat?: number;
  max_lng?: number;
};

/** +1 = vereda izquierda respecto del sentido en que está dibujada la calle, -1 = derecha. */
export type Side = 1 | -1;

export type SideName = 'norte' | 'sur' | 'este' | 'oeste';

export type Match = {
  roadId: number;
  roadName: string | null;
  seg: number;
  side: Side;
  dist: number; // metros hasta el eje de la calle
  t: number; // posición a lo largo del tramo, 0..1
  point: LatLng; // el punto proyectado sobre el eje
};

const EARTH_R = 6371000;
const DEG = Math.PI / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(Math.min(1, s)));
}

/** Coordenadas locales en metros (x hacia el este, y hacia el norte) respecto de un origen. */
export function toLocal(origin: LatLng, p: LatLng): { x: number; y: number } {
  const x = (p.lng - origin.lng) * DEG * EARTH_R * Math.cos(origin.lat * DEG);
  const y = (p.lat - origin.lat) * DEG * EARTH_R;
  return { x, y };
}

export function fromLocal(origin: LatLng, x: number, y: number): LatLng {
  return {
    lat: origin.lat + y / (DEG * EARTH_R),
    lng: origin.lng + x / (DEG * EARTH_R * Math.cos(origin.lat * DEG)),
  };
}

/** Proyecta p sobre el tramo a→b. Devuelve la posición t (0..1), la distancia y el punto proyectado. */
export function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { t: number; dist: number; point: LatLng } {
  const A = { x: 0, y: 0 };
  const B = toLocal(a, b);
  const P = toLocal(a, p);
  const len2 = B.x * B.x + B.y * B.y;
  let t = 0;
  if (len2 > 0) {
    t = ((P.x - A.x) * B.x + (P.y - A.y) * B.y) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const qx = B.x * t;
  const qy = B.y * t;
  const dist = Math.hypot(P.x - qx, P.y - qy);
  return { t, dist, point: fromLocal(a, qx, qy) };
}

/** De qué lado del tramo a→b está p: +1 izquierda, -1 derecha. */
export function sideOfSegment(p: LatLng, a: LatLng, b: LatLng): Side {
  const B = toLocal(a, b);
  const P = toLocal(a, p);
  const cross = B.x * P.y - B.y * P.x;
  return cross >= 0 ? 1 : -1;
}

/** Rumbo de a→b en grados (0 = norte, 90 = este). */
export function bearing(a: LatLng, b: LatLng): number {
  const B = toLocal(a, b);
  const deg = (Math.atan2(B.x, B.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Nombre humano de la vereda: norte / sur / este / oeste. */
export function sideName(a: LatLng, b: LatLng, side: Side): SideName {
  const br = bearing(a, b);
  const normal = (br + (side === 1 ? -90 : 90) + 360) % 360;
  if (normal < 45 || normal >= 315) return 'norte';
  if (normal < 135) return 'este';
  if (normal < 225) return 'sur';
  return 'oeste';
}

export function sideLabel(name: SideName): string {
  return `Vereda ${name}`;
}

function roadBbox(r: Road): { minLat: number; minLng: number; maxLat: number; maxLng: number } {
  if (r.min_lat !== undefined && r.min_lng !== undefined && r.max_lat !== undefined && r.max_lng !== undefined) {
    return { minLat: r.min_lat, minLng: r.min_lng, maxLat: r.max_lat, maxLng: r.max_lng };
  }
  let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180;
  for (const [lat, lng] of r.coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

/** Busca la calle y el tramo más cercanos a p (hasta maxDist metros). */
export function matchPoint(p: LatLng, roads: Road[], maxDist = 25): Match | null {
  const margin = (maxDist + 5) / 111320; // grados aprox.
  let best: Match | null = null;
  for (const r of roads) {
    const bb = roadBbox(r);
    if (p.lat < bb.minLat - margin || p.lat > bb.maxLat + margin) continue;
    if (p.lng < bb.minLng - margin * 2 || p.lng > bb.maxLng + margin * 2) continue;
    for (let i = 0; i < r.coords.length - 1; i++) {
      const a = { lat: r.coords[i][0], lng: r.coords[i][1] };
      const b = { lat: r.coords[i + 1][0], lng: r.coords[i + 1][1] };
      const pr = projectOnSegment(p, a, b);
      if (pr.dist <= maxDist && (!best || pr.dist < best.dist)) {
        best = {
          roadId: r.id,
          roadName: r.name,
          seg: i,
          side: sideOfSegment(p, a, b),
          dist: pr.dist,
          t: pr.t,
          point: pr.point,
        };
      }
    }
  }
  return best;
}

/** El tramo a→b corrido hacia una vereda, para dibujarlo. */
export function offsetSegment(a: LatLng, b: LatLng, side: Side, meters: number): [LatLng, LatLng] {
  const B = toLocal(a, b);
  const len = Math.hypot(B.x, B.y);
  if (len === 0) return [a, b];
  // normal izquierda = (-y, x)
  const nx = (-B.y / len) * side * meters;
  const ny = (B.x / len) * side * meters;
  return [fromLocal(a, nx, ny), fromLocal(a, B.x + nx, B.y + ny)];
}

export function segmentOf(road: Road, seg: number): [LatLng, LatLng] | null {
  if (seg < 0 || seg >= road.coords.length - 1) return null;
  return [
    { lat: road.coords[seg][0], lng: road.coords[seg][1] },
    { lat: road.coords[seg + 1][0], lng: road.coords[seg + 1][1] },
  ];
}

export function segmentLength(road: Road, seg: number): number {
  const s = segmentOf(road, seg);
  return s ? haversine(s[0], s[1]) : 0;
}

export type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export function bboxAround(center: LatLng, meters: number): Bbox {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos(center.lat * DEG));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

export function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    inner.minLat >= outer.minLat && inner.maxLat <= outer.maxLat &&
    inner.minLng >= outer.minLng && inner.maxLng <= outer.maxLng
  );
}
