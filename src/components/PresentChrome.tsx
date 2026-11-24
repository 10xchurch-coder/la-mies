// Modo presentación: lo que va al proyector tiene que salir limpio. Esto esconde los carteles de toda la app
// (salida en curso, "sin conexión", etc.) mientras se está en la pantalla de salida o en la vista de escenario.
import React from 'react';
import { usePathname } from 'expo-router';

/** ¿Esta dirección es una de las pantallas que se proyectan? */
export const isOutputPath = (path: string | null | undefined): boolean => /^\/presentar\/(salida|escenario)(\/|$)/.test(path ?? '');

export function HideOnOutput({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return isOutputPath(path) ? null : <>{children}</>;
}
