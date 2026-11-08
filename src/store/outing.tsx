// La salida activa: empezar, ver cómo va, corregir la vereda, terminar.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { ensureRoadsAround, getCachedRoads } from '../lib/roadsCache';
import {
  addSideOverride, clearAutoStopNotice, finishTracking, getActiveSession, getAutoStopNotice, getLocalPoints,
  getOverrides, recoverSession, startTracking, trimTracking, type ActiveSession, type AutoStopNotice, type EndResult,
} from '../lib/locationTask';
import { matchPoint, sideName, type Match, type SideName } from '../lib/geo';
import { coverageFromTrack, walkedDistance, type TrackPoint } from '../lib/track';
import type { OutingKind, RoadRow, TeamLiveRow } from '../types';
import { useAuth } from './auth';

/** Aviso antes del permiso del sistema: qué datos, para qué y cuándo (requisito de Google Play). */
function backgroundDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Ubicación durante la salida',
      'La Mies recopila datos de tu ubicación para marcar en el mapa las calles que recorrés durante una salida de evangelismo, incluso cuando la app está cerrada o no está en uso. Solo se usa mientras la salida está activa y se detiene al finalizarla. En el siguiente aviso elegí "Permitir todo el tiempo".',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

export type SideInfo = { match: Match | null; name: SideName | null; overridden: boolean };

type OutingState = {
  ready: boolean;
  active: ActiveSession | null;
  points: TrackPoint[];
  roads: RoadRow[];
  distanceM: number;
  blocks: number;
  presentations: number;
  promises: number;
  contacts: number;
  side: SideInfo;
  backgroundGranted: boolean;
  autoStop: AutoStopNotice | null;
  start: (kind: OutingKind) => Promise<void>;
  stop: () => Promise<EndResult>;
  trim: (cutoffMs: number) => Promise<void>;
  flipSide: () => Promise<void>;
  dismissAutoStop: () => Promise<void>;
  refreshRoads: (center: { lat: number; lng: number }) => Promise<void>;
};

const Ctx = createContext<OutingState | null>(null);

