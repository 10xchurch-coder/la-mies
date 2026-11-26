// Aviso destacado antes de pedir la ubicación (lo exige Google Play): primero se explica, en la app, qué se recopila y para qué;
// la persona toca "Aceptar" y recién ahí aparece el permiso del teléfono. Si ya dio el permiso, no se muestra nada.
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tx } from './i18n';

export type LocUse = 'mapa' | 'salida' | 'colectivo' | 'familia' | 'chat';

/** El texto del aviso, según para qué se usa. Con `background` avisa que también es con la app cerrada. */
export function disclosureText(use: LocUse, background: boolean): { title: string; body: string } {
  const end = tx('Podés cambiarlo cuando quieras en los Ajustes del teléfono. Si tocás "Aceptar", el teléfono te va a pedir el permiso.');
  const always = background ? ` ${tx('Para eso, en el aviso del teléfono elegí "Permitir todo el tiempo".')}` : '';
  switch (use) {
    case 'salida': return { title: tx('Ubicación durante la salida'),
      body: `${tx('La Mies recopila datos de ubicación para marcar en el mapa las calles que recorrés durante una salida de evangelismo, incluso cuando la app está cerrada o no está en uso. Solo se usa mientras la salida está activa y se detiene al finalizarla. Tu equipo y los líderes de tu iglesia ven el recorrido.')}${always} ${end}` };
    case 'colectivo': return { title: tx('Ubicación del colectivo'),
      body: `${tx('La Mies recopila datos de ubicación para que los hermanos de la ruta vean en el mapa dónde está el colectivo, incluso cuando la app está cerrada o no está en uso. Solo se usa mientras el viaje está activo y se detiene al terminarlo.')}${always} ${end}` };
    case 'familia': return { title: tx('Compartir tu ubicación'),
      body: background
        ? `${tx('La Mies recopila datos de ubicación para que las personas que vos elegiste vean dónde estás y por dónde anduviste en los últimos 30 días, incluso cuando la app está cerrada o no está en uso. Podés pausarlo o apagarlo cuando quieras.')}${always} ${end}`
        : `${tx('La Mies recopila datos de ubicación para que las personas que vos elegiste vean dónde estás en el mapa mientras tenés la app abierta. Podés pausarlo o apagarlo cuando quieras.')} ${end}` };
    case 'chat': return { title: tx('Mandar tu ubicación'),
      body: background
        ? `${tx('La Mies recopila datos de ubicación para mandar dónde estás a este chat durante el tiempo que elijas, incluso cuando la app está cerrada o no está en uso. Se detiene sola al terminar ese tiempo o cuando la cortás.')}${always} ${end}`
        : `${tx('La Mies recopila datos de ubicación para mandar dónde estás a este chat. Solo se manda cuando vos lo tocás.')} ${end}` };
    default: return { title: tx('Tu ubicación en el mapa'),
      body: `${tx('La Mies recopila datos de ubicación para mostrarte en el mapa dónde estás y las calles de tu zona. Se usa solo con la app abierta y no se comparte con nadie.')} ${end}` };
  }
}

function show(use: LocUse, background: boolean): Promise<boolean> {
  const { title, body } = disclosureText(use, background);
  return new Promise((resolve) => {
    Alert.alert(title, body, [
      { text: tx('Ahora no'), style: 'cancel', onPress: () => resolve(false) },
      { text: tx('Aceptar'), onPress: () => resolve(true) },
    ], { cancelable: false });
  });
}

const NO_KEY = 'lamies.loc.no.';

/**
 * Pide la ubicación mostrando antes el aviso. Devuelve qué permisos quedaron dados.
 * `quiet`: si la persona ya dijo "Ahora no" a este aviso, no se vuelve a mostrar solo (para pantallas que lo piden al abrir).
 */
export async function askLocation(use: LocUse, opts: { background?: boolean; quiet?: boolean } = {}): Promise<{ fg: boolean; bg: boolean }> {
  const wantBg = !!opts.background && Platform.OS !== 'web';
  let fg = (await Location.getForegroundPermissionsAsync().catch(() => null))?.status === 'granted';
  let bg = wantBg ? (await Location.getBackgroundPermissionsAsync().catch(() => null))?.status === 'granted' : false;
  if (fg && (!wantBg || bg)) return { fg, bg };
  if (Platform.OS !== 'web') {
    if (opts.quiet && (await AsyncStorage.getItem(NO_KEY + use).catch(() => null))) return { fg, bg };
    if (!(await show(use, wantBg))) {
      await AsyncStorage.setItem(NO_KEY + use, '1').catch(() => undefined);
      return { fg, bg };
    }
    await AsyncStorage.removeItem(NO_KEY + use).catch(() => undefined);
  }
  if (!fg) fg = (await Location.requestForegroundPermissionsAsync().catch(() => null))?.status === 'granted';
  if (fg && wantBg && !bg) bg = (await Location.requestBackgroundPermissionsAsync().catch(() => null))?.status === 'granted';
  return { fg, bg };
}
