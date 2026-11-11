// Ubicación en tiempo real en un chat (15, 30 o 60 minutos), también con la pantalla apagada.
// Funciona como el colectivo en vivo: una tarea de fondo manda la posición a cada mensaje "en vivo" mío que siga vigente,
// y se apaga sola cuando se vence el tiempo o la persona toca "Dejar de compartir".
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatLiveStop, chatLiveUpdate, chatSendLocation, type ChatRoomKind, type RoomRef } from './chat';

export const CHAT_LIVE_TASK = 'lamies-chat-live';
const KEY = 'lamies.chat.live';
const LAST = 'lamies.chat.live.last';
const SEND_EVERY_MS = 10_000;

export type LiveShare = { id: string; room: ChatRoomKind; until: number };

export async function getLiveShares(): Promise<LiveShare[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LiveShare[]) : [];
    return list.filter((s) => s.until > Date.now());
  } catch {
    return [];
  }
}
const save = (list: LiveShare[]) => AsyncStorage.setItem(KEY, JSON.stringify(list));

async function stopUpdates() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(CHAT_LIVE_TASK)) await Location.stopLocationUpdatesAsync(CHAT_LIVE_TASK);
  } catch {
    // ya estaba parado
  }
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(CHAT_LIVE_TASK)) {
  TaskManager.defineTask(CHAT_LIVE_TASK, async ({ data, error }) => {
    if (error) return;
    const loc = ((data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? []).slice(-1)[0];
    if (!loc) return;
    const list = await getLiveShares();
    if (!list.length) { await save([]); return stopUpdates(); }
    const last = Number((await AsyncStorage.getItem(LAST)) ?? 0);
    if (Date.now() - last < SEND_EVERY_MS) return;
    await AsyncStorage.setItem(LAST, String(Date.now()));
    const alive: LiveShare[] = [];
    for (const s of list) if (await chatLiveUpdate(s.room, s.id, loc.coords.latitude, loc.coords.longitude)) alive.push(s);
    await save(alive);
    if (!alive.length) await stopUpdates();
  });
}

async function ensurePermission(): Promise<void> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Necesitamos el permiso de ubicación para mandar dónde estás.');
}

/** Dónde estoy ahora (para mandar una ubicación). */
export async function currentPlace(): Promise<{ lat: number; lng: number }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => reject(new Error('No pudimos saber dónde estás. Activá la ubicación del navegador.')), { enableHighAccuracy: true, timeout: 15000 });
    });
  }
  await ensurePermission();
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

function disclosure(minutes: number): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Ubicación en tiempo real',
      `La Mies va a mandar tu ubicación a este chat cada pocos segundos durante ${minutes} minutos, también con la pantalla apagada. Podés dejar de compartir cuando quieras, y se corta sola al terminar el tiempo. Solo lo ven los que están en este chat.`,
      [{ text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) }, { text: 'Compartir', onPress: () => resolve(true) }],
      { cancelable: false },
    );
  });
}

/** Empieza a compartir. Devuelve el id del mensaje o null si la persona se arrepintió. */
export async function startLiveShare(r: RoomRef, minutes: 15 | 30 | 60): Promise<string | null> {
  if (!(await disclosure(minutes))) return null;
  const here = await currentPlace();
  const id = await chatSendLocation(r, here.lat, here.lng, minutes);
  if (Platform.OS === 'web') return id; // en la web solo sale la posición de ahora
  const list = await getLiveShares();
  await save([...list, { id, room: r.room, until: Date.now() + minutes * 60_000 }]);
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
  await Location.startLocationUpdatesAsync(CHAT_LIVE_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'La Mies · compartiendo tu ubicación',
      notificationBody: `Los del chat ven dónde estás por ${minutes} minutos. Entrá a la app para dejar de compartir.`,
      notificationColor: '#1F6B45',
    },
  }).catch(() => undefined);
  return id;
}

export async function stopLiveShare(room: ChatRoomKind, id: string): Promise<void> {
  await chatLiveStop(room, id);
  const list = (await getLiveShares()).filter((s) => s.id !== id);
  await save(list);
  if (!list.length) await stopUpdates();
}
