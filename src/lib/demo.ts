// Demostración (iglesia de ejemplo): lo que corre en la app. La lógica sola está en demoCore.ts.
//
// Seguridad: la que impide guardar es la base (disparadores y reglas de la migración 0085).
// Esto es para que el visitante vea un aviso amable en vez de un error, y para no intentar cosas
// que no tienen sentido en una iglesia inventada (abrir WhatsApp con un teléfono inventado, bajar listas).
import { Alert, Linking, Platform, type AlertButton } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
  DEMO_MESSAGE_LONG, DEMO_TITLE, failedRequestIsDemoBlock, isDemoError, isDemoSession, isOutboundContactUrl, looksLikeDemoBlock, type DemoView,
} from './demoCore';
import { tx } from './i18n';

export * from './demoCore';

const FLAG = 'lamies.demo';
let demoOn = false;
let installed = false;
const listeners = new Set<() => void>();

/** ¿Ahora mismo se está usando una cuenta de ejemplo? */
export const isDemoNow = (): boolean => demoOn;

/** Avisa "acá no se guardan cambios" en la cinta de la demostración (sin ventana). */
export function flashDemo(): void {
  listeners.forEach((l) => { try { l(); } catch { /* nada */ } });
}
export function onDemoFlash(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Para poner antes de algo que la demostración no hace (bajar una lista, exportar). Devuelve true si lo frenó. */
export function demoBlocked(what = tx('Esto')): boolean {
  if (!demoOn) return false;
  Alert.alert(tx(DEMO_TITLE), tx('{what} no se hace en la demostración: los datos son de ejemplo. En tu iglesia sí vas a poder.', { what }));
  return true;
}

/** Este navegador entró a la demostración: si la sesión se corta, se vuelve a entrar solo (ver app/_layout.tsx). */
export function wasDemoHere(): boolean {
  try { return Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage.getItem(FLAG) === '1'; } catch { return false; }
}
function rememberDemo(on: boolean) {
  try { if (Platform.OS === 'web' && typeof window !== 'undefined') { if (on) window.localStorage.setItem(FLAG, '1'); else window.localStorage.removeItem(FLAG); } } catch { /* sin almacenamiento */ }
  if (Platform.OS !== 'web') (on ? AsyncStorage.setItem(FLAG, '1') : AsyncStorage.removeItem(FLAG)).catch(() => undefined);
}

/** Entra a la iglesia de ejemplo. El visitante no escribe ni ve ninguna contraseña: la base le dice a la app con qué cuenta entrar. */
export async function enterDemo(view: DemoView): Promise<{ ok: true } | { ok: false; off: boolean; message: string }> {
  const { data, error } = await supabase.rpc('demo_entry', { p_view: view });
  if (error) return { ok: false, off: false, message: tx('No pudimos abrir la demostración. Revisá tu conexión y probá de nuevo.') };
  const d = data as { email?: string; key?: string } | null;
  if (!d?.email || !d.key) return { ok: false, off: true, message: tx('La demostración no está disponible en este momento.') };
  const { error: e2 } = await supabase.auth.signInWithPassword({ email: d.email, password: d.key });
  if (e2) return { ok: false, off: false, message: tx('No pudimos abrir la demostración. Probá de nuevo en un rato.') };
  rememberDemo(true);
  return { ok: true };
}

/** Sale de la demostración solo en este navegador (los demás visitantes siguen adentro). */
export async function leaveDemo(): Promise<void> {
  rememberDemo(false);
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

type RealtimeLike = { connect: () => void; disconnect: () => void; __demoConnect?: () => void };

function applyDemo(on: boolean) {
  demoOn = on;
  // En la demostración no se abre el canal en vivo: nadie puede mandarle nada a la pantalla de otro visitante.
  const rt = supabase.realtime as unknown as RealtimeLike;
  try {
    if (on && !rt.__demoConnect) { rt.__demoConnect = rt.connect.bind(rt); rt.connect = () => undefined; rt.disconnect(); }
    if (!on && rt.__demoConnect) { rt.connect = rt.__demoConnect; rt.__demoConnect = undefined; }
  } catch { /* sin canal en vivo */ }
}

/** Se llama una vez al abrir la app (app/_layout.tsx). No cambia nada para las cuentas reales. */
export function installDemo(): void {
  if (installed) return;
  installed = true;

  supabase.auth.getSession().then(({ data }) => applyDemo(isDemoSession(data.session))).catch(() => undefined);
  supabase.auth.onAuthStateChange((_event, session) => applyDemo(isDemoSession(session)));

  // 1) Los pedidos a la base que rebotan por el candado: aviso en la cinta, aunque la pantalla no muestre nada.
  const g = globalThis as unknown as { fetch: typeof fetch };
  const original = g.fetch.bind(globalThis);
  g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    if (demoOn && !res.ok) {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const method = init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET');
        const text = await res.clone().text();
        if (failedRequestIsDemoBlock(method, url, res.status, text.slice(0, 2000))) flashDemo();
      } catch { /* no se pudo leer la respuesta */ }
    }
    return res;
  }) as typeof fetch;

  // 2) Las ventanas de error: si el error es el candado, se muestra el aviso amable en vez del error.
  const A = Alert as unknown as { alert: (title: string, message?: string, buttons?: AlertButton[], options?: unknown) => void };
  const baseAlert = A.alert.bind(Alert);
  A.alert = (title, message, buttons, options) => {
    if (isDemoError(message) || isDemoError(title) || (demoOn && looksLikeDemoBlock(message))) return baseAlert(tx(DEMO_TITLE), tx(DEMO_MESSAGE_LONG), undefined, options);
    return baseAlert(title, message, buttons, options);
  };

  // 3) WhatsApp, llamadas y mensajes: en la demostración no se abren (los teléfonos son inventados).
  const L = Linking as unknown as { openURL: (url: string) => Promise<unknown> };
  const baseOpen = L.openURL.bind(Linking);
  const explain = () => Alert.alert(tx(DEMO_TITLE), tx('Acá se abriría WhatsApp, el teléfono o el correo con el mensaje listo. En la demostración no se manda nada: las personas son inventadas.'));
  L.openURL = async (url: string) => {
    if (demoOn && isOutboundContactUrl(url)) { explain(); return true; }
    return baseOpen(url);
  };
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const baseWindowOpen = window.open.bind(window);
    window.open = ((url?: string | URL, ...rest: unknown[]) => {
      if (demoOn && isOutboundContactUrl(url ? String(url) : '')) { explain(); return null; }
      return (baseWindowOpen as (...a: unknown[]) => Window | null)(url, ...rest);
    }) as typeof window.open;
  }
}
