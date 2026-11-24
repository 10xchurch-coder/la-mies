// Cómo sigue cada iglesia a sus visitas y a los que faltan: cuándo avisar y qué mensaje de WhatsApp mandar.
// Cada iglesia lo cambia desde Ajustes; lo que no cambió queda con estos valores.
// No importa nada de la app para poder probarse sola.

import { tx, txList } from './i18n';
export type FollowupMessageKind = 'firstvisit' | 'secondvisit' | 'missed1' | 'missed2' | 'missed3' | 'promise' | 'followup' | 'visit';

export type FollowupConfig = {
  /** Horas para escribirle a quien vino (1ª y 2ª vez). */
  write_hours: number;
  /** Después de cuántas visitas se pide visitarlo en su casa. */
  visit_after_visits: number;
  /** Días para hacer esa visita. */
  visit_days: number;
  /** Después de cuántos fines de semana seguidos sin venir se pide visitarlo. */
  absent_visit_weeks: number;
  /** Programa de discipulado: clases uno a uno y clases del curso. */
  disc_one_classes: number;
  disc_course_classes: number;
  messages: Record<FollowupMessageKind, string>;
};

/** En los mensajes se puede usar: {nombre} (de la persona), {yo} (quien escribe), {iglesia} y {cuando} ("el domingo a las 10:00"). */
export const PLACEHOLDERS = ['{nombre}', '{yo}', '{iglesia}', '{cuando}', '{reuniones}'] as const;

export const DEFAULT_FOLLOWUP: FollowupConfig = {
  write_hours: 48,
  visit_after_visits: 2,
  visit_days: 7,
  absent_visit_weeks: 2,
  disc_one_classes: 4,
  disc_course_classes: 13,
  messages: {
    get firstvisit() { return tx('Hola {nombre}, soy {yo} de {iglesia}. ¡Qué alegría que nos hayas visitado! Gracias por venir. Queremos que te sientas como en casa. Te esperamos otra vez este próximo fin de semana: {reuniones}. Si hay algo por lo que podamos orar o en lo que te podamos ayudar, escribime.'); },
    get secondvisit() { return tx('Hola {nombre}, soy {yo} de {iglesia}. ¡Qué bueno verte otra vez! Nos alegra mucho que hayas vuelto. Me gustaría pasar a visitarte esta semana para conocerte mejor. ¿Qué día y horario te queda bien?'); },
    get missed1() { return tx('Hola {nombre}. ¡Te extrañamos este fin de semana en la iglesia! Quería saber cómo estás. ¿Hay algo en lo que te podamos ayudar, o algo por lo que podamos orar?'); },
    get missed2() { return tx('Hola {nombre}. Hace dos semanas que no te vemos y te extrañamos mucho. Me gustaría pasar a visitarte esta semana. ¿Qué día y horario te queda bien?'); },
    get missed3() { return tx('Hola {nombre}. Recién oré por vos. Espero que estés bien. Dios te ama; buscalo de todo corazón y Él te va a sostener. Te esperamos {cuando}.'); },
    get promise() { return tx('Hola {nombre}, soy {yo} de {iglesia}. Te escribo para recordarte que {cuando} tenemos el culto. ¡Me encantaría verte ahí! Si necesitás que te pasemos a buscar, avisame.'); },
    get followup() { return tx('Hola {nombre}, soy {yo} de {iglesia}. Fue una alegría conocerte. Te quería invitar: {cuando} tenemos el culto y me encantaría que vengas. ¿Te puedo ayudar en algo?'); },
    get visit() { return tx('Hola {nombre}, soy {yo} de {iglesia}. Me gustaría pasar a visitarte esta semana. ¿Qué día y horario te queda bien?'); },
  },
};

export const MESSAGE_TITLE: Record<FollowupMessageKind, string> = {
  get firstvisit() { return tx('Vino por primera vez'); },
  get secondvisit() { return tx('Vino por segunda vez'); },
  get missed1() { return tx('Faltó 1 fin de semana'); },
  get missed2() { return tx('Faltó 2 fines de semana'); },
  get missed3() { return tx('Faltó 3 fines de semana o más'); },
  get promise() { return tx('Recordarle el culto (prometió venir)'); },
  get followup() { return tx('Invitarlo después de conocerlo en la calle'); },
  get visit() { return tx('Coordinar una visita'); },
};

