// Alta de una iglesia que se anota sola: el formulario de /empezar, la lista de primeros pasos, los modelos de funciones,
// los mensajes para compartir y los datos del equipo de La Mies. Acá no hay nada de la base ni de la pantalla, para poder probarse solo.
import { FEATURES, cleanDisabled, type FeatureKey } from './features';
import { phoneProblem } from './phone';

// ---------- El equipo de La Mies: UN solo lugar para cambiar a dónde llega el pedido de ayuda ----------
/** Sin nombres ni teléfonos personales. `whatsapp`: solo cifras, con el código del país (por ejemplo "5493764000000"). Vacío: se ofrece solo el correo. */
export const LA_MIES_TEAM = {
  name: 'el equipo de La Mies',
  email: 'info@iglesiavictoria.com',
  whatsapp: '', // FALTA DECIDIR: el número de WhatsApp del equipo (hoy no hay ninguno cargado)
};

/** FALTA COMPLETAR: los enlaces de las tiendas. Mientras estén vacíos, la app muestra solo la dirección web. */
export const STORE_LINKS = {
  ios: '',     // por ejemplo https://apps.apple.com/app/idXXXXXXXXXX
  android: '', // por ejemplo https://play.google.com/store/apps/details?id=XXXX
};

export type HelpLinks = { email: string; mailto: string; whatsapp: string | null; text: string };
/** Los enlaces de "Necesito ayuda" para un paso: abre el correo (y WhatsApp si hay número) con el mensaje ya escrito. */
export function helpLinks(o: { church?: string | null; step?: string | null; team?: typeof LA_MIES_TEAM }): HelpLinks {
  const team = o.team ?? LA_MIES_TEAM;
  const text = [
    'Hola. Necesito ayuda con la app La Mies.',
    o.church ? `Iglesia: ${o.church}.` : '',
    o.step ? `Estoy en el paso: ${o.step}.` : '',
  ].filter(Boolean).join(' ');
  const digits = (team.whatsapp ?? '').replace(/\D/g, '');
  return {
    email: team.email,
    mailto: `mailto:${team.email}?subject=${encodeURIComponent('Ayuda con La Mies')}&body=${encodeURIComponent(text)}`,
    whatsapp: digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null,
    text,
  };
}

// ---------- El formulario de /empezar ----------
export type Country = { code: string; label: string; timezone: string };
/** Los países de la lista, con su zona horaria más común (se puede cambiar después en los ajustes de la iglesia). */
export const COUNTRIES: Country[] = [
  { code: 'AR', label: 'Argentina', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'PY', label: 'Paraguay', timezone: 'America/Asuncion' },
  { code: 'UY', label: 'Uruguay', timezone: 'America/Montevideo' },
  { code: 'BR', label: 'Brasil', timezone: 'America/Sao_Paulo' },
  { code: 'CL', label: 'Chile', timezone: 'America/Santiago' },
  { code: 'BO', label: 'Bolivia', timezone: 'America/La_Paz' },
  { code: 'PE', label: 'Perú', timezone: 'America/Lima' },
  { code: 'CO', label: 'Colombia', timezone: 'America/Bogota' },
  { code: 'EC', label: 'Ecuador', timezone: 'America/Guayaquil' },
  { code: 'VE', label: 'Venezuela', timezone: 'America/Caracas' },
  { code: 'MX', label: 'México', timezone: 'America/Mexico_City' },
  { code: 'US', label: 'Estados Unidos', timezone: 'America/Chicago' },
  { code: 'ES', label: 'España', timezone: 'Europe/Madrid' },
];
export const timezoneForCountry = (code: string | null | undefined): string =>
  COUNTRIES.find((c) => c.code === (code ?? '').toUpperCase())?.timezone ?? COUNTRIES[0].timezone;

export const SIZES: { value: string; label: string }[] = [
  { value: '1-30', label: 'Hasta 30' },
  { value: '31-80', label: '31 a 80' },
  { value: '81-200', label: '81 a 200' },
  { value: '201-500', label: '201 a 500' },
  { value: '500+', label: 'Más de 500' },
];

export type SignupForm = { church: string; city: string; province: string; country: string; pastor: string; email: string; whatsapp: string; size: string };
export type SignupField = keyof SignupForm;
const hasLink = (s: string) => /(https?:\/\/|www\.|\.com|<|>)/i.test(s);
const letters = (s: string) => (s.normalize('NFD').match(/[a-z]/gi) ?? []).length;

