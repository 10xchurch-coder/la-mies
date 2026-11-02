import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import { LargeSecureStore } from './secureStore';

// Los dos valores públicos de Supabase se pegan en app.json → expo.extra
// (supabaseUrl y supabaseAnonKey). Así viajan con la app cuando se compila en la nube.
const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseAnonKey?: string };
const pick = (v?: string) => (v && !v.startsWith('PEGAR_ACA') ? v : undefined);
const url = pick(process.env.EXPO_PUBLIC_SUPABASE_URL) ?? pick(extra.supabaseUrl);
const anonKey = pick(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ?? pick(extra.supabaseAnonKey);

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'https://falta-configurar.invalid', anonKey ?? 'falta-configurar', {
  auth: {
    // En el teléfono la sesión va cifrada; en la web usa el almacenamiento del navegador.
    storage: Platform.OS === 'web' ? undefined : new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renueva el token solo mientras la app está en primer plano.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Mensaje legible para mostrar en pantalla. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Error desconocido';
  if (typeof e === 'string') return e;
  const any = e as { message?: string; error_description?: string };
  const m = any.message ?? any.error_description ?? 'Error';
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos';
  if (/email not confirmed/i.test(m)) return 'Primero confirmá tu correo (mirá tu bandeja de entrada)';
  if (/network request failed/i.test(m)) return 'Sin conexión. Probá de nuevo cuando tengas señal.';
  if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Iniciá sesión.';
  if (/password should be at least/i.test(m)) return 'La contraseña tiene que tener al menos 8 caracteres';
  return m;
}
