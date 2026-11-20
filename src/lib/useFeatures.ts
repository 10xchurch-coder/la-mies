// Qué funciones de la app tiene prendidas la iglesia de esta persona.
import { useAuth } from '@/store/auth';
import { featureOn, pathOn, type FeatureKey } from './features';

export function useFeatures() {
  const { church } = useAuth();
  const disabled = church?.disabled_features ?? [];
  return {
    disabled,
    /** ¿Está prendida esta función? */
    on: (key: FeatureKey) => featureOn(disabled, key),
    /** ¿Se puede abrir esta dirección? (las que no son de ninguna función siempre se pueden) */
    pathOk: (path: string) => pathOn(disabled, path),
  };
}