/** Qué le falta al formulario, en palabras simples. Vacío: está todo bien. La base revisa lo mismo otra vez. */
export function signupProblems(f: SignupForm): Partial<Record<SignupField, string>> {
  const p: Partial<Record<SignupField, string>> = {};
  const church = f.church.trim();
  if (church.length < 3 || letters(church) < 3) p.church = 'Escribí el nombre de la iglesia.';
  else if (church.length > 120) p.church = 'El nombre es muy largo.';
  else if (hasLink(church)) p.church = 'Solo el nombre, sin enlaces.';
  if (!f.city.trim()) p.city = 'Escribí la ciudad.';
  else if (f.city.trim().length > 80) p.city = 'La ciudad es muy larga.';
  if (f.province.trim().length > 80) p.province = 'La provincia es muy larga.';
  if (!COUNTRIES.some((c) => c.code === f.country)) p.country = 'Elegí el país.';
  const pastor = f.pastor.trim();
  if (pastor.length < 2 || hasLink(pastor)) p.pastor = 'Escribí tu nombre.';
  else if (pastor.length > 80) p.pastor = 'El nombre es muy largo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) p.email = 'Revisá el correo.';
  const phone = f.whatsapp.trim();
  if (f.country === 'AR' && !phone.startsWith('+')) {
    const bad = phoneProblem(phone, true);
    if (bad) p.whatsapp = bad;
  } else if (phone.replace(/\D/g, '').length < 8) p.whatsapp = 'Escribí tu número de WhatsApp completo, con el código de área.';
  return p;
}

/** Lo que se guarda con la cuenta mientras la persona confirma el correo, para no volver a preguntarle nada. */
export type SignupDraft = Omit<SignupForm, 'email'>;
export function draftFromMeta(meta: unknown): SignupDraft | null {
  const a = (meta as { alta?: Record<string, unknown> } | null | undefined)?.alta;
  if (!a || typeof a !== 'object') return null;
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');
  if (!s('church') || !s('pastor')) return null;
  return { church: s('church'), city: s('city'), province: s('province'), country: s('country') || 'AR', pastor: s('pastor'), whatsapp: s('whatsapp'), size: s('size') };
}

// ---------- La lista de primeros pasos ----------
export type StepKey = 'iglesia' | 'reuniones' | 'funciones' | 'personas' | 'lideres' | 'codigo' | 'instalar' | 'domingo';
export type StepState = 'done' | 'todo' | 'skipped';
export type Step = { key: StepKey; title: string; why: string; canSkip: boolean };

export const STEPS: Step[] = [
  { key: 'iglesia', title: 'Los datos de tu iglesia', why: 'Así la app lleva el nombre y el logo de tu iglesia.', canSkip: false },
  { key: 'reuniones', title: 'Los días y horas de reunión', why: 'Con esto vas a poder tomar asistencia en cada reunión.', canSkip: false },
  { key: 'funciones', title: 'Qué partes de la app van a usar', why: 'Menos botones es más fácil: prendé solo lo que tu iglesia usa.', canSkip: false },
  { key: 'personas', title: 'Traé a tu gente', why: 'Con los hermanos cargados, la app ya sirve desde el primer día.', canSkip: true },
  { key: 'lideres', title: 'Nombrá a tus líderes', why: 'Así no hacés todo vos: cada líder puede hacer su parte.', canSkip: true },
  { key: 'codigo', title: 'Compartí el código de la iglesia', why: 'Con este código los hermanos crean su cuenta y quedan en tu iglesia.', canSkip: false },
  { key: 'instalar', title: 'Instalá la app en los teléfonos', why: 'Con la app en el teléfono, a cada hermano le llegan los avisos.', canSkip: true },
  { key: 'domingo', title: 'El primer domingo: tomá asistencia', why: 'Es lo primero que vas a usar cada semana, y lleva un minuto.', canSkip: true },
];

export type Facts = { logo: boolean; people: number; accounts: number; leaders: number; services: number; attendance: number; features_set: boolean; last_activity: string | null };
export const NO_FACTS: Facts = { logo: false, people: 0, accounts: 0, leaders: 0, services: 0, attendance: 0, features_set: false, last_activity: null };
export function cleanFacts(raw: unknown): Facts {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = (k: string) => Math.max(0, Math.floor(Number(r[k]) || 0));
  return { logo: r.logo === true, people: n('people'), accounts: n('accounts'), leaders: n('leaders'), services: n('services'), attendance: n('attendance'), features_set: r.features_set === true, last_activity: typeof r.last_activity === 'string' ? r.last_activity : null };
}
export type SavedSteps = Partial<Record<string, string>> | null | undefined;

/** Cuántas personas cargadas alcanzan para dar por hecho el paso "Traé a tu gente". */
export const PEOPLE_ENOUGH = 5;

/** Lo que la app ya sabe sola: si esto pasó, el paso está hecho aunque nadie lo haya marcado. */
export function autoDone(key: StepKey, facts: Facts): boolean {
  if (key === 'personas') return facts.people >= PEOPLE_ENOUGH;
  if (key === 'lideres') return facts.leaders >= 1;
  if (key === 'domingo') return facts.attendance >= 1;
  if (key === 'instalar') return facts.accounts >= 3;
  return false;
}

/** El estado de un paso: hecho, falta o lo salteo. Lo que pasó de verdad gana sobre "lo salteo". */
export function stepState(key: StepKey, saved: SavedSteps, facts: Facts): StepState {
  if (autoDone(key, facts)) return 'done';
  const s = saved?.[key];
  return s === 'done' || s === 'skipped' ? s : 'todo';
}

