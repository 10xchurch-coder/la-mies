// Modo claro u oscuro: se guarda en el teléfono y se aplica al abrir la app.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { getThemeMode, setThemeMode, type ThemeMode } from '@/theme';

const KEY = 'lamies.theme';

/** Lee el modo guardado (o el del sistema la primera vez) y lo aplica. */
export async function loadThemeMode(): Promise<ThemeMode> {
  let mode: ThemeMode | null = null;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') mode = saved;
  } catch {
    mode = null;
  }
  if (!mode) mode = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  setThemeMode(mode);
  return mode;
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  setThemeMode(mode);
  try {
    await AsyncStorage.setItem(KEY, mode);
  } catch {
    // Si no se puede guardar, igual queda aplicado hasta cerrar la app.
  }
}

export { getThemeMode };