export function OutingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [roads, setRoads] = useState<RoadRow[]>([]);
  const [blocks, setBlocks] = useState(0);
  const [counts, setCounts] = useState({ presentations: 0, promises: 0, contacts: 0 });
  const [side, setSide] = useState<SideInfo>({ match: null, name: null, overridden: false });
  const [backgroundGranted, setBackgroundGranted] = useState(false);
  const [autoStop, setAutoStop] = useState<AutoStopNotice | null>(null);
  const lastBlocksCalc = useRef(0);

  // Al abrir la app: ¿quedó una salida abierta? ¿hubo un corte automático?
  useEffect(() => {
    if (!session) {
      setReady(true);
      return;
    }
    (async () => {
      const a = await recoverSession();
      setActive(a);
      setRoads(await getCachedRoads());
      setAutoStop(await getAutoStopNotice());
      setReady(true);
    })();
  }, [session]);

  // Mientras hay salida: leer los puntos guardados cada 3 s y calcular la vereda.
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const tick = async () => {
      const pts = await getLocalPoints();
      if (stopped) return;
      setPoints(pts);
      const last = pts[pts.length - 1];
      if (last) {
        let rs = roads;
        if (!rs.length) {
          rs = await getCachedRoads();
          setRoads(rs);
        }
        const m = matchPoint(last, rs);
        const overrides = await getOverrides();
        let name: SideName | null = null;
        let overridden = false;
        if (m) {
          let s = m.side;
          for (const o of overrides) if (o.roadId === m.roadId && last.t >= o.since) { s = o.side; overridden = true; }
          const r = rs.find((x) => x.id === m.roadId);
          if (r) {
            const a = { lat: r.coords[m.seg][0], lng: r.coords[m.seg][1] };
            const b = { lat: r.coords[m.seg + 1][0], lng: r.coords[m.seg + 1][1] };
            name = sideName(a, b, s);
          }
        }
        setSide({ match: m, name, overridden });
        if (Date.now() - lastBlocksCalc.current > 15000 && rs.length) {
          lastBlocksCalc.current = Date.now();
          setBlocks(coverageFromTrack(pts, rs, overrides).blocks);
        }
      }
      // La salida pudo cortarse sola en la tarea de fondo.
      const still = await getActiveSession();
      if (!still) {
        setActive(null);
        setAutoStop(await getAutoStopNotice());
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, roads]);

  // Contadores de la salida (presentaciones, promesas, casas) cada 30 s.
  useEffect(() => {
    if (!active || !session) return;
    let stopped = false;
    const load = async () => {
      const { data } = await supabase.rpc('team_live');
      if (stopped) return;
      const mine = ((data ?? []) as TeamLiveRow[]).find((r) => r.user_id === session.user.id);
      if (mine) setCounts({ presentations: mine.presentations, promises: mine.promises, contacts: mine.contacts });
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, session]);

  const refreshRoads = useCallback(async (center: { lat: number; lng: number }) => {
    try {
      setRoads(await ensureRoadsAround(center));
    } catch {
      // sin señal: seguimos con lo que haya
    }
  }, []);

  const start = useCallback(async (kind: OutingKind) => {
    if (Platform.OS === 'web') throw new Error('Las salidas se hacen desde el teléfono: la computadora no puede seguir el recorrido.');
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') throw new Error('Necesitamos el permiso de ubicación para marcar las calles.');
    // Aviso destacado que Google exige antes de pedir la ubicación en segundo plano.
    const already = await Location.getBackgroundPermissionsAsync();
    if (already.status !== 'granted' && !(await backgroundDisclosure())) {
      throw new Error('Sin el permiso de ubicación en segundo plano no podemos marcar las calles con el teléfono bloqueado.');
    }
    const bg = already.status === 'granted' ? already : await Location.requestBackgroundPermissionsAsync();
    setBackgroundGranted(bg.status === 'granted');
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // opcional
    }
    const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await refreshRoads({ lat: here.coords.latitude, lng: here.coords.longitude });
    const { data, error } = await supabase.rpc('start_session', { p_kind: kind });
    if (error) throw error;
    const id = data as string;
    await startTracking(id, kind);
    setPoints([]);
    setBlocks(0);
    setCounts({ presentations: 0, promises: 0, contacts: 0 });
    setAutoStop(null);
    setActive({ id, startedAt: Date.now(), kind });
  }, [refreshRoads]);

  const stop = useCallback(async () => {
    if (!active) throw new Error('No hay salida activa');
    const res = await finishTracking(active.id);
    setActive(null);
    setPoints([]);
    return res;
  }, [active]);

  const trim = useCallback(
    async (cutoffMs: number) => {
      if (!active) throw new Error('No hay salida activa');
      await trimTracking(active.id, cutoffMs, false);
      setActive(null);
      setPoints([]);
    },
    [active],
  );

  const flipSide = useCallback(async () => {
    if (!side.match) return;
    const current = side.overridden ? side.name : null;
    const m = side.match;
    const r = roads.find((x) => x.id === m.roadId);
    let newSide: 1 | -1 = m.side === 1 ? -1 : 1;
    // Si ya estaba corregida, volver a la detectada; si no, invertir.
    if (current && r) newSide = m.side;
    await addSideOverride({ roadId: m.roadId, since: Date.now() - 20000, side: newSide });
    if (r) {
      const a = { lat: r.coords[m.seg][0], lng: r.coords[m.seg][1] };
      const b = { lat: r.coords[m.seg + 1][0], lng: r.coords[m.seg + 1][1] };
      setSide({ match: m, name: sideName(a, b, newSide), overridden: newSide !== m.side });
    }
  }, [side, roads]);

  const dismissAutoStop = useCallback(async () => {
    await clearAutoStopNotice();
    setAutoStop(null);
  }, []);

  const value = useMemo<OutingState>(
    () => ({
      ready,
      active,
      points,
      roads,
      distanceM: walkedDistance(points),
      blocks,
      presentations: counts.presentations,
      promises: counts.promises,
      contacts: counts.contacts,
      side,
      backgroundGranted,
      autoStop,
      start,
      stop,
      trim,
      flipSide,
      dismissAutoStop,
      refreshRoads,
    }),
    [ready, active, points, roads, blocks, counts, side, backgroundGranted, autoStop, start, stop, trim, flipSide, dismissAutoStop, refreshRoads],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOuting(): OutingState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOuting fuera de OutingProvider');
  return v;
}
