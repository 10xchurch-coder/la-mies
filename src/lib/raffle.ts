// Sorteos: de dónde salen los que participan. Sin pantalla ni base.

import { tx } from './i18n';
export type RafflePool = 'event_checkins' | 'event_registered' | 'class' | 'bus';

export const POOL_LABEL: Record<RafflePool, string> = {
  get event_checkins() { return tx('Los que entraron al evento'); },
  get event_registered() { return tx('Todos los anotados en el evento'); },
  get class() { return tx('Los presentes en una clase'); },
  get bus() { return tx('Los que subieron al colectivo'); },
};

export const POOL_HINT: Record<RafflePool, string> = {
  get event_checkins() { return tx('Entra cada persona que se marcó en la puerta ese día.'); },
  get event_registered() { return tx('Entran todos los que se anotaron, hayan venido o no.'); },
  get class() { return tx('Entran los que figuran presentes en la asistencia de esa clase ese día.'); },
  get bus() { return tx('Entran los que se marcaron como levantados por el colectivo ese día.'); },
};

export const needsEvent = (p: RafflePool): boolean => p === 'event_checkins' || p === 'event_registered';
export const needsClass = (p: RafflePool): boolean => p === 'class';

/** Un error legible si falta algo para armar el sorteo, o null si está todo. */
export function raffleProblem(r: { title: string; pool: RafflePool; eventId: string | null; classId: string | null }): string | null {
  if (r.title.trim().length < 2) return tx('Ponele un nombre al sorteo');
  if (needsEvent(r.pool) && !r.eventId) return tx('Elegí el evento');
  if (needsClass(r.pool) && !r.classId) return tx('Elegí la clase');
  return null;
}
