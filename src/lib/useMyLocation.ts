// Dónde estoy y hacia dónde miro, para el punto azul del mapa (como en Google Maps).
// La ubicación solo se usa en la pantalla: no se guarda ni se comparte (eso pasa únicamente durante una salida).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { headingFromOrientation, headingMoved, smoothHeading } from './heading';

export type MyLocation = { lat: number; lng: number; accuracy: number | null };

type OrientationEvt = { webkitCompassHeading?: number | null; alpha?: number | null; absolute?: boolean };
type IOSOrientation = { requestPermission?: () => Promise<'granted' | 'denied'> };

export function useMyLocation(active = true): {
  pos: MyLocation | null;
  heading: number | null;
  /** En iPhone la brújula pide permiso y tiene que ser al tocar un botón. Devuelve si quedó andando. */
  askCompass: () => Promise<boolean>;
} {
  const [pos, setPos] = useState<MyLocation | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const shown = useRef<number | null>(null);
  const smooth = useRef<number | null>(null);
  const webOff = useRef<(() => void) | null>(null);

  const push = useCallback((raw: number) => {
    smooth.current = smoothHeading(smooth.current, raw);
    if (headingMoved(shown.current, smooth.current)) {
      shown.current = smooth.current;
      setHeading(Math.round(smooth.current));
    }
  }, []);

  const listenWeb = useCallback(() => {
    if (typeof window === 'undefined' || webOff.current) return;
    const on = (e: Event) => {
      const angle = (typeof screen !== 'undefined' && screen.orientation?.angle) || 0;
      const h = headingFromOrientation(e as unknown as OrientationEvt, angle);
      if (h !== null) push(h);
    };
    window.addEventListener('deviceorientationabsolute', on, true);
    window.addEventListener('deviceorientation', on, true);
    webOff.current = () => {
      window.removeEventListener('deviceorientationabsolute', on, true);
      window.removeEventListener('deviceorientation', on, true);
    };
  }, [push]);

  const askCompass = useCallback(async () => {
    if (Platform.OS !== 'web') return true;
    const D = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null) as unknown as IOSOrientation | null;
    try {
      if (D && typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') return false;
    } catch {
      return false;
    }
    listenWeb();
    return true;
  }, [listenWeb]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let posSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        const ok = perm.status === 'granted' || (await Location.requestForegroundPermissionsAsync()).status === 'granted';
        if (!ok || !alive) return;
        posSub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 2000 }, (l) => {
          if (alive) setPos({ lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? null });
        });
        if (Platform.OS !== 'web') {
          headSub = await Location.watchHeadingAsync((h) => {
            if (!alive) return;
            const v = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
            if (Number.isFinite(v)) push(v);
          });
        }
      } catch {
        // sin GPS o sin permiso: el mapa sigue andando, sin el punto
      }
    })();
    // Brújula en la web: en Android anda sola; en iPhone este primer intento falla (pide que sea al tocar un botón)
    // y queda para cuando toquen la flechita del mapa.
    if (Platform.OS === 'web') askCompass().catch(() => undefined);
    return () => {
      alive = false;
      posSub?.remove();
      headSub?.remove();
      webOff.current?.();
      webOff.current = null;
    };
  }, [active, push, askCompass]);

  return { pos, heading, askCompass };
}
