// Alta de una iglesia nueva: el código de invitación del pastor, las zonas horarias y los valores de inicio
// de los primeros pasos. Acá no hay nada de la base ni de la pantalla, para poder probarse solo.
import type { FeatureKey } from './features';

/** Las invitaciones de pastor empiezan así. Un código de miembros nunca puede empezar igual (lo cuida la base). */
export const PASTOR_PREFIX = 'PASTOR-';
export const cleanCode = (code: string | null | undefined): string => (code ?? '').trim().toUpperCase();
export const isPastorInvite = (code: string | null | undefined): boolean => cleanCode(code).startsWith(PASTOR_PREFIX);

/** El enlace que se le manda al pastor nuevo: abre "Crear cuenta" con la invitación ya escrita. */
export function inviteLink(webUrl: string, token: string): string {
  return `${webUrl.replace(/\/+$/, '')}/registro?invitacion=${encodeURIComponent(cleanCode(token))}`;
}
/** El mensaje listo para mandar por WhatsApp. */
export function inviteMessage(o: { church: string; token: string; link: string; days: number }): string {
  return [
    `Hola. Te invito a ser el pastor de ${o.church} en la app La Mies.`,
    `1) Abrí este enlace: ${o.link}`,
    '2) Tocá "Crear cuenta" y poné tu nombre, tu correo y tu celular.',
    `3) En "Código de la iglesia" tiene que decir: ${cleanCode(o.token)}`,
    `La invitación sirve una sola vez y vence en ${o.days} días. No se la pases a nadie.`,
  ].join('\n');
}

/** Revisa el código para los miembros. Devuelve el problema en palabras simples, o null si está bien. Vacío: la app inventa uno. */
export function joinCodeProblem(code: string): string | null {
  const c = cleanCode(code);
  if (!c) return null;
  if (c.startsWith(PASTOR_PREFIX)) return 'El código no puede empezar con PASTOR-.';
  if (!/^[A-Z0-9][A-Z0-9-]{5,23}$/.test(c)) return 'Usá de 6 a 24 letras o números. Puede llevar guiones. Sin espacios ni tildes.';
  return null;
}

/** Idea de código a partir del nombre: "Iglesia Bautista Esperanza" -> "ESPERANZA-2026". */
export function suggestJoinCode(name: string, year = new Date().getFullYear()): string {
  const skip = new Set(['IGLESIA', 'BAUTISTA', 'EVANGELICA', 'CRISTIANA', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'MISION', 'TEMPLO', 'CENTRO']);
  const words = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const word = (words.filter((w) => !skip.has(w)).pop() ?? words.pop() ?? 'IGLESIA').slice(0, 14);
  const code = `${word}-${year}`;
  return joinCodeProblem(code) ? `IGLESIA-${year}` : code;
}

export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
  { value: 'America/Asuncion', label: 'Paraguay' },
  { value: 'America/Montevideo', label: 'Uruguay' },
  { value: 'America/Sao_Paulo', label: 'Brasil (Brasilia)' },
  { value: 'America/Santiago', label: 'Chile' },
  { value: 'America/La_Paz', label: 'Bolivia' },
  { value: 'America/Lima', label: 'Perú' },
  { value: 'America/Bogota', label: 'Colombia' },
  { value: 'America/Mexico_City', label: 'México (centro)' },
  { value: 'America/New_York', label: 'EE.UU. (este)' },
  { value: 'America/Chicago', label: 'EE.UU. (centro)' },
  { value: 'Europe/Madrid', label: 'España' },
];
export const timezoneLabel = (tz: string): string => TIMEZONES.find((t) => t.value === tz)?.label ?? tz;

// ---------- Valores de inicio: copiados de cómo está armada la Iglesia Bautista Victoria (noviembre de 2026) ----------

export type ServiceIdea = { name: string; dow: number; time: string; main: boolean };
/** Las reuniones de la semana que tiene Victoria. Las dos primeras ya vienen creadas con la iglesia (con otro horario del sábado). */
export const SERVICE_IDEAS: ServiceIdea[] = [
  { name: 'Culto del sábado', dow: 6, time: '20:00', main: true },
  { name: 'Culto del domingo', dow: 0, time: '10:00', main: true },
  { name: 'Jóvenes', dow: 6, time: '10:00', main: false },
  { name: 'Oración', dow: 6, time: '18:30', main: false },
  { name: 'Culto de oración del miércoles', dow: 3, time: '20:00', main: false },
];

export type ClassIdea = { name: string; age_min: number; age_max: number };
/** Las clases de los chicos que tiene Victoria. */
export const CLASS_IDEAS: ClassIdea[] = [
  { name: 'Cuna (0 a 2 años)', age_min: 0, age_max: 2 },
  { name: 'Niños (2 a 6 años)', age_min: 2, age_max: 6 },
  { name: 'Niños (6 a 12 años)', age_min: 6, age_max: 12 },
];

/** Lo que Victoria tiene apagado. Para una iglesia nueva sumamos lo que casi nadie usa el primer día. */
export const VICTORIA_OFF: FeatureKey[] = ['vivo', 'musica', 'radio'];
export const START_OFF: FeatureKey[] = [...VICTORIA_OFF, 'rifas', 'presentar', 'misioneros', 'colectivo'];

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Las ideas que la iglesia todavía no tiene (por nombre). */
export function missingIdeas<T extends { name: string }>(ideas: T[], existing: { name: string }[]): T[] {
  return ideas.filter((i) => !existing.some((e) => sameName(e.name, i.name)));
}

export const SETUP_STEPS = ['Tu iglesia', 'Reuniones', 'Clases', 'Funciones', 'Código para los hermanos'] as const;
/** El paso guardado, dentro de lo que existe (por si la base trae algo raro). */
export function clampStep(step: number | null | undefined): number {
  const n = Math.floor(Number(step) || 0);
  return Math.min(Math.max(n, 0), SETUP_STEPS.length - 1);
}

/** "HH:MM" bien escrito, o null. Acepta "9", "9.30", "19:5". */
export function cleanTime(text: string): string | null {
  const m = /^(\d{1,2})(?:[:.h](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2] ?? 0);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