export type Progress = { total: number; done: number; skipped: number; resolved: number; finished: boolean; next: StepKey | null; label: string };
export function progress(saved: SavedSteps, facts: Facts): Progress {
  const states = STEPS.map((s) => stepState(s.key, saved, facts));
  const done = states.filter((s) => s === 'done').length;
  const skipped = states.filter((s) => s === 'skipped').length;
  const i = states.indexOf('todo');
  return {
    total: STEPS.length, done, skipped, resolved: done + skipped, finished: i === -1, next: i === -1 ? null : STEPS[i].key,
    label: `${done + skipped} de ${STEPS.length} pasos`,
  };
}
export const STATE_LABEL: Record<StepState, string> = { done: 'Hecho', todo: 'Falta', skipped: 'Lo salteo' };

// ---------- Los modelos de funciones ----------
export type PresetKey = 'basico' | 'completa' | 'elijo';
/** "Lo básico": lo que casi toda iglesia usa desde el primer día. */
export const BASIC_ON: FeatureKey[] = ['asistencia', 'devocional', 'oracion', 'eventos', 'directorio', 'cumples', 'anuncios', 'seguimiento', 'ofrendar'];
/** "Iglesia completa": todo, menos lo que pide equipo o cuentas aparte (radio, transmisión en vivo, música). */
export const FULL_OFF: FeatureKey[] = ['vivo', 'musica', 'radio'];
export const PRESETS: { key: PresetKey; label: string; hint: string }[] = [
  { key: 'basico', label: 'Lo básico', hint: 'Asistencia, devocional, oración, eventos, anuncios, cumpleaños, directorio, seguimiento y ofrendar. Lo demás queda apagado.' },
  { key: 'completa', label: 'Iglesia completa', hint: 'Casi todo prendido: clases, ministerios, finanzas, evangelismo y más. Queda apagado solo radio, culto en vivo y música.' },
  { key: 'elijo', label: 'Elijo yo', hint: 'Prendé y apagá cada parte una por una.' },
];
/** Qué queda apagado con cada modelo. "Elijo yo" no cambia nada. */
export function presetOff(key: PresetKey, current: readonly string[] | null | undefined = []): FeatureKey[] {
  if (key === 'basico') return FEATURES.map((f) => f.key).filter((k) => !BASIC_ON.includes(k));
  if (key === 'completa') return [...FULL_OFF];
  return cleanDisabled(current ?? []);
}
/** Los cambios que hay que pedir para pasar de lo que hay a lo que se quiere (uno por función que cambia). */
export function presetChanges(current: readonly string[] | null | undefined, target: readonly FeatureKey[]): { key: FeatureKey; enabled: boolean }[] {
  const now = new Set(cleanDisabled(current ?? []));
  const want = new Set(target);
  const out: { key: FeatureKey; enabled: boolean }[] = [];
  for (const f of FEATURES) {
    if (want.has(f.key) && !now.has(f.key)) out.push({ key: f.key, enabled: false });
    if (!want.has(f.key) && now.has(f.key)) out.push({ key: f.key, enabled: true });
  }
  return out;
}

// ---------- Compartir el código ----------
/** El enlace que abre "Crear cuenta" con el código de la iglesia ya escrito. */
export function joinLink(webUrl: string, code: string): string {
  return `${webUrl.replace(/\/+$/, '')}/registro?invitacion=${encodeURIComponent(code.trim().toUpperCase())}`;
}
/** El mensaje listo para mandar por WhatsApp al grupo de la iglesia. */
export function joinMessage(o: { church: string; code: string; webUrl: string; stores?: typeof STORE_LINKS }): string {
  const s = o.stores ?? STORE_LINKS;
  const code = o.code.trim().toUpperCase();
  return [
    `¡Hola! ${o.church} ya tiene su app: La Mies.`,
    '',
    'Para entrar:',
    `1) Abrí este enlace: ${joinLink(o.webUrl, code)}`,
    '2) Tocá "Crear cuenta" y poné tu nombre, tu correo y tu celular.',
    `3) En "Código de la iglesia" tiene que decir: ${code}`,
    s.ios || s.android ? '' : null,
    s.android ? `Para Android: ${s.android}` : null,
    s.ios ? `Para iPhone: ${s.ios}` : null,
  ].filter((l) => l !== null).join('\n');
}

// ---------- Para el equipo de La Mies ----------
export type SignupStatus = 'pending' | 'reviewed' | 'suspended';
export const SIGNUP_STATUS_LABEL: Record<SignupStatus, string> = { pending: 'Sin revisar', reviewed: 'Revisada', suspended: 'Suspendida' };
/** "hoy", "ayer", "hace 5 días", "sin movimiento". */
export function activityLabel(last: string | null | undefined, now = new Date()): string {
  if (!last) return 'sin movimiento';
  const days = Math.floor((now.getTime() - new Date(last).getTime()) / 86400000);
  if (!Number.isFinite(days)) return 'sin movimiento';
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}
