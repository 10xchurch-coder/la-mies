// Vuelve a cargar cuando la app vuelve a primer plano (en el navegador: cuando se vuelve a mirar la pestaña)
// y cuando cambia el día con la app abierta. Así nadie se queda viendo el versículo de ayer.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { isoDate } from './format';

export function useRefreshOnResume(fn: () => void, everyMs = 60_000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let day = isoDate(new Date());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        day = isoDate(new Date());
        ref.current();
      }
    });
    const timer = setInterval(() => {
      const d = isoDate(new Date());
      if (d !== day) {
        day = d;
        ref.current();
      }
    }, everyMs);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [everyMs]);
}
