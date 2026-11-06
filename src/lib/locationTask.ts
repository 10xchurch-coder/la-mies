// Seguimiento GPS durante una salida, también con la pantalla apagada.
//
// El sistema operativo nos despierta con nuevas posiciones aunque la app esté
// cerrada. Acá las guardamos en el teléfono, las subimos en tandas, y vigilamos
// la velocidad: si parece un vehículo, cortamos la salida solos en el último
// punto en que todavía se iba caminando.
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getCachedRoads } from './roadsCache';
import { coverageFromTrack, detectVehicle, walkedDistance, type SideOverride, type TrackPoint } from './track';

export const LOCATION_TASK = 'lamies-salida';

const K = {
  session: 'lamies.session.active',
  points: 'lamies.session.points',
  pending: 'lamies.session.pending',
  overrides: 'lamies.session.overrides',
  lastFlush: 'lamies.session.lastFlush',
  lastCoverage: 'lamies.session.lastCoverage',
  autoStop: 'lamies.session.autoStop',
};

export type ActiveSession = { id: string; startedAt: number; kind?: 'soulwinning' | 'flyers' };

const FLUSH_EVERY_MS = 30_000;
const FLUSH_MIN_POINTS = 8;
const COVERAGE_EVERY_MS = 60_000;
const MAX_LOCAL_POINTS = 6000; // ~8 horas a un punto cada 5 s

// ---------------------------------------------------------------------------
// Estado local (AsyncStorage) — compartido entre la pantalla y la tarea de fondo
// ---------------------------------------------------------------------------
async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const getActiveSession = () => readJson<ActiveSession | null>(K.session, null);
export const getLocalPoints = () => readJson<TrackPoint[]>(K.points, []);
export const getOverrides = () => readJson<SideOverride[]>(K.overrides, []);
export type AutoStopNotice = { at: number; cutoff: number; pending?: boolean };
export const getAutoStopNotice = () => readJson<AutoStopNotice | null>(K.autoStop, null);

export async function clearAutoStopNotice(): Promise<void> {
  await AsyncStorage.removeItem(K.autoStop);
}

async function setActiveSession(s: ActiveSession | null): Promise<void> {
  if (s) await AsyncStorage.setItem(K.session, JSON.stringify(s));
  else await AsyncStorage.removeItem(K.session);
}

async function appendPoints(pts: TrackPoint[]): Promise<TrackPoint[]> {
  const all = await getLocalPoints();
  const merged = all.concat(pts).sort((a, b) => a.t - b.t);
  const trimmed = merged.length > MAX_LOCAL_POINTS ? merged.slice(merged.length - MAX_LOCAL_POINTS) : merged;
  await AsyncStorage.setItem(K.points, JSON.stringify(trimmed));
  const pending = await readJson<TrackPoint[]>(K.pending, []);
  await AsyncStorage.setItem(K.pending, JSON.stringify(pending.concat(pts)));
  return trimmed;
}

export async function addSideOverride(o: SideOverride): Promise<void> {
  const list = await getOverrides();
  await AsyncStorage.setItem(K.overrides, JSON.stringify(list.concat(o)));
}

async function clearLocal(): Promise<void> {
  await AsyncStorage.multiRemove([K.session, K.points, K.pending, K.overrides, K.lastFlush, K.lastCoverage]);
}

// ---------------------------------------------------------------------------
// Subida al servidor
// ---------------------------------------------------------------------------
function toPayload(p: TrackPoint) {
  return { t: new Date(p.t).toISOString(), lat: p.lat, lng: p.lng, acc: p.acc ?? null, spd: p.spd ?? null, hdg: p.hdg ?? null };
}

export class SessionEndedError extends Error {
  constructor() {
    super('La salida ya terminó');
  }
}

/** Sube los puntos pendientes. Si no hay señal, quedan para la próxima. */
export async function flushPending(sessionId: string, force = false, upTo?: number): Promise<boolean> {
  const pending = await readJson<TrackPoint[]>(K.pending, []);
  const lastFlush = Number((await AsyncStorage.getItem(K.lastFlush)) ?? 0);
  const due = force || pending.length >= FLUSH_MIN_POINTS || Date.now() - lastFlush >= FLUSH_EVERY_MS;
  if (!pending.length || !due) return true;
  const batch = (upTo ? pending.filter((p) => p.t <= upTo) : pending).slice(0, 300);
  if (!batch.length) return true;
  const { error } = await supabase.rpc('upload_track_points', {
    p_session: sessionId,
    p_points: batch.map(toPayload),
  });
  if (error) {
    // La salida ya se cerró en el servidor (por ejemplo, sola por estar quieto mucho rato): dejamos de marcar.
    if (/ya termin/i.test(error.message ?? '')) throw new SessionEndedError();
    return false;
  }
  const sent = new Set(batch.map((p) => p.t));
  await AsyncStorage.setItem(K.pending, JSON.stringify(pending.filter((p) => !sent.has(p.t))));
  await AsyncStorage.setItem(K.lastFlush, String(Date.now()));
  return true;
}

/** Calcula las veredas cubiertas hasta ahora y las manda (idempotente). */
export async function syncCoverage(sessionId: string, force = false, upTo?: number): Promise<{ blocks: number } | null> {
  const last = Number((await AsyncStorage.getItem(K.lastCoverage)) ?? 0);
  if (!force && Date.now() - last < COVERAGE_EVERY_MS) return null;
  const roads = await getCachedRoads();
  if (!roads.length) return null;
  let points = await getLocalPoints();
  if (upTo) points = points.filter((p) => p.t <= upTo);
  const overrides = await getOverrides();
  const result = coverageFromTrack(points, roads, overrides);
  if (result.events.length) {
    const { error } = await supabase.rpc('upsert_coverage', { p_session: sessionId, p_events: result.events });
    if (error) return null;
  }
  await AsyncStorage.setItem(K.lastCoverage, String(Date.now()));
  return { blocks: result.blocks };
}

