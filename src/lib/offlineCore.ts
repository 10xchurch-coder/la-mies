// Las reglas del modo sin conexión: qué pedidos se guardan para verlos sin señal,
// qué cambios se pueden anotar en el teléfono para subirlos después, y cómo se refleja
// un cambio pendiente en lo que ya estaba guardado.
// No importa nada de la app para poder probarse sola.

/** Funciones de la base que solo leen. Sus respuestas se guardan para verlas sin señal. */
const READ_RPCS = new Set(`account_deletion_requests accounts_overview attendance_counts attendance_sheet baptism_certificate bus_run_trail
can_drive_bus can_edit_contact can_fix_session can_see_bus can_see_class can_see_contact can_see_contact_private can_see_prayer can_take_attendance
can_teach_class chat_can_access chat_my_privacy chat_poll_results chat_receipts checkins_today church_chat_list church_permissions church_progress
church_report church_today coverage_in_bbox current_church_id current_group_id current_role_name daily_comments_list daily_for daily_range daily_social
directory_list event_registration_count family_children family_parents fin_account_balances fin_balances fin_by_category fin_monthly finance_level
finance_level_of has_perm has_role house_sides_in_bbox houses_in_bbox i_have_role i_receive_announcement in_teaching_ministry is_admin is_any_teacher
is_blocked_by_me is_captain_or_admin is_ministry_leader is_ministry_member is_network_admin is_staff is_teacher_of is_top_role list_outings
live_comments_list ministry_chat_list ministry_people_list my_baptism_certificate_id my_birthdate my_follow_ups my_followups my_permissions my_profile
my_progress my_upcoming network_summary outing_chat_list outing_points outing_sheet people_engagement period_start person_journey pipeline_report
prayer_list profiles_private reading_board reading_streak rides_bus roads_in_bbox route_riders scoreboard search_people session_summary side_history
suggestions_list teaches_contact team_totals today_birthdays upcoming_birthdays weekend_absences weekly_report zone_progress`.split(/\s+/));

/** Cambios que se pueden repetir sin problema: si no hay señal se anotan y se suben después. */
const QUEUE_RPCS = new Set(['set_attendance']);
const QUEUE_TABLES: Record<string, string[]> = {
  outing_attendance: ['POST', 'DELETE'],
  absence_messages: ['POST', 'DELETE'],
  class_attendance: ['POST'],
  bus_pickups: ['POST', 'DELETE'],
  bible_plans: ['PATCH'],
};

export type Kind = 'read' | 'queue' | 'pass';

/** `path` es lo que sigue a /rest/v1/ (sin la consulta). `prefer` es el encabezado Prefer del pedido. */
export function classify(method: string, path: string, prefer = ''): Kind {
  const m = method.toUpperCase();
  if (path.startsWith('rpc/')) {
    const fn = path.slice(4);
    if (m === 'POST' && READ_RPCS.has(fn)) return 'read';
    if (m === 'POST' && QUEUE_RPCS.has(fn)) return 'queue';
    return 'pass';
  }
  if (m === 'GET' || m === 'HEAD') return 'read';
  // Si la pantalla espera que la base le devuelva la fila, no se puede inventar la respuesta.
  if (/return=representation/.test(prefer)) return 'pass';
  return QUEUE_TABLES[path]?.includes(m) ? 'queue' : 'pass';
}

