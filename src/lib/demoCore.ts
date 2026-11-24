// Demostración (iglesia de ejemplo): la lógica sola, sin pantalla ni base, para poder probarse.
// La base es la que manda: una cuenta de ejemplo no puede guardar nada (ver supabase/migrations/0085_demo.sql).
// Acá solo se decide qué mostrarle al visitante y qué cosas ni siquiera se intentan.

/** El código de error que da la base cuando una cuenta de ejemplo quiere guardar algo. */
export const DEMO_ERROR_CODE = 'DM001';
export const DEMO_TITLE = 'Es una demostración';
export const DEMO_MESSAGE = 'Esto es una demostración: acá no se guardan cambios.';
export const DEMO_MESSAGE_LONG = 'Esto es una demostración: acá no se guardan cambios. Podés seguir mirando todo.';

/** A dónde va "Quiero La Mies para mi iglesia": la página para empezar y, si todavía no existe, un correo. */
export const DEMO_SIGNUP_ROUTE = '/empezar';
export const DEMO_CONTACT_EMAIL = 'info@iglesiavictoria.com';
export const DEMO_CONTACT_URL = `mailto:${DEMO_CONTACT_EMAIL}?subject=${encodeURIComponent('Quiero La Mies para mi iglesia')}`;

/** El centro de la zona de la iglesia de ejemplo: el centro de Posadas, cerca de la plaza 9 de Julio (para que el mapa abra ahí). */
export const DEMO_CENTER = { lat: -27.367, lng: -55.8955 };

export type DemoView = 'pastor' | 'miembro';

/** Lo que viene en la dirección (?ver=miembro) → la vista pedida. Por defecto, la del pastor. */
export function demoViewFromParam(v: unknown): DemoView {
  const s = (Array.isArray(v) ? v[0] : v) ?? '';
  return typeof s === 'string' && /^(miembro|member|hermano|hermana)$/i.test(s.trim()) ? 'miembro' : 'pastor';
}

type SessionLike = { user?: { email?: string | null; app_metadata?: Record<string, unknown> | null } | null } | null | undefined;

/** ¿Esta sesión es de una cuenta de ejemplo? La marca la pone la base en la cuenta; el usuario no la puede cambiar. */
export function isDemoSession(s: SessionLike): boolean {
  return s?.user?.app_metadata?.lamies_demo === true;
}

/** Con qué vista se entró, según el correo de la cuenta de ejemplo. */
export function demoViewOfSession(s: SessionLike): DemoView {
  return /^miembro@/i.test(s?.user?.email ?? '') ? 'miembro' : 'pastor';
}

/** ¿Este error es el "no se guardan cambios" de la demostración? */
export function isDemoError(e: unknown): boolean {
  if (!e) return false;
  if (typeof e === 'string') return e.includes('Esto es una demostración');
  const o = e as { code?: unknown; message?: unknown; error_description?: unknown };
  return o.code === DEMO_ERROR_CODE || [o.message, o.error_description].some((m) => typeof m === 'string' && m.includes('Esto es una demostración'));
}

/**
 * Un pedido a la base que falló mientras se usa una cuenta de ejemplo: ¿hay que avisar "acá no se guardan cambios"?
 * - Cualquier respuesta con el código DM001.
 * - Subir, cambiar o borrar un archivo (lo frena una regla de la base que no trae ese código).
 * - Cambiar la cuenta: correo, contraseña, verificación en dos pasos, recuperar contraseña.
 */
export function failedRequestIsDemoBlock(method: string, url: string, status: number, bodyText: string): boolean {
  if (status < 400) return false;
  if (bodyText.includes(`"${DEMO_ERROR_CODE}"`) || bodyText.includes('Esto es una demostración')) return true;
  const m = (method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  let path = url;
  try { path = new URL(url).pathname; } catch { /* dirección relativa */ }
  if (path.includes('/storage/v1/object') && !path.includes('/object/sign') && !path.includes('/object/list')) return true;
  if (/\/auth\/v1\/(user|factors|recover)(\/|$)/.test(path)) return true;
  return false;
}

/** Un mensaje de error cualquiera, mientras se usa una cuenta de ejemplo: ¿en realidad es el candado de la demostración? */
export function looksLikeDemoBlock(message: string | null | undefined): boolean {
  const m = message ?? '';
  return m.includes('Esto es una demostración') || /row-level security|violates row-level|Database error (saving|updating)|unexpected_failure|Unexpected failure/i.test(m);
}

/**
 * Enlaces que le llegarían a una persona de verdad (WhatsApp, llamada, mensaje, correo).
 * En la demostración no se abren: los teléfonos son inventados. El correo de contacto de La Mies sí se abre.
 */
export function isOutboundContactUrl(url: string | null | undefined): boolean {
  const u = (url ?? '').trim();
  if (!u) return false;
  if (u.toLowerCase().startsWith(`mailto:${DEMO_CONTACT_EMAIL}`)) return false;
  return /^(whatsapp:|tel:|sms:|smsto:|mailto:)/i.test(u) || /^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(u);
}
