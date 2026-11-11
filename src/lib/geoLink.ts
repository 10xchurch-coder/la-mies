// Sacar una ubicación de lo que alguien pega: un enlace de Google Maps (largo o corto), de Apple Maps, "geo:" o "-27.36, -55.89".
export type LatLng = { lat: number; lng: number };

const ok = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;
const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';

export function parseCoords(text: string): LatLng | null {
  const s = decodeURIComponent(String(text ?? '').trim().replace(/\+/g, ' ')).replace(/%2C/gi, ',');
  const pats = [
    new RegExp(`!3d${NUM}!4d${NUM}`),                       // datos del lugar en enlaces largos de Google
    new RegExp(`@${NUM},\\s*${NUM}`),                        // .../@-27.36,-55.89,17z
    new RegExp(`[?&](?:q|ll|query|center|destination|daddr|sll)=${NUM},\\s*${NUM}`),
    new RegExp(`^geo:${NUM},${NUM}`),
    new RegExp(`^${NUM}\\s*[,; ]\\s*${NUM}$`),               // "-27.36, -55.89"
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) { const r = ok(Number(m[1]), Number(m[2])); if (r) return r; }
  }
  return null;
}

const SHORT = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i;
/** Igual que parseCoords, pero si es un enlace corto de Google lo abre para ver a dónde lleva. */
export async function resolvePlace(text: string): Promise<LatLng | null> {
  const t = String(text ?? '').trim();
  const direct = parseCoords(t);
  if (direct) return direct;
  const url = t.match(/https?:\/\/\S+/)?.[0];
  if (!url || !SHORT.test(url)) return url ? parseCoords(url) : null;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const fromUrl = parseCoords(res.url);
    if (fromUrl) return fromUrl;
    const html = (await res.text()).slice(0, 200_000);
    return parseCoords(html.match(/[?&]center=[^"&]+/)?.[0] ?? '') ?? parseCoords(html.match(/@-?\d{1,3}\.\d+,-?\d{1,3}\.\d+/)?.[0] ?? '');
  } catch {
    return null;
  }
}

/** Enlace para abrir un lugar en la app de mapas del teléfono (o en el navegador). */
export function mapsUrl(lat: number, lng: number, label?: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}${label ? `(${encodeURIComponent(label)})` : ''}`;
}
