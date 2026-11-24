// El idioma elegido: se guarda en el teléfono (no en la cuenta) y se aplica al abrir la app.
// La lista de textos en inglés pesa bastante: se pide recién cuando alguien elige inglés, para que la app no tarde más en arrancar.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANG, getLang, hasDict, isLang, registerDict, setLangNow, subscribeLang, type Lang } from './i18n';

const KEY = 'lamies.idioma';

/** Deja lista la lista de textos de ese idioma. Si no se pudo bajar (web sin conexión), devuelve false. */
async function ensureDict(l: Lang): Promise<boolean> {
  if (hasDict(l)) return true;
  try {
    // Un import() por idioma: en la web cada uno sale como un archivo aparte que se baja solo si hace falta.
    if (l === 'en') registerDict('en', (await import('../i18n/en.json')).default as Record<string, string>);
    return hasDict(l);
  } catch {
    return false;
  }
}

/** Lee el idioma guardado y lo aplica. Se llama una vez, antes de dibujar la app. */
export async function loadLang(): Promise<Lang> {
  let saved: Lang = DEFAULT_LANG;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (isLang(raw)) saved = raw;
  } catch {
    saved = DEFAULT_LANG;
  }
  if (saved !== DEFAULT_LANG && await ensureDict(saved)) setLangNow(saved);
  return getLang();
}

/** Cambia el idioma ahora mismo y lo deja guardado. Devuelve false si no se pudo cargar ese idioma. */
export async function saveLang(next: Lang): Promise<boolean> {
  if (!(await ensureDict(next))) return false;
  setLangNow(next);
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {
    // Si no se puede guardar, igual queda aplicado hasta cerrar la app.
  }
  return true;
}

/** El idioma actual, para las pantallas: se vuelven a dibujar cuando cambia. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang);
}
