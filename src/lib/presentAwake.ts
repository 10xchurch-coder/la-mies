// Modo presentación: que la pantalla de la tablet o del teléfono no se apague sola mientras proyecta.
// En la web lo hace la pantalla de salida con el "wake lock" del navegador.
import { Platform } from 'react-native';

type KeepAwake = { activateKeepAwakeAsync?: (tag?: string) => Promise<void>; deactivateKeepAwake?: (tag?: string) => Promise<void> };

/** Deja la pantalla prendida. Devuelve cómo soltarla. Si el aparato no puede, no hace nada. */
export function keepScreenOn(tag: string): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let mod: KeepAwake | null = null;
  try {
    // Viene con Expo (no es un paquete nuevo). Si faltara en alguna versión instalada, se sigue sin esto.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-keep-awake') as KeepAwake;
    Promise.resolve(mod.activateKeepAwakeAsync?.(tag)).catch(() => undefined);
  } catch { mod = null; }
  return () => { try { Promise.resolve(mod?.deactivateKeepAwake?.(tag)).catch(() => undefined); } catch { /* nada */ } };
}
