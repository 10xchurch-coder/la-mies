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

// ---------- Detalle del panel: quién cargó a quién ----------

export type PanelMetric = 'contacts' | 'presentations' | 'promises' | 'came' | 'discipleship' | 'baptisms';
export type PanelVisit = { contact_id: string; user_id: string | null; visited_at: string; gospel_presented: boolean; promise_day: string | null; name: string };
export type PanelPerson = { contact_id: string; name: string; when: string; user_id: string | null };
export type PanelDetail = { visits: PanelVisit[]; came: PanelPerson[]; discipleship: PanelPerson[]; baptisms: PanelPerson[] };
export type PanelItem = { key: string; contact_id: string; name: string; when: string; user_id: string | null };

export const METRIC_LABEL: Record<PanelMetric, string> = {
  contacts: 'Contactos', presentations: 'Presentaciones', promises: 'Promesas', came: 'Vinieron', discipleship: 'Discipulado', baptisms: 'Bautismos',
};

/** La lista detrás de cada número. Con userId, solo lo que cargó ese hermano. */
export function panelItems(metric: PanelMetric, d: PanelDetail, userId?: string): PanelItem[] {
  if (metric === 'came' || metric === 'discipleship' || metric === 'baptisms') {
    return d[metric].filter((p) => !userId || p.user_id === userId).map((p, i) => ({ key: `${metric}-${p.contact_id}-${i}`, ...p }));
  }
  const mine = d.visits.filter((v) => !userId || v.user_id === userId);
  const pick = metric === 'presentations' ? mine.filter((v) => v.gospel_presented) : metric === 'promises' ? mine.filter((v) => v.promise_day) : mine;
  const out: PanelItem[] = [];
  const seen = new Set<string>();
  for (const v of [...pick].sort((a, b) => a.visited_at.localeCompare(b.visited_at))) {
    // Un contacto es una persona: si se la visitó dos veces, cuenta una sola vez.
    if (metric === 'contacts') { if (seen.has(v.contact_id)) continue; seen.add(v.contact_id); }
    out.push({ key: `${metric}-${v.contact_id}-${out.length}`, contact_id: v.contact_id, name: v.name, when: v.visited_at, user_id: v.user_id });
  }
  return out;
}

/** Los hermanos ordenados: arriba los que más hicieron (contactos + presentaciones + promesas), después por salidas. */
export function rankMembers<T extends { user_id: string; display_name: string; sessions: number; presentations: number; promises: number }>(
  members: T[], contactsBy: Map<string, number>,
): (T & { contacts: number })[] {
  return members
    .map((m) => ({ ...m, contacts: contactsBy.get(m.user_id) ?? 0 }))
    .sort((a, b) =>
      (b.contacts + b.presentations + b.promises) - (a.contacts + a.presentations + a.promises)
      || b.sessions - a.sessions
      || a.display_name.localeCompare(b.display_name, 'es'));
}
