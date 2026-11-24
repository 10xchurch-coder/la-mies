// Los ajustes de la iglesia que agrega la parte de administración (Mis ofrendas, lema, primeros pasos), para el menú.
import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { churchExtras, type ChurchExtras } from './givingData';

const NONE: ChurchExtras = { my_giving_on: false, motto: null, setup_pending: false, setup_step: 0, is_new: false };
let cache: { church: string; value: ChurchExtras } | null = null;
const listeners = new Set<() => void>();

/** Volver a leerlos (después de prender "Mis ofrendas" o de terminar los primeros pasos). */
export function refreshChurchExtras(): void {
  cache = null;
  listeners.forEach((l) => l());
}

export function useChurchExtras(): ChurchExtras {
  const { church } = useAuth();
  const id = church?.id ?? null;
  const [value, setValue] = useState<ChurchExtras>(cache && cache.church === id ? cache.value : NONE);
  useEffect(() => {
    if (!id) { setValue(NONE); return; }
    let live = true;
    const load = () => {
      if (cache && cache.church === id) { setValue(cache.value); return; }
      churchExtras().then((v) => { cache = { church: id, value: v }; if (live) setValue(v); }).catch(() => undefined);
    };
    load();
    listeners.add(load);
    return () => { live = false; listeners.delete(load); };
  }, [id]);
  return value;
}
