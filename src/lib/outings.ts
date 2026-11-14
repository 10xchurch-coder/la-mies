// Salidas de la iglesia: si varios hermanos salen a la misma hora, es UNA salida, no varias.
// No importa nada de la app para poder probarse sola.

export type OutingSession = { started_at: string; ended_at: string | null; contacts?: number | null };

/** Cuánto puede pasar entre que termina uno y empieza otro para seguir siendo la misma salida. */
const GAP_MS = 60 * 60 * 1000;

/** Cuántas salidas hubo: las que se pisan en el horario (o empiezan dentro de la hora) cuentan como una. */
export function countOutings(sessions: OutingSession[], now = new Date()): number {
  const spans = sessions
    .map((s) => ({ a: new Date(s.started_at).getTime(), b: s.ended_at ? new Date(s.ended_at).getTime() : now.getTime() }))
    .filter((s) => !Number.isNaN(s.a))
    .sort((x, y) => x.a - y.a);
  let n = 0;
  let end = -Infinity;
  for (const s of spans) {
    if (s.a > end + GAP_MS) n++;
    end = Math.max(end, s.b, s.a);
  }
  return n;
}

/** Contactos: todas las personas con las que se habló y se anotaron en las salidas. */
export function countContacts(sessions: OutingSession[]): number {
  return sessions.reduce((n, s) => n + (Number(s.contacts) || 0), 0);
}
