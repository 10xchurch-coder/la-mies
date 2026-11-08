// Actualizaciones por internet: al abrir la app (y al volver a ella) busca si hay una versión nueva,
// la baja y le pregunta a la persona si quiere aplicarla ya. Así no hace falta cerrar y abrir dos veces.
import { useEffect } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

let busy = false;
let lastCheck = 0;

async function check() {
  if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled || busy) return;
  if (Date.now() - lastCheck < 60_000) return;
  busy = true;
  lastCheck = Date.now();
  try {
    const r = await Updates.checkForUpdateAsync();
    if (!r.isAvailable) return;
    const f = await Updates.fetchUpdateAsync();
    if (!f.isNew) return;
    Alert.alert('Hay una versión nueva de La Mies', 'Ya se descargó. ¿La abrimos ahora?', [
      { text: 'Más tarde', style: 'cancel' },
      { text: 'Actualizar', onPress: () => { Updates.reloadAsync().catch(() => undefined); } },
    ]);
  } catch {
    // Sin internet o el servidor no respondió: se vuelve a intentar la próxima vez.
  } finally {
    busy = false;
  }
}

/** Revisa al abrir la app y cada vez que vuelve al frente. */
export function useOtaUpdates() {
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);
}

/** "actualización del 7/11 21:40" para mostrar en Ajustes. */
export function updateLabel(): string {
  if (Platform.OS === 'web' || !Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return 'instalada';
  return `actualización del ${Updates.createdAt.toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}
