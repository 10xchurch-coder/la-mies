// Audio que sigue sonando con la app en segundo plano o la pantalla bloqueada (prédicas, radio y la Biblia narrada).
import { Platform } from 'react-native';
import { setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { tx } from './i18n';

/** El modo de audio de toda la app: suena en silencio y sigue en segundo plano. */
export function bgAudioMode(): void {
  if (Platform.OS === 'web') return;
  setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => undefined);
}

/** Muestra los controles en la pantalla bloqueada (en Android hace falta para que el audio no se corte a los minutos). */
export function lockScreenOn(player: AudioPlayer | null | undefined, title: string, artist = tx('La Mies')): void {
  if (Platform.OS === 'web' || !player) return;
  try {
    bgAudioMode();
    (player as unknown as { setActiveForLockScreen?: (on: boolean, meta?: { title?: string; artist?: string }) => void }).setActiveForLockScreen?.(true, { title, artist });
  } catch { /* versión vieja de la app: sigue sin controles */ }
}
