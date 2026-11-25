// Ubicación en familia: lo que hace ESTE teléfono para mandar dónde estoy.
//
// Hay dos maneras:
//  · "fondo": una tarea del sistema nos despierta con posiciones nuevas aunque la app esté cerrada (como Life360).
//    Solo en las versiones de la tienda cuyo permiso ya explica este uso (ver BG_MIN_BUILD en famLoc.ts).
//  · "abierta": mientras la app está abierta (versiones anteriores y la web).
// Convive con las otras tareas de GPS (salida, colectivo, chat en vivo): cada una tiene su nombre y no se tocan.
// Gasta poca batería: precisión media, un punto cada ~100 m o cada varios minutos, y los puntos llegan en tandas.
import { useSyncExternalStore } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { backgroundAllowed, isPaused, shouldSend, thinTrack } from './famLoc';
import { locMe, locPushMany, type LocMe, type PushStatus } from './famLocApi';
import { tx } from './i18n';

export const FAMILY_TASK = 'lamies-familia';
const KEY = 'lamies.famloc.device'; // { userId }: este teléfono manda la ubicación de esta cuenta
const LAST = 'lamies.famloc.last';  // { t, lat, lng }: lo último que se mandó
const OPTS = 'lamies.famloc.opts';  // versión de la configuración del GPS (si cambia, se reinicia la tarea)
const OPTS_VERSION = '2';

/** El número de compilación de la app instalada (no el de la actualización que bajó sola). 0 si no se puede saber. */
export function nativeBuild(): number {
  try {
    if (Platform.OS === 'ios') return Number(Constants.platform?.ios?.buildNumber ?? 0) || 0;
    if (Platform.OS === 'android') {
      const app = requireOptionalNativeModule<{ nativeBuildVersion?: string | null }>('ExpoApplication');
      return Number(app?.nativeBuildVersion ?? 0) || 0;
    }
  } catch {
    // sin el dato: se trata como versión vieja (solo con la app abierta)
  }
  return 0;
}

/** ¿Esta versión instalada puede compartir con la app cerrada? */
export const canBackground: boolean = Platform.OS !== 'web' && backgroundAllowed(Platform.OS, nativeBuild());

// ---------------------------------------------------------------------------
// Estado compartido entre la pantalla y el aviso del inicio
// ---------------------------------------------------------------------------
export type DeviceMode = 'fondo' | 'abierta' | 'no';
type State = { me: LocMe | null; mode: DeviceMode; loaded: boolean };
let state: State = { me: null, mode: 'no', loaded: false };
const listeners = new Set<() => void>();
function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function useFamLoc(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}

async function deviceUser(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? ((JSON.parse(raw) as { userId?: string }).userId ?? null) : null;
  } catch {
    return null;
  }
}

async function currentUser(): Promise<string | null> {
  try {
    return (await supabase.auth.getSession()).data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

async function stopTask() {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(FAMILY_TASK)) await Location.stopLocationUpdatesAsync(FAMILY_TASK);
  } catch {
    // ya estaba parada
  }
}

async function batteryPct(): Promise<number | null> {
  try {
    const v = await Battery.getBatteryLevelAsync();
    return v >= 0 ? Math.round(v * 100) : null;
  } catch {
    return null;
  }
}

/** Manda una posición si corresponde. Si la base dice que está apagado, este teléfono deja de mandar. */
export async function sendFix(loc: Location.LocationObject, force = false): Promise<PushStatus | null> {
  return sendFixes([loc], force);
}

/**
 * Manda todos los puntos que juntó el teléfono (se guardan 30 días en el historial).
 * Saca los repetidos del mismo lugar; el último queda como "dónde está ahora".
 */
export async function sendFixes(locs: Location.LocationObject[], force = false): Promise<PushStatus | null> {
  if (!locs.length) return null;
  let last: { t: number; lat: number; lng: number } | null = null;
  try {
    const raw = await AsyncStorage.getItem(LAST);
    last = raw ? JSON.parse(raw) : null;
  } catch {
    last = null;
  }
  const sorted = [...locs].sort((a, b) => a.timestamp - b.timestamp)
    .filter((l) => (l.coords.accuracy ?? 0) <= 150) // los puntos muy imprecisos ensucian el recorrido
    .filter((l) => !last || l.timestamp > last.t - 1000);
  if (!sorted.length) return null;
  const newest = sorted[sorted.length - 1];
  const pos = { lat: newest.coords.latitude, lng: newest.coords.longitude };
  if (!force && sorted.length === 1 && !shouldSend(last, pos)) return null;
  const battery = await batteryPct();
  const pts = thinTrack(sorted.map((l) => ({ t: l.timestamp, lat: l.coords.latitude, lng: l.coords.longitude, l })), 15, 60_000);
  const status = await locPushMany(pts.map(({ l }) => ({
    lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy, speed: l.coords.speed, heading: l.coords.heading,
    battery, at: l.timestamp,
  })));
  if (status === 'ok' || status === 'paused') await AsyncStorage.setItem(LAST, JSON.stringify({ t: newest.timestamp, ...pos }));
  if (status === 'off') await stopDevice();
  return status;
}

