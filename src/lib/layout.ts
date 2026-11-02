// Tamaño de pantalla: teléfono, tablet (iPad) o computadora (web).
import { Platform, useWindowDimensions } from 'react-native';

export const CONTENT_MAX_WIDTH = 900;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isWide = width >= 700;        // tablet o ventana grande
  const isDesktop = width >= 1000;    // computadora
  return {
    width,
    height,
    isWide,
    isDesktop,
    isWeb: Platform.OS === 'web',
    /** Cuántas columnas entran si cada una mide ~minWidth. */
    columns: (minWidth: number, min = 1, max = 8) => Math.max(min, Math.min(max, Math.floor(Math.min(width, CONTENT_MAX_WIDTH) / minWidth))),
  };
}
