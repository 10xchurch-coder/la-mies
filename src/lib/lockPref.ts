// El miembro común elige si quiere pedir Face ID / huella al abrir la app. Se guarda en el teléfono.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lamies.lock.optin';
let current: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();

export async function loadLockOptIn(): Promise<boolean> {
  if (current !== null) return current;
  try { current = (await AsyncStorage.getItem(KEY)) === '1'; } catch { current = false; }
  return current;
}

export async function setLockOptIn(v: boolean) {
  current = v;
  listeners.forEach((l) => l(v));
  try { await AsyncStorage.setItem(KEY, v ? '1' : '0'); } catch { /* no pasa nada */ }
}

/** null mientras se lee del teléfono. */
export function useLockOptIn(): boolean | null {
  const [v, setV] = useState<boolean | null>(current);
  useEffect(() => {
    let alive = true;
    loadLockOptIn().then((x) => { if (alive) setV(x); });
    listeners.add(setV);
    return () => { alive = false; listeners.delete(setV); };
  }, []);
  return v;
}

// Recordamos en el teléfono si esta cuenta necesita el bloqueo, por si un día abre sin internet
// y todavía no se pudieron leer sus permisos.
const REQ = 'lamies.lock.required';
let required: boolean | null = null;
export async function loadLockRequired(): Promise<boolean> {
  if (required !== null) return required;
  try { required = (await AsyncStorage.getItem(REQ)) === '1'; } catch { required = false; }
  return required;
}
export function rememberLockRequired(v: boolean) {
  if (required === v) return;
  required = v;
  AsyncStorage.setItem(REQ, v ? '1' : '0').catch(() => undefined);
}
export function useLockRequiredCache(): boolean | null {
  const [v, setV] = useState<boolean | null>(required);
  useEffect(() => { let alive = true; loadLockRequired().then((x) => { if (alive) setV(x); }); return () => { alive = false; }; }, []);
  return v;
}
