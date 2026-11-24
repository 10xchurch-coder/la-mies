// Las funciones que el pastor prende o apaga llegan solas a todos los teléfonos: no hace falta reinstalar ni volver a entrar.
// Se vuelve a mirar al abrir la app, al volver a ella (o a la pestaña del navegador) y cada dos minutos mientras está abierta.
// Solo se piden dos datos chicos; si cambiaron, se recarga la iglesia entera.
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/store/auth';
import { churchSwitches } from './funcionesData';
import { switchesChanged } from './features';

export const SWITCH_POLL_MS = 120_000;

export function useChurchSync(): void {
  const { church, refreshProfile } = useAuth();
  const ref = useRef({ church, refreshProfile });
  ref.current = { church, refreshProfile };
  const id = church?.id ?? null;
  useEffect(() => {
    if (!id) return;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const now = await churchSwitches(id);
        if (now && switchesChanged(now, ref.current.church)) await ref.current.refreshProfile();
      } catch { /* sin señal: se prueba de nuevo más tarde */ } finally { busy = false; }
    };
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') check(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, SWITCH_POLL_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id]);
}
