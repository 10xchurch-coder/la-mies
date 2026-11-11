// Armar los enlaces para abrir el recorrido del colectivo en Google Maps o Apple Maps. Sin pantalla, para poder probarlo.
export type RoutePoint = { lat: number; lng: number };

const fix = (n: number) => n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
const ll = (p: RoutePoint) => `${fix(p.lat)},${fix(p.lng)}`;

/** Google Maps acepta pocas paradas intermedias por enlace: el recorrido se parte en tramos. */
export const MAX_PER_LEG = 10;

/**
 * Un enlace por tramo. Cada tramo sale de donde está el chofer (el primero) o de la última parada del tramo anterior,
 * pasa por las paradas en orden y termina en la última.
 */
export function googleRouteUrls(stops: RoutePoint[], perLeg = MAX_PER_LEG): string[] {
  const out: string[] = [];
  for (let i = 0; i < stops.length; i += perLeg) {
    const leg = stops.slice(i, i + perLeg);
    const dest = leg[leg.length - 1];
    const way = leg.slice(0, -1);
    const origin = i > 0 ? `&origin=${ll(stops[i - 1])}` : '';
    out.push(`https://www.google.com/maps/dir/?api=1${origin}&destination=${ll(dest)}${way.length ? `&waypoints=${way.map(ll).join('%7C')}` : ''}&travelmode=driving`);
  }
  return out;
}

/** Ir a una sola parada con Google Maps. */
export const googleStopUrl = (p: RoutePoint) => `https://www.google.com/maps/dir/?api=1&destination=${ll(p)}&travelmode=driving`;
/** Ir a una sola parada con Apple Maps (Apple no acepta varias paradas en un enlace). */
export const appleStopUrl = (p: RoutePoint) => `https://maps.apple.com/?daddr=${ll(p)}&dirflg=d`;

/** Mueve un elemento un lugar hacia arriba o hacia abajo y devuelve la lista nueva. */
export function moved<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || j < 0 || index >= list.length || j >= list.length) return list;
  const out = [...list];
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}