// La tarea de fondo. Si cambió la cuenta o se cerró la sesión, se apaga sola: nunca manda la ubicación de otro.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(FAMILY_TASK)) {
  TaskManager.defineTask(FAMILY_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
    if (!locations.length) return;
    const [owner, user] = await Promise.all([deviceUser(), currentUser()]);
    if (!owner || !user || owner !== user || !canBackground) {
      await stopDevice();
      return;
    }
    await sendFixes(locations);
  });
}

function disclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      tx('Compartir tu ubicación'),
      canBackground
        ? tx('La Mies recopila la ubicación de este teléfono, incluso con la app cerrada o la pantalla apagada, para que las personas que vos elegiste vean dónde estás y por dónde anduviste en los últimos 30 días. Podés pausarlo o apagarlo cuando quieras; al apagarlo se borra el historial. En el aviso que sigue elegí "Permitir todo el tiempo" (en iPhone, "Siempre").')
        : tx('La Mies usa la ubicación de este aparato para que las personas que vos elegiste vean dónde estás en el mapa, mientras tenés la app abierta. Podés pausarlo o apagarlo cuando quieras.'),
      [
        { text: tx('Ahora no'), style: 'cancel', onPress: () => resolve(false) },
        { text: tx('Continuar'), onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

async function startTask(): Promise<boolean> {
  if (!canBackground) return false;
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    const started = await Location.hasStartedLocationUpdatesAsync(FAMILY_TASK);
    const version = await AsyncStorage.getItem(OPTS).catch(() => null);
    if (started && version === OPTS_VERSION) return true;
    if (started) await Location.stopLocationUpdatesAsync(FAMILY_TASK); // configuración vieja: se vuelve a prender con la nueva
    await Location.startLocationUpdatesAsync(FAMILY_TASK, {
      // Como Life360: GPS de verdad y un punto cada ~25 m, para que el historial muestre las calles por donde anduvo.
      accuracy: Location.Accuracy.High,
      distanceInterval: 25,
      timeInterval: 60 * 1000,          // Android: como mucho un punto por minuto si está quieto
      deferredUpdatesInterval: 2 * 60 * 1000, // los puntos se juntan y suben en tandas (cuida la batería)
      deferredUpdatesDistance: 200,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: tx('La Mies · compartís tu ubicación'),
        notificationBody: tx('Te ven las personas que vos elegiste. Tocá para pausar o apagar.'),
        notificationColor: '#6D4BC3',
        killServiceOnDestroy: false,
      },
    });
    await AsyncStorage.setItem(OPTS, OPTS_VERSION).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Este teléfono empieza a mandar mi ubicación (lo toca la persona; nunca se prende solo). */
export async function startDevice(): Promise<DeviceMode> {
  const user = await currentUser();
  if (!user) throw new Error(tx('Tenés que entrar a la app.'));
  const already = await Location.getForegroundPermissionsAsync().catch(() => null);
  const needsBg = canBackground && (await Location.getBackgroundPermissionsAsync().catch(() => null))?.status !== 'granted';
  if ((already?.status !== 'granted' || needsBg) && !(await disclosure())) throw new Error(tx('Sin el permiso de ubicación no se puede compartir.'));
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error(tx('Falta el permiso de ubicación. Lo podés dar en los Ajustes del teléfono.'));
  if (needsBg) await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
  await AsyncStorage.setItem(KEY, JSON.stringify({ userId: user }));
  await AsyncStorage.removeItem(LAST);
  const mode: DeviceMode = (await startTask()) ? 'fondo' : 'abierta';
  setState({ mode });
  const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  if (here) await sendFix(here, true);
  return mode;
}

/** Este teléfono deja de mandar. */
export async function stopDevice(): Promise<void> {
  await stopTask();
  await AsyncStorage.multiRemove([KEY, LAST]).catch(() => undefined);
  setState({ mode: 'no' });
}

/** Vuelve a leer lo mío y acomoda este teléfono: si está apagado en la base o es otra cuenta, deja de mandar. */
export async function refreshFamLoc(): Promise<LocMe | null> {
  let me: LocMe | null = null;
  try {
    me = await locMe();
  } catch {
    setState({ loaded: true });
    return state.me; // sin señal: se queda como estaba
  }
  const [owner, user] = await Promise.all([deviceUser(), currentUser()]);
  let mode: DeviceMode = 'no';
  if (owner && (!user || owner !== user || !me?.enabled || !me.available)) {
    await stopDevice();
  } else if (owner) {
    mode = (await startTask()) ? 'fondo' : 'abierta';
  }
  setState({ me, mode, loaded: true });
  return me;
}

/**
 * Con la app abierta: sigue la posición y la manda (para las versiones sin segundo plano y la web,
 * y para que se vea al día mientras se mira el mapa). Devuelve cómo apagarlo.
 */
export async function watchWhileOpen(): Promise<() => void> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return () => undefined;
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 30_000 },
      (loc) => { sendFix(loc).catch(() => undefined); },
    );
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

/** Mi posición de ahora, para "Pedir ayuda" y para guardar un lugar. */
export async function hereNow(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

export const sharingNow = (me: LocMe | null): boolean => !!me && me.available && me.enabled && !isPaused(me.paused_until);
