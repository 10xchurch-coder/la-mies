// "Mis contactos para seguir": por qué está cada persona en la lista y qué hay que hacer con ella.
// No importa nada de la app para poder probarse sola.

import { tx } from './i18n';
export type FollowContext = {
  status: string; created_on: string; added_by: string | null; added_by_me: boolean; from_outing: boolean; street: string | null;
  /** Cuántos días distintos vino a una reunión. */
  times: number; first_on: string | null; last_on: string | null; last_service: string | null;
  note: string | null; last_note: string | null;
};
export type Why = { tag: string; tone: 'green' | 'blue' | 'amber' | 'gray'; origin: string; todo: string };

/** `day` escribe una fecha corta ("sáb 14 nov"). */
export function whyHere(c: FollowContext, o: { promised?: boolean; day: (iso: string) => string }): Why {
  const other = c.added_by ?? tx('otro hermano');
  const noted = c.added_by_me ? tx('Lo anotaste vos') : tx('Lo anotó {other}', { other });
  const loaded = c.added_by_me ? tx('Lo cargaste vos') : tx('Lo cargó {other}', { other });
  const service = c.last_service ?? tx('una reunión');
  let tag: string, tone: Why['tone'], origin: string, todo: string;

  if (c.times > 0 && c.last_on) {
    tag = c.times === 1 ? tx('Visita · vino 1 vez') : tx('Visita · vino {times} veces', { times: c.times });
    tone = 'green';
    origin = c.times === 1
      ? tx('Vino por primera vez: {service}, {day}.', { service, day: o.day(c.last_on) })
      : tx('Vino {times} veces. La última: {service}, {day}.{v1}', { times: c.times, service, day: o.day(c.last_on), v1: c.first_on ? tx(' La primera: {day}.', { day: o.day(c.first_on) }) : '' });
    todo = c.times === 1 ? tx('Escribile para agradecerle la visita e invitarlo de nuevo.') : tx('Seguí invitándolo y coordiná una visita a su casa.');
  } else if (c.from_outing) {
    tag = tx('Contacto de la calle');
    tone = 'blue';
    origin = tx('{noted} en una salida, {day}{v1}. Todavía no vino a la iglesia.', { noted, day: o.day(c.created_on), v1: c.street ? ` · ${c.street}` : '' });
    todo = tx('Escribile o visitalo para invitarlo a la iglesia.');
  } else {
    tag = c.status === 'visitor' ? tx('Visita sin asistencia') : tx('Contacto');
    tone = 'amber';
    origin = tx('{loaded} a mano, {day}. No está marcado presente en ninguna reunión.', { loaded, day: o.day(c.created_on) });
    todo = c.status === 'visitor'
      ? tx('Si vino a una reunión, marcalo presente en Asistencia. Si no, escribile para invitarlo.')
      : tx('Escribile o visitalo para invitarlo a la iglesia.');
  }
  if (o.promised) todo = tx('Prometió venir: recordale el culto.');
  return { tag, tone, origin, todo };
}