/** Clave corta y estable para cada pedido. */
export function hashKey(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

export type IndexEntry = { n: number; t: number; p: string; a: string };
export type CacheIndex = Record<string, IndexEntry>;

/** Qué claves borrar (las que hace más que no se usan) para no pasarse del espacio. */
export function evictions(index: CacheIndex, cap: number): string[] {
  let total = Object.values(index).reduce((s, e) => s + e.n, 0);
  const out: string[] = [];
  for (const [k, e] of Object.entries(index).sort((x, y) => x[1].t - y[1].t)) {
    if (total <= cap) break;
    out.push(k);
    total -= e.n;
  }
  return out;
}

export type Queued = { id: string; method: string; path: string; query: string; body: string | null; prefer: string; at: number };

const parse = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const eq = (query: string, col: string): string | null => {
  const m = new RegExp(`(?:^|[?&])${col}=eq\\.([^&]*)`).exec(query);
  return m ? decodeURIComponent(m[1]) : null;
};

/**
 * Un cambio pendiente se refleja en lo que ya estaba guardado, así al volver a la pantalla sin señal
 * la marca sigue puesta. `entryPath` y `entryArgs` identifican el pedido guardado; `text` es su respuesta.
 * Devuelve el texto nuevo, o null si ese guardado no tiene que ver con el cambio.
 */
export function patchCached(q: Queued, entryPath: string, entryArgs: string, text: string): string | null {
  const body = parse<Record<string, unknown>>(q.body);

  if (q.path === 'rpc/set_attendance' && entryPath === 'rpc/attendance_sheet' && body) {
    const args = parse<{ p_date?: string; p_service?: string }>(entryArgs);
    if (!args || args.p_date !== body.p_date || args.p_service !== body.p_service) return null;
    const rows = parse<{ contact_id: string; present: boolean }[]>(text);
    if (!Array.isArray(rows)) return null;
    return JSON.stringify(rows.map((r) => (r.contact_id === body.p_contact ? { ...r, present: !!body.p_present } : r)));
  }

  if (q.path === 'outing_attendance' && entryPath === 'rpc/outing_sheet') {
    const args = parse<{ p_date?: string }>(entryArgs);
    const contact = q.method === 'POST' ? (body?.contact_id as string | undefined) : eq(q.query, 'contact_id');
    const date = q.method === 'POST' ? (body?.went_on as string | undefined) : eq(q.query, 'went_on');
    if (!args || !contact || args.p_date !== date) return null;
    const sheet = parse<{ total: number; rows: { contact_id: string; marked: boolean; via_app: boolean }[] }>(text);
    if (!sheet || !Array.isArray(sheet.rows)) return null;
    const on = q.method === 'POST';
    let diff = 0;
    const rows = sheet.rows.map((r) => {
      if (r.contact_id !== contact || r.marked === on) return r;
      if (!r.via_app) diff += on ? 1 : -1;
      return { ...r, marked: on };
    });
    return JSON.stringify({ ...sheet, total: Math.max(0, (Number(sheet.total) || 0) + diff), rows });
  }

  if (q.path === 'class_attendance' && q.method === 'POST' && entryPath === 'class_attendance' && body) {
    if (eq(entryArgs, 'class_id') !== body.class_id || eq(entryArgs, 'on_date') !== body.on_date) return null;
    const rows = parse<Record<string, unknown>[]>(text);
    if (!Array.isArray(rows)) return null;
    const i = rows.findIndex((r) => r.contact_id === body.contact_id);
    const row = { id: '', ...(i >= 0 ? rows[i] : {}), ...body };
    return JSON.stringify(i >= 0 ? rows.map((r, j) => (j === i ? row : r)) : [...rows, row]);
  }

  if (q.path === 'bible_plans' && q.method === 'PATCH' && entryPath === 'bible_plans' && body) {
    const rows = parse<unknown>(text);
    if (Array.isArray(rows)) return JSON.stringify(rows.map((r) => ({ ...(r as object), ...body })));
    if (rows && typeof rows === 'object') return JSON.stringify({ ...(rows as object), ...body });
  }
  return null;
}

/** Al subir un cambio pendiente: ¿se saca de la lista, o se guarda para probar de nuevo? */
export function replayOutcome(status: number): 'done' | 'retry' {
  // Sin sesión o con el servidor caído: se prueba más tarde. Lo demás ya quedó (o no tiene arreglo).
  return status === 401 || status === 408 || status === 429 || status >= 500 ? 'retry' : 'done';
}
