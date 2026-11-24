// Niveles e insignias de "Mi progreso". Los números vienen de my_progress() en la base.
// Puntos del tablero (igual que en la base): presentación 1 · promesa 3 · vino 10.

import { tx } from './i18n';
export type Progress = {
  sessions: number;
  minutes: number;
  km: number;
  presentations: number;
  promises: number;
  came: number;
  discipleship: number;
  baptisms: number;
  streak_weeks: number;
  last_session: string | null;
};

export const POINTS = { presentation: 1, promise: 3, came: 10 } as const;

export function points(p: { presentations: number; promises: number; came: number }): number {
  return p.presentations * POINTS.presentation + p.promises * POINTS.promise + p.came * POINTS.came;
}

export type Level = { n: number; name: string; sessions: number; verse: string };

/** 1 Corintios 3:6-8: "Yo planté, Apolos regó; pero el crecimiento lo ha dado Dios." */
export const LEVELS: Level[] = [
  { n: 1, get name() { return tx('Sembrador'); }, sessions: 1, verse: 'Primera salida' },
  { n: 2, get name() { return tx('Regador'); }, sessions: 5, verse: '5 salidas' },
  { n: 3, get name() { return tx('Segador'); }, sessions: 12, verse: '12 salidas' },
  { n: 4, get name() { return tx('Obrero fiel'); }, sessions: 20, verse: '20 salidas' },
  { n: 5, get name() { return tx('Embajador'); }, sessions: 40, verse: '40 salidas' },
  { n: 6, get name() { return tx('Pescador de hombres'); }, sessions: 80, verse: '80 salidas' },
];

export function levelFor(sessions: number): { current: Level | null; next: Level | null } {
  let current: Level | null = null;
  let next: Level | null = null;
  for (const l of LEVELS) {
    if (sessions >= l.sessions) current = l;
    else {
      next = l;
      break;
    }
  }
  return { current, next };
}

export type Badge = { id: string; title: string; icon: string; earned: boolean; progress?: string };

export function badgesFor(p: Progress): Badge[] {
  const b = (id: string, title: string, icon: string, have: number, need: number): Badge => ({
    id,
    title,
    icon,
    earned: have >= need,
    progress: have >= need ? undefined : `${Math.min(have, need)} de ${need}`,
  });
  return [
    b('first', tx('Primera salida'), 'play', p.sessions, 1),
    b('pres10', tx('10 presentaciones'), 'book-open', p.presentations, 10),
    b('promise1', tx('Primera promesa'), 'calendar', p.promises, 1),
    b('came1', tx('Alguien vino a la iglesia'), 'home', p.came, 1),
    b('streak5', tx('5 semanas seguidas'), 'zap', p.streak_weeks, 5),
    b('pres50', tx('50 presentaciones'), 'book-open', p.presentations, 50),
    b('disc1', tx('Alguien empezó discipulado'), 'users', p.discipleship, 1),
    b('bapt1', tx('Un bautismo'), 'droplet', p.baptisms, 1),
    b('pres100', tx('100 presentaciones'), 'award', p.presentations, 100),
  ];
}
