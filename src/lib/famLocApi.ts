// Ubicación en familia: lo que se le pide a la base. Las tablas están cerradas; todo pasa por estas funciones.
import { supabase } from './supabase';
import type { Via } from './famLoc';

export type LocViewer = { id: string; name: string; via: Via; photo_path: string | null };
export type LocPlace = { id: string; name: string; lat: number; lng: number; radius_m: number; inside: boolean };
export type LocMe = {
  available: boolean;
  enabled: boolean;
  share_family: boolean;
  share_pastors: boolean;
  paused_until: string | null;
  located_at: string | null;
  help_at: string | null;
  lat: number | null;
  lng: number | null;
  viewers: LocViewer[];
  family_left: { id: string; name: string }[];
  family_count: number;
  family?: { id: string; name: string; photo_path: string | null }[];
  family_asks?: { id: string; name: string }[];
  family_sent?: { id: string; name: string }[];
  pastor_count: number;
  places: LocPlace[];
  home: { lat: number; lng: number } | null;
};
export type LocPerson = {
  profile_id: string; name: string; photo_path: string | null; lat: number | null; lng: number | null; accuracy: number | null;
  battery: number | null; moving: boolean; located_at: string | null; help_at: string | null; place: string | null; via: Via;
};
export type PushStatus = 'ok' | 'paused' | 'off';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

export async function locMe(): Promise<LocMe | null> {
  return ok(await supabase.rpc('loc_me')) as LocMe | null;
}

export async function locVisible(): Promise<LocPerson[]> {
  return (ok(await supabase.rpc('loc_visible')) ?? []) as LocPerson[];
}

export async function locTrail(owner: string): Promise<{ latitude: number; longitude: number }[]> {
  const rows = (ok(await supabase.rpc('loc_trail', { p_owner: owner })) ?? []) as [number, number, number][];
  return rows.map((r) => ({ latitude: Number(r[1]), longitude: Number(r[2]) }));
}

export async function locSet(on: boolean, family: boolean, pastors: boolean): Promise<void> {
  ok(await supabase.rpc('loc_set', { p_on: on, p_family: family, p_pastors: pastors }));
}

export async function locViewerAdd(id: string): Promise<void> {
  ok(await supabase.rpc('loc_viewer_add', { p_viewer: id }));
}

export async function locViewerRemove(id: string): Promise<void> {
  ok(await supabase.rpc('loc_viewer_remove', { p_viewer: id }));
}

export async function locPause(until: Date | null): Promise<void> {
  ok(await supabase.rpc('loc_pause', { p_until: until ? until.toISOString() : null }));
}

export type Fix = { lat: number; lng: number; accuracy?: number | null; speed?: number | null; heading?: number | null; battery?: number | null; at?: number | null };

/** Manda mi posición. Sin señal devuelve null (se intenta con la próxima). */
export async function locPush(f: Fix): Promise<PushStatus | null> {
  const { data, error } = await supabase.rpc('loc_push', {
    p_lat: f.lat, p_lng: f.lng, p_accuracy: f.accuracy ?? null, p_speed: f.speed ?? null, p_heading: f.heading ?? null,
    p_battery: f.battery == null ? null : Math.round(f.battery), p_at: f.at ? new Date(f.at).toISOString() : null,
  });
  if (error) return null;
  return data as PushStatus;
}

/** Varios puntos juntos: se guardan todos en el historial (30 días) y el último queda como posición actual. */
export async function locPushMany(points: Fix[]): Promise<PushStatus | null> {
  if (!points.length) return null;
  const { data, error } = await supabase.rpc('loc_push_many', { p_points: points.map((f) => ({
    lat: f.lat, lng: f.lng, accuracy: f.accuracy ?? null, speed: f.speed ?? null, heading: f.heading ?? null,
    battery: f.battery == null ? null : Math.round(f.battery), at: f.at ?? Date.now(),
  })) });
  if (error) return null;
  return data as PushStatus;
}

export type HistPoint = { t: number; latitude: number; longitude: number; speed: number | null };

/** Por dónde anduvo una persona entre dos horas (hasta 30 días atrás). */
export async function locHistory(owner: string, from: Date, to: Date): Promise<HistPoint[]> {
  const rows = (ok(await supabase.rpc('loc_history', { p_owner: owner, p_from: from.toISOString(), p_to: to.toISOString() })) ?? []) as [number, number, number, number | null][];
  return rows.map((r) => ({ t: Number(r[0]) * 1000, latitude: Number(r[1]), longitude: Number(r[2]), speed: r[3] == null ? null : Number(r[3]) }));
}

/** Sumar a alguien a mi familia: 'unidos', 'pedido' (espera que acepte) o 'ya'. */
export async function locFamilyAdd(id: string): Promise<'unidos' | 'pedido' | 'ya'> {
  return ok(await supabase.rpc('loc_family_add', { p_other: id })) as 'unidos' | 'pedido' | 'ya';
}

export async function locFamilyAnswer(from: string, yes: boolean): Promise<void> {
  ok(await supabase.rpc('loc_family_answer', { p_from: from, p_yes: yes }));
}

export async function locFamilyRemove(id: string): Promise<void> {
  ok(await supabase.rpc('loc_family_remove', { p_other: id }));
}

export async function locHelp(pos: { lat: number; lng: number } | null): Promise<number> {
  return ok(await supabase.rpc('loc_help', { p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null })) as number;
}

export async function locHelpClear(): Promise<void> {
  ok(await supabase.rpc('loc_help_clear'));
}

export async function locPlaceSave(p: { id?: string | null; name: string; lat: number; lng: number; radius: number }): Promise<string> {
  return ok(await supabase.rpc('loc_place_save', { p_id: p.id ?? null, p_name: p.name, p_lat: p.lat, p_lng: p.lng, p_radius: p.radius })) as string;
}

export async function locPlaceArchive(id: string): Promise<void> {
  ok(await supabase.rpc('loc_place_archive', { p_id: id }));
}

/** Las cuentas activas de la iglesia, para elegir por nombre con quién compartir. */
export async function churchPeople(): Promise<{ id: string; name: string }[]> {
  const rows = ok(await supabase.from('profiles').select('id, display_name, disabled_at').is('disabled_at', null).order('display_name')) ?? [];
  return (rows as { id: string; display_name: string }[]).map((r) => ({ id: r.id, name: r.display_name }));
}
