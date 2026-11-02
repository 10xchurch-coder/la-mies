// Calles de OpenStreetMap cercanas, guardadas en el teléfono para poder saber
// "en qué vereda estoy" aunque no haya señal (y para no pedirlas a cada rato).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { bboxAround, bboxContains, type Bbox, type LatLng } from './geo';
import type { RoadRow } from '../types';

const KEY = 'lamies.roads.cache';
const FRESH_MS = 24 * 3600 * 1000;

type Cache = { bbox: Bbox; roads: RoadRow[]; at: number };

export async function getCachedRoads(): Promise<RoadRow[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const c = JSON.parse(raw) as Cache;
    return c.roads ?? [];
  } catch {
    return [];
  }
}

export async function fetchRoads(bbox: Bbox): Promise<RoadRow[]> {
  const { data, error } = await supabase.rpc('roads_in_bbox', {
    p_min_lat: bbox.minLat,
    p_min_lng: bbox.minLng,
    p_max_lat: bbox.maxLat,
    p_max_lng: bbox.maxLng,
  });
  if (error) throw error;
  return (data ?? []) as RoadRow[];
}

/**
 * Asegura que tengamos las calles alrededor de un punto. Si lo guardado ya cubre
 * la zona y es reciente, no pide nada.
 */
export async function ensureRoadsAround(center: LatLng, radiusM = 1500): Promise<RoadRow[]> {
  const need = bboxAround(center, Math.min(radiusM, 600));
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw) as Cache;
      if (c.bbox && bboxContains(c.bbox, need) && Date.now() - c.at < FRESH_MS) return c.roads;
    }
  } catch {
    // seguimos y pedimos de nuevo
  }
  const bbox = bboxAround(center, radiusM);
  const roads = await fetchRoads(bbox);
  const cache: Cache = { bbox, roads, at: Date.now() };
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  return roads;
}