const LIMITS: Record<'write_hours' | 'visit_after_visits' | 'visit_days' | 'absent_visit_weeks' | 'disc_one_classes' | 'disc_course_classes', [number, number]> = {
  write_hours: [1, 336], visit_after_visits: [1, 6], visit_days: [1, 60], absent_visit_weeks: [1, 8], disc_one_classes: [0, 20], disc_course_classes: [0, 60],
};

/** Lo que guardó la iglesia arriba de los valores de siempre. Un número raro o un mensaje vacío vuelven al valor de siempre. */
export function mergeFollowup(raw: unknown): FollowupConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof FollowupConfig, unknown>>;
  const num = (k: keyof typeof LIMITS) => {
    const v = r[k] === null || r[k] === undefined || r[k] === '' ? NaN : Math.round(Number(r[k]));
    const [lo, hi] = LIMITS[k];
    return Number.isFinite(v) && v >= lo && v <= hi ? v : DEFAULT_FOLLOWUP[k];
  };
  const custom = (r.messages && typeof r.messages === 'object' ? r.messages : {}) as Record<string, unknown>;
  const messages = { ...DEFAULT_FOLLOWUP.messages };
  for (const k of Object.keys(messages) as FollowupMessageKind[]) {
    const v = custom[k];
    if (typeof v === 'string' && v.trim()) messages[k] = v.trim();
  }
  return { write_hours: num('write_hours'), visit_after_visits: num('visit_after_visits'), visit_days: num('visit_days'), absent_visit_weeks: num('absent_visit_weeks'), disc_one_classes: num('disc_one_classes'), disc_course_classes: num('disc_course_classes'), messages };
}

/** Solo lo que es distinto de los valores de siempre, para guardar lo mínimo. */
export function followupOverrides(c: FollowupConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) if (c[k] !== DEFAULT_FOLLOWUP[k]) out[k] = c[k];
  const m: Record<string, string> = {};
  for (const k of Object.keys(c.messages) as FollowupMessageKind[]) if (c.messages[k].trim() && c.messages[k].trim() !== DEFAULT_FOLLOWUP.messages[k]) m[k] = c.messages[k].trim();
  if (Object.keys(m).length) out.messages = m;
  return out;
}

/** Arma el mensaje reemplazando {nombre}, {yo}, {iglesia} y {cuando}. */
export function fillMessage(template: string, v: { nombre: string; yo: string; iglesia: string; cuando: string; reuniones?: string }): string {
  return template.replace(/\{(nombre|yo|iglesia|cuando|reuniones)\}/g, (_, k: 'nombre' | 'yo' | 'iglesia' | 'cuando' | 'reuniones') => v[k] ?? v.cuando);
}

/** Qué mensaje corresponde según cuántos fines de semana faltó. */
export function missedKind(weeks: number): 'missed1' | 'missed2' | 'missed3' {
  return weeks >= 3 ? 'missed3' : weeks === 2 ? 'missed2' : 'missed1';
}

const DIAS = txList(['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']);
/** Todas las reuniones principales, en orden de la semana: "el sábado a las 20:00 y el domingo a las 10:00". */
export function serviceList(services: { dow: number; time: string | null; main: boolean; active: boolean }[] | undefined): string {
  const order = (d: number) => (d + 6) % 7;   // lunes primero, domingo último
  const t = (x: string | null) => (x ?? '').slice(0, 5);
  const main = (services ?? []).filter((s) => s.active && s.main).sort((a, b) => order(a.dow) - order(b.dow) || t(a.time).localeCompare(t(b.time)));
  if (!main.length) return tx('el domingo');
  const parts = main.map((s) => tx('el {DIAS} a las {t}', { DIAS: DIAS[s.dow], t: t(s.time) }));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}
