// Android: muchos teléfonos (Samsung, Motorola, Xiaomi…) "duermen" las apps con la pantalla apagada
// para ahorrar batería, y el recorrido se corta a los pocos minutos. Antes de empezar una salida
// pedimos que La Mies quede fuera del ahorro de batería (un solo toque en el aviso del sistema).
import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import { tx } from './i18n';

const PKG = Constants.expoConfig?.android?.package ?? 'com.hopeforargentina.lamies';

function ask(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      tx('Para que el recorrido no se corte'),
      tx('Tu teléfono pone a dormir las apps con la pantalla apagada y la salida deja de marcar las calles. ') +
        tx('Tocá "Permitir" y en el aviso que sigue elegí "Permitir" para que La Mies pueda seguir en segundo plano (solo usa el GPS durante una salida).'),
      [
        { text: tx('Ahora no'), style: 'cancel', onPress: () => resolve(false) },
        { text: tx('Permitir'), onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

/** Si el ahorro de batería está activo para La Mies, ofrece quitarlo. No frena la salida si dicen que no. */
export async function ensureNoBatteryOptimization(): Promise<void> {
  if (Platform.OS !== 'android') return;
  let enabled = false;
  try {
    enabled = await Battery.isBatteryOptimizationEnabledAsync();
  } catch {
    return;
  }
  if (!enabled || !(await ask())) return;
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, { data: `package:${PKG}` });
  } catch {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    } catch {
      // sin pantalla de ajustes: seguimos igual
    }
  }
}

/** iPhone: para que el recorrido siga con la pantalla apagada, la ubicación tiene que estar en "Siempre".
 *  Si quedó en "Mientras se usa", lo explicamos y abrimos los Ajustes. No frena la salida. */
export async function ensureAlwaysLocationIOS(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return; // la salida misma va a pedir el permiso y explicar
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') return;
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    Alert.alert(
      tx('Para que el recorrido no se corte'),
      tx('Con la pantalla apagada el iPhone deja de marcar las calles si la ubicación de La Mies está en "Mientras se usa". ') +
        tx('En Ajustes tocá Ubicación y elegí "Siempre" (y dejá activada "Ubicación exacta"). La Mies solo usa el GPS durante una salida.'),
      [
        { text: tx('Seguir igual'), style: 'cancel', onPress: () => resolve() },
        { text: tx('Abrir Ajustes'), onPress: () => { Linking.openSettings().catch(() => undefined); resolve(); } },
      ],
      { cancelable: false },
    );
  });
}
