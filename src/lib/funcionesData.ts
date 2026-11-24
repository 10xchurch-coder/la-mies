// Funciones de la iglesia: lo que se pide a la base (0088). Quién puede cambiar qué lo decide la base.
import { supabase } from './supabase';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** Guarda de una vez la lista completa de lo apagado (la elección rápida de los primeros pasos). */
export async function setFeatures(off: readonly string[]): Promise<string[]> {
  return (ok(await supabase.rpc('set_features', { p_off: [...off] })) ?? []) as string[];
}

/** Guarda qué versiones de la Biblia permite la iglesia y cuál se abre primero. */
export async function setBible(versions: readonly string[], def: string): Promise<{ versions: string[]; default: string }> {
  return ok(await supabase.rpc('set_bible', { p_versions: [...versions], p_default: def })) as { versions: string[]; default: string };
}

/** El tamaño que la iglesia dijo al anotarse ("1-30", "31-80"…), o null si no lo dijo. */
export async function sizeHint(): Promise<string | null> {
  const { data, error } = await supabase.rpc('funciones_size_hint');
  return !error && typeof data === 'string' ? data : null;
}

/** Para las páginas sin sesión (tarjeta de visita, página de un evento): ¿esa iglesia usa esta parte? Si no se puede saber, se sigue normal. */
export async function publicPartOn(kind: 'visita' | 'evento', ref: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('public_part_on', { p_kind: kind, p_ref: ref });
  return error ? true : data !== false;
}

/** Lo que cambia cuando el pastor toca Funciones, para que los demás teléfonos se enteren sin volver a entrar. */
export async function churchSwitches(churchId: string): Promise<{ disabled_features: string[]; bible: unknown } | null> {
  const { data, error } = await supabase.from('churches').select('disabled_features, bible').eq('id', churchId).maybeSingle();
  if (error || !data) return null;
  const d = data as { disabled_features?: string[] | null; bible?: unknown };
  return { disabled_features: d.disabled_features ?? [], bible: d.bible ?? null };
}
