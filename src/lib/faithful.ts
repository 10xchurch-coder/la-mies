// El orden de toda lista para tomar asistencia: arriba los más fieles (de más a menos veces),
// y después todos los que nunca participaron, por orden alfabético.
// No importa nada de la app para poder probarse sola.

/** Cuántas veces participó cada persona en esa reunión, clase o salida (por id de la persona). */
export type Times = Record<string, number>;

export function byFaithfulness<T>(rows: T[], times: Times, id: (r: T) => string, name: (r: T) => string): T[] {
  const n = (r: T) => Number(times[id(r)]) || 0;
  return [...rows].sort((a, b) => n(b) - n(a) || name(a).localeCompare(name(b), 'es'));
}
