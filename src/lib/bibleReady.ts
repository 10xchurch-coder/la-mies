// Para las pantallas que muestran texto de la Biblia: avisa cuando los libros que hacen falta ya están listos.
// La RV1909 viene cargada con la app; otras versiones (King James) se piden libro por libro (ver ensureBook en bible.ts).
import { useEffect, useState } from 'react';
import { ensureBook, versionOf } from './bible';

/**
 * Pide los libros que se van a mostrar: pares [versión, libro]. Devuelve un número que cambia cuando terminan de llegar;
 * se pone en las dependencias de useMemo para volver a armar el texto. Si no hay nada que pedir, no hace nada.
 */
export function useBibleReady(need: [version: string | undefined, book: number][]): number {
  const [tick, setTick] = useState(0);
  const wanted = need.filter(([v]) => !!versionOf(v).load);
  const key = [...new Set(wanted.map(([v, b]) => `${versionOf(v).id}:${b}`))].sort().join(',');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    Promise.all(key.split(',').map((k) => { const [v, b] = k.split(':'); return ensureBook(versionOf(v), Number(b)); }))
      .then(() => { if (alive) setTick((t) => t + 1); });
    return () => { alive = false; };
  }, [key]);
  return tick;
}
