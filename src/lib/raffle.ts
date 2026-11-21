// Rifas: de dónde salen los que participan. Sin pantalla ni base.

export type RafflePool = 'event_checkins' | 'event_registered' | 'class' | 'bus';

export const POOL_LABEL: Record<RafflePool, string> = {
  event_checkins: 'Los que entraron al evento',
  event_registered: 'Todos los anotados en el evento',
  class: 'Los presentes en una clase',
  bus: 'Los que subieron al colectivo',
};

export const POOL_HINT: Record<RafflePool, string> = {
  event_checkins: 'Entra cada persona que se marcó en la puerta ese día.',
  event_registered: 'Entran todos los que se anotaron, hayan venido o no.',
  class: 'Entran los que figuran presentes en la asistencia de esa clase ese día.',
  bus: 'Entran los que se marcaron como levantados por el colectivo ese día.',
};

export const needsEvent = (p: RafflePool): boolean => p === 'event_checkins' || p === 'event_registered';
export const needsClass = (p: RafflePool): boolean => p === 'class';

/** Un error legible si falta algo para armar la rifa, o null si está todo. */
export function raffleProblem(r: { title: string; pool: RafflePool; eventId: string | null; classId: string | null }): string | null {
  if (r.title.trim().length < 2) return 'Ponele un nombre a la rifa';
  if (needsEvent(r.pool) && !r.eventId) return 'Elegí el evento';
  if (needsClass(r.pool) && !r.classId) return 'Elegí la clase';
  return null;
}
