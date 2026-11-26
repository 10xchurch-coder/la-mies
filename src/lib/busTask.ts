// Colectivo en vivo: el teléfono del jefe de la ruta (o del chofer elegido) manda dónde está el colectivo,
// también con la pantalla apagada, hasta que toca "Llegamos" (o pasa una hora sin moverse).
import { askLocation } from './locConsent';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { tx } from './i18n';

export const BUS_TASK = 'lamies-colectivo';
const KEY = 'lamies.bus.run';
const LAST = 'lamies.bus.last';
const SEND_EVERY_MS = 8000;

export type BusRunLocal = { runId: string; groupId: string; name: string; startedAt: number };

export async function getBusRun(): Promise<BusRunLocal | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BusRunLocal) : null;
  } catch {
    return null;
  }
}

async function sendPosition(runId: string, loc: Location.LocationObject): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_bus_run', {
    p_run: runId, p_lat: loc.coords.latitude, p_lng: loc.coords.longitude, p_heading: loc.coords.heading ?? null,
  });
  if (error) return true; // sin señal: se intenta de nuevo con el próximo punto
  return data !== false;
}

async function stopUpdates() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BUS_TASK)) await Location.stopLocationUpdatesAsync(BUS_TASK);
  } catch {
    // ya estaba parado
  }
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(BUS_TASK)) {
  TaskManager.defineTask(BUS_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
    const loc = locations[locations.length - 1];
    if (!loc) return;
    const run = await getBusRun();
    if (!run) return stopUpdates();
    const last = Number((await AsyncStorage.getItem(LAST)) ?? 0);
    if (Date.now() - last < SEND_EVERY_MS) return;
    await AsyncStorage.setItem(LAST, String(Date.now()));
    const alive = await sendPosition(run.runId, loc);
    if (!alive) {
      // La salida se terminó desde otro teléfono o se cerró sola.
      await AsyncStorage.multiRemove([KEY, LAST]);
      await stopUpdates();
    }
  });
}

/** "Salimos": avisa a los de la ruta y empieza a mandar la ubicación. */
export async function startBus(groupId: string, name: string): Promise<void> {
  if (Platform.OS === 'web') throw new Error(tx('El colectivo en vivo se prende desde el teléfono.'));
  const perm = await askLocation('colectivo', { background: true });
  if (!perm.fg) throw new Error(tx('Necesitamos el permiso de ubicación para mostrar el colectivo.'));
  const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  const { data, error } = await supabase.rpc('start_bus_run', { p_group: groupId, p_lat: here?.coords.latitude ?? null, p_lng: here?.coords.longitude ?? null });
  if (error) throw error;
  await AsyncStorage.setItem(KEY, JSON.stringify({ runId: data as string, groupId, name, startedAt: Date.now() } satisfies BusRunLocal));
  await AsyncStorage.removeItem(LAST);
  await Location.startLocationUpdatesAsync(BUS_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 8000,
    distanceInterval: 15,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: tx('La Mies · colectivo en camino'),
      notificationBody: tx('Los hermanos de {name} ven dónde está el colectivo. Tocá "Llegamos" al terminar.', { name }),
      notificationColor: '#1F6B45',
    },
  });
}

/** "Llegamos": deja de mandar la ubicación y cierra la salida. */
export async function stopBus(runId?: string | null): Promise<void> {
  const run = await getBusRun();
  const id = runId ?? run?.runId;
  await stopUpdates();
  await AsyncStorage.multiRemove([KEY, LAST]);
  if (id) {
    const { error } = await supabase.rpc('end_bus_run', { p_run: id });
    if (error) throw error;
  }
}
