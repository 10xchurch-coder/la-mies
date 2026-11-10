// Colectivo en vivo: el teléfono del jefe de la ruta (o del chofer elegido) manda dónde está el colectivo,
// también con la pantalla apagada, hasta que toca "Llegamos" (o pasa una hora sin moverse).
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

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

function disclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Ubicación del colectivo',
      'La Mies recopila la ubicación de este teléfono para que los hermanos de la ruta vean dónde está el colectivo en el mapa, incluso con la app cerrada o la pantalla apagada. Solo se usa mientras el colectivo está en camino y se detiene cuando tocás "Llegamos". En el siguiente aviso elegí "Permitir todo el tiempo".',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

/** "Salimos": avisa a los de la ruta y empieza a mandar la ubicación. */
export async function startBus(groupId: string, name: string): Promise<void> {
  if (Platform.OS === 'web') throw new Error('El colectivo en vivo se prende desde el teléfono.');
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Necesitamos el permiso de ubicación para mostrar el colectivo.');
  const already = await Location.getBackgroundPermissionsAsync();
  if (already.status !== 'granted' && !(await disclosure())) throw new Error('Sin el permiso de ubicación "todo el tiempo", el colectivo solo se ve con la app abierta.');
  if (already.status !== 'granted') await Location.requestBackgroundPermissionsAsync();
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
      notificationTitle: 'La Mies · colectivo en camino',
      notificationBody: `Los hermanos de ${name} ven dónde está el colectivo. Tocá "Llegamos" al terminar.`,
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