// ---------------------------------------------------------------------------
// Empezar / terminar
// ---------------------------------------------------------------------------
export async function startTracking(sessionId: string, kind: 'soulwinning' | 'flyers' = 'soulwinning'): Promise<void> {
  await clearLocal();
  await setActiveSession({ id: sessionId, startedAt: Date.now(), kind });
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 6,
    deferredUpdatesInterval: 10000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'La Mies · salida en curso',
      notificationBody: 'Marcando las calles que recorrés. Tocá para abrir.',
      notificationColor: '#1F6B45',
      killServiceOnDestroy: false,
    },
  });
}

export async function isTrackingRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

async function stopUpdates(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // ya estaba detenido
  }
}

export type EndResult = { distance_m: number; blocks: number };

/** Termina la salida: sube lo que falta, manda la cobertura y la cierra en el servidor. */
export async function finishTracking(sessionId: string): Promise<EndResult> {
  await stopUpdates();
  try {
    await flushPending(sessionId, true);
  } catch (e) {
    if (!(e instanceof SessionEndedError)) throw e;
  }
  const points = await getLocalPoints();
  const cov = (await syncCoverage(sessionId, true)) ?? { blocks: 0 };
  const distance_m = walkedDistance(points);
  const { error } = await supabase.rpc('end_session', {
    p_session: sessionId,
    p_distance_m: distance_m,
    p_blocks: cov.blocks,
    p_auto_stopped: false,
  });
  if (error) throw error;
  await clearLocal();
  return { distance_m, blocks: cov.blocks };
}

/** Recorta la salida en un momento dado (me olvidé de apagarla / vehículo). */
export async function trimTracking(sessionId: string, cutoffMs: number, auto: boolean): Promise<void> {
  await stopUpdates();
  try {
    await flushPending(sessionId, true, cutoffMs);
  } catch (e) {
    if (!(e instanceof SessionEndedError)) throw e;
  }
  await syncCoverage(sessionId, true, cutoffMs);
  const { error } = await supabase.rpc('trim_session', {
    p_session: sessionId,
    p_cutoff: new Date(cutoffMs).toISOString(),
    p_auto_stopped: auto,
  });
  if (error) throw error;
  await clearLocal();
}

/** Si quedó una salida abierta de antes (la app se cerró), la deja consistente. */
export async function recoverSession(): Promise<ActiveSession | null> {
  const active = await getActiveSession();
  if (!active) {
    await stopUpdates();
    return null;
  }
  // Un corte automático que no se pudo mandar por falta de señal: reintentar.
  const notice = await getAutoStopNotice();
  if (notice?.pending) {
    try {
      await trimTracking(active.id, notice.cutoff, true);
      await AsyncStorage.setItem(K.autoStop, JSON.stringify({ at: notice.at, cutoff: notice.cutoff }));
      return null;
    } catch {
      return active;
    }
  }
  const { data } = await supabase.from('sessions').select('id, ended_at').eq('id', active.id).maybeSingle();
  if (!data || data.ended_at) {
    await stopUpdates();
    await clearLocal();
    return null;
  }
  if (!(await isTrackingRunning())) {
    try {
      await startTrackingAgain(active);
    } catch {
      // sin permisos: la pantalla lo va a mostrar
    }
  }
  return active;
}

async function startTrackingAgain(active: ActiveSession): Promise<void> {
  await setActiveSession(active);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 6,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'La Mies · salida en curso',
      notificationBody: 'Marcando las calles que recorrés. Tocá para abrir.',
      notificationColor: '#1F6B45',
    },
  });
}

// ---------------------------------------------------------------------------
// La tarea de fondo
// ---------------------------------------------------------------------------
async function notify(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, sound: true }, trigger: null });
  } catch {
    // sin permiso de notificaciones: no pasa nada
  }
}

export async function handleLocations(locations: Location.LocationObject[]): Promise<void> {
  const active = await getActiveSession();
  if (!active || !locations.length) return;
  const pts: TrackPoint[] = locations.map((l) => ({
    t: l.timestamp,
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    acc: l.coords.accuracy,
    spd: l.coords.speed,
    hdg: l.coords.heading,
  }));
  const all = await appendPoints(pts);

  // ¿Vehículo? Cortamos en el último punto caminando y avisamos.
  const base = Math.max(0, all.length - 60);
  const check = detectVehicle(all.slice(base));
  if (check.vehicle) {
    const cutoff = all[base + check.lastWalkingIndex]?.t ?? all[all.length - 1].t;
    try {
      await trimTracking(active.id, cutoff, true);
      await AsyncStorage.setItem(K.autoStop, JSON.stringify({ at: Date.now(), cutoff }));
      await notify('Salida terminada', 'Parece que vas en un vehículo. Cortamos la salida en el último punto que caminaste.');
    } catch {
      // sin señal: lo intentamos la próxima vez que se abra la app
      await AsyncStorage.setItem(K.autoStop, JSON.stringify({ at: Date.now(), cutoff, pending: true }));
      await stopUpdates();
    }
    return;
  }

  try {
    await flushPending(active.id);
  } catch (e) {
    if (e instanceof SessionEndedError) {
      await stopUpdates();
      await clearLocal();
      await notify('Salida terminada', 'La salida se cerró sola porque estuviste un buen rato en el mismo lugar. Tus calles ya quedaron guardadas.');
      return;
    }
    throw e;
  }
  await syncCoverage(active.id);
}

// En la computadora no hay GPS en segundo plano: las salidas se hacen desde el teléfono.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
    if (locations?.length) await handleLocations(locations);
  });
}
