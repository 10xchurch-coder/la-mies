// Ubicación en familia: las reglas, sin nada de la base ni de la pantalla, para poder probarse solas.
// OJO: quién puede ver a quién lo decide la BASE (0082_ubicacion_familia.sql). Lo de acá es el mismo
// criterio escrito en claro, para las pruebas y para lo que muestra la pantalla; no es lo que protege el dato.
import { haversine, type LatLng } from './geo';

/**
 * Compartir con la app cerrada (segundo plano) solo se prende en las versiones de la tienda cuyo permiso
 * ya explica este uso. Las que están hoy en los teléfonos (iPhone 10, Android 17) dicen que el GPS de fondo
 * es solo para salidas y colectivo: ahí se comparte únicamente con la app abierta.
 */
export const BG_MIN_BUILD = { ios: 11, android: 18 } as const;

export function backgroundAllowed(os: string, build: number | string | null | undefined): boolean {
  const min = os === 'ios' ? BG_MIN_BUILD.ios : os === 'android' ? BG_MIN_BUILD.android : null;
  if (min === null) return false; // la web no tiene segundo plano
  const n = Number(build);
  return Number.isFinite(n) && n >= min;
}

// ---------------------------------------------------------------------------
// Quién me ve
// ---------------------------------------------------------------------------
export type Via = 'familia' | 'pastor' | 'persona';
export type ViewerRow = { id: string; via: Via; status: 'on' | 'off' | 'removed' };

/**
 * Lo que hace la base al guardar mis elecciones: la lista es explícita.
 * "Mi familia" y "Los pastores" copian a los de HOY; a quien saqué a mano no se lo vuelve a sumar;
 * destildar un grupo apaga solo a los que entraron por ese grupo.
 */
export function applyChoices(rows: ViewerRow[], me: string, c: { family: boolean; pastors: boolean; familyIds: string[]; pastorIds: string[] }): ViewerRow[] {
  const out = new Map(rows.map((r) => [r.id, { ...r }]));
  for (const r of out.values()) {
    if (r.status === 'on' && ((r.via === 'familia' && !c.family) || (r.via === 'pastor' && !c.pastors))) r.status = 'off';
  }
  const add = (ids: string[], via: Via) => {
    for (const id of ids) {
      if (id === me) continue;
      const cur = out.get(id);
      if (!cur) out.set(id, { id, via, status: 'on' });
      else if (cur.status === 'off') cur.status = 'on';
    }
  };
  if (c.family) add(c.familyIds, 'familia');
  if (c.pastors) add(c.pastorIds, 'pastor');
  return [...out.values()];
}

export type ShareState = { enabled: boolean; pausedUntil?: string | number | Date | null; viewers: ViewerRow[] };

export function isPaused(pausedUntil: string | number | Date | null | undefined, now: number = Date.now()): boolean {
  if (pausedUntil == null) return false;
  const t = new Date(pausedUntil).getTime();
  return Number.isFinite(t) && t > now;
}

/** ¿Esta persona puede ver mi ubicación ahora? Apagado o en pausa: nadie. Si no está en mi lista: no, sea quien sea. */
export function canSee(share: ShareState | null | undefined, viewerId: string, now: number = Date.now()): boolean {
  if (!share || !share.enabled || isPaused(share.pausedUntil, now)) return false;
  return share.viewers.some((v) => v.id === viewerId && v.status === 'on');
}

export const activeViewers = (rows: ViewerRow[]): string[] => rows.filter((r) => r.status === 'on').map((r) => r.id);

// ---------------------------------------------------------------------------
// Pausa
// ---------------------------------------------------------------------------
export type PauseKind = 'hora' | 'manana';

/** Hasta cuándo va la pausa: una hora, o hasta mañana a las 6 de la mañana (hora del teléfono). */
export function pauseUntil(kind: PauseKind, now: Date = new Date()): Date {
  if (kind === 'hora') return new Date(now.getTime() + 60 * 60 * 1000);
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Lugares: llegar y salir
// ---------------------------------------------------------------------------
export type Place = { id: string; name: string; lat: number; lng: number; radius_m: number };
export type PlaceEvent = { place: Place; kind: 'llego' | 'salio' };

/** Con el GPS muy flojo no se decide nada. */
export const MAX_PLACE_ACCURACY = 200;
/** Para salir hay que alejarse un poco más que para entrar: así no avisa de más cuando el GPS baila en el borde. */
export const leaveDistance = (radius: number): number => radius * 1.25 + 30;

export function placeChange(wasInside: boolean, distance: number, radius: number): 'llego' | 'salio' | null {
  if (!wasInside && distance <= radius) return 'llego';
  if (wasInside && distance > leaveDistance(radius)) return 'salio';
  return null;
}

/**
 * De la posición anterior a la nueva: en qué lugares quedé y qué avisos salen.
 * La primera posición (recién prendido) acomoda dónde estoy pero no avisa a nadie.
 */
export function placeEvents(inside: string[], places: Place[], pos: LatLng, opts: { accuracy?: number | null; first?: boolean } = {}): { inside: string[]; events: PlaceEvent[] } {
  if ((opts.accuracy ?? 0) > MAX_PLACE_ACCURACY) return { inside, events: [] };
  const now = new Set(inside);
  const events: PlaceEvent[] = [];
  for (const p of places) {
    const change = placeChange(now.has(p.id), haversine({ lat: p.lat, lng: p.lng }, pos), p.radius_m);
    if (change === 'llego') now.add(p.id);
    if (change === 'salio') now.delete(p.id);
    if (change && !opts.first) events.push({ place: p, kind: change });
  }
  return { inside: [...now], events };
}

export const placeEventText = (firstName: string, e: PlaceEvent): string =>
  e.kind === 'llego' ? `${firstName} llegó a ${e.place.name}` : `${firstName} salió de ${e.place.name}`;

// ---------------------------------------------------------------------------
// Lo que manda el teléfono
// ---------------------------------------------------------------------------
export const SEND_EVERY_MS = 60_000;
export const SEND_MIN_METERS = 80;

/** ¿Vale la pena mandar esta posición? Si me moví, o si pasó un rato (para que se vea "hace 3 min" y la batería). */
export function shouldSend(last: { t: number; lat: number; lng: number } | null, pos: LatLng, now: number = Date.now()): boolean {
  if (!last) return true;
  const dt = now - last.t;
  if (dt < 15_000) return false;
  if (haversine({ lat: last.lat, lng: last.lng }, pos) >= SEND_MIN_METERS) return true;
  return dt >= SEND_EVERY_MS * 5; // quieto: una vez cada 5 minutos alcanza
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------
export function agoText(iso: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (iso == null) return 'sin ubicación todavía';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(s)) return 'sin ubicación todavía';
  if (s < 90) return 'recién';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

/** Una posición de hace más de 15 minutos ya no es "ahora": se muestra apagada. */
export const isStale = (iso: string | null | undefined, now: number = Date.now()): boolean =>
  !iso || now - new Date(iso).getTime() > 15 * 60 * 1000;

export function sharingLine(n: number): string {
  if (n <= 0) return 'Tu ubicación está prendida, pero todavía no la ve nadie';
  return n === 1 ? 'Estás compartiendo tu ubicación con 1 persona' : `Estás compartiendo tu ubicación con ${n} personas`;
}

export function batteryText(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return `Batería ${Math.round(pct)}%`;
}

/** El mapa se acomoda para que entren todos, y nunca más cerca que unas cuadras. */
export function regionFor(points: LatLng[]): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.5), longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.5),
  };
}
