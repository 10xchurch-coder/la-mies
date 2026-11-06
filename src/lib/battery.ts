// Android: muchos teléfonos (Samsung, Motorola, Xiaomi…) "duermen" las apps con la pantalla apagada
// para ahorrar batería, y el recorrido se corta a los pocos minutos. Antes de empezar una salida
// pedimos que La Mies quede fuera del ahorro de batería (un solo toque en el aviso del sistema).
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';

const PKG = Constants.expoConfig?.android?.package ?? 'com.hopeforargentina.lamies';

function ask(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Para que el recorrido no se corte',
      'Tu teléfono pone a dormir las apps con la pantalla apagada y la salida deja de marcar las calles. ' +
        'Tocá "Permitir" y en el aviso que sigue elegí "Permitir" para que La Mies pueda seguir en segundo plano (solo usa el GPS durante una salida).',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Permitir', onPress: () => resolve(true) },
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
