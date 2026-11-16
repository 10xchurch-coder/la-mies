// "Mis contactos para seguir": por qué está cada persona en la lista y qué hay que hacer con ella.
// No importa nada de la app para poder probarse sola.

export type FollowContext = {
  status: string; created_on: string; added_by: string | null; added_by_me: boolean; from_outing: boolean; street: string | null;
  /** Cuántos días distintos vino a una reunión. */
  times: number; first_on: string | null; last_on: string | null; last_service: string | null;
  note: string | null; last_note: string | null;
};
export type Why = { tag: string; tone: 'green' | 'blue' | 'amber' | 'gray'; origin: string; todo: string };

/** `day` escribe una fecha corta ("sáb 14 nov"). */
export function whyHere(c: FollowContext, o: { promised?: boolean; day: (iso: string) => string }): Why {
  const other = c.added_by ?? 'otro hermano';
  const noted = c.added_by_me ? 'Lo anotaste vos' : `Lo anotó ${other}`;
  const loaded = c.added_by_me ? 'Lo cargaste vos' : `Lo cargó ${other}`;
  const service = c.last_service ?? 'una reunión';
  let tag: string, tone: Why['tone'], origin: string, todo: string;

  if (c.times > 0 && c.last_on) {
    tag = c.times === 1 ? 'Visita · vino 1 vez' : `Visita · vino ${c.times} veces`;
    tone = 'green';
    origin = c.times === 1
      ? `Vino por primera vez: ${service}, ${o.day(c.last_on)}.`
      : `Vino ${c.times} veces. La última: ${service}, ${o.day(c.last_on)}.${c.first_on ? ` La primera: ${o.day(c.first_on)}.` : ''}`;
    todo = c.times === 1 ? 'Escribile para agradecerle la visita e invitarlo de nuevo.' : 'Seguí invitándolo y coordiná una visita a su casa.';
  } else if (c.from_outing) {
    tag = 'Contacto de la calle';
    tone = 'blue';
    origin = `${noted} en una salida, ${o.day(c.created_on)}${c.street ? ` · ${c.street}` : ''}. Todavía no vino a la iglesia.`;
    todo = 'Escribile o visitalo para invitarlo a la iglesia.';
  } else {
    tag = c.status === 'visitor' ? 'Visita sin asistencia' : 'Contacto';
    tone = 'amber';
    origin = `${loaded} a mano, ${o.day(c.created_on)}. No está marcado presente en ninguna reunión.`;
    todo = c.status === 'visitor'
      ? 'Si vino a una reunión, marcalo presente en Asistencia. Si no, escribile para invitarlo.'
      : 'Escribile o visitalo para invitarlo a la iglesia.';
  }
  if (o.promised) todo = 'Prometió venir: recordale el culto.';
  return { tag, tone, origin, todo };
}
