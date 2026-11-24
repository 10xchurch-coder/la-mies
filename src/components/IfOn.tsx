// Muestra lo de adentro solo si la iglesia tiene prendida esa función (o la función de esa pantalla).
// Es para los botones que, desde una pantalla, llevan a otra parte de la app que se puede apagar.
import React from 'react';
import { useFeatures } from '@/lib/useFeatures';
import type { FeatureKey } from '@/lib/features';

export function IfOn({ feature, path, children }: { feature?: FeatureKey; path?: string; children: React.ReactNode }) {
  const { on, pathOk } = useFeatures();
  if (feature && !on(feature)) return null;
  if (path && !pathOk(path)) return null;
  return <>{children}</>;
}
