// Llamadas a la base, con tipos. Si algo falla, lanza un Error con mensaje legible.
import { supabase, errorMessage } from './supabase';
import type { Bbox } from './geo';
import type {
  AbsenceRow, Attendance, ChurchReport, ChurchService, ClassAttendance, ClassRow, ClassSchedule, ClassTeacher, Contact, ContactChild,
  ContactVisit, CoverageRow, Duty, Engagement, Group, JourneyStep, Material, Ministry, MinistryMember, MinistryMessage,
  NotificationRow, OutingKind, Profile, RoadRow, ScoreRow, Sermon, Session, SheetRow, TeamLiveRow, TeamTotals, TrackPointRow,
  TrainingItem, UpcomingItem, DailyContent, ReadingStreak, ReadingBoardRow, AccountRow,
} from '../types';

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(errorMessage(res.error));
  return res.data as T;
}

export async function coverageInBbox(b: Bbox): Promise<CoverageRow[]> {
  return ok(await supabase.rpc('coverage_in_bbox', { p_min_lat: b.minLat, p_min_lng: b.minLng, p_max_lat: b.maxLat, p_max_lng: b.maxLng })) ?? [];
}

export async function roadsInBbox(b: Bbox): Promise<RoadRow[]> {
  return ok(await supabase.rpc('roads_in_bbox', { p_min_lat: b.minLat, p_min_lng: b.minLng, p_max_lat: b.maxLat, p_max_lng: b.maxLng })) ?? [];
}

export async function sideHistory(road: number, seg: number, side: 1 | -1, kind: OutingKind | null = null) {
  return (ok(await supabase.rpc('side_history', { p_road: road, p_seg: seg, p_side: side, p_kind: kind })) ?? []) as {
    covered_at: string; user_name: string | null; session_id: string; kind: OutingKind; presentations: number; promises: number;
  }[];
}

export async function teamLive(): Promise<TeamLiveRow[]> {
  return ok(await supabase.rpc('team_live')) ?? [];
}

export async function teamTotals(period: 'day' | 'week' | 'month' | 'all'): Promise<TeamTotals> {
  return ok(await supabase.rpc('team_totals', { p_period: period }));
}

export async function scoreboard(period: 'day' | 'week' | 'month' | 'all'): Promise<ScoreRow[]> {
  return ok(await supabase.rpc('scoreboard', { p_period: period })) ?? [];
}

export async function myProgress() {
  return ok(await supabase.rpc('my_progress'));
}

export async function churchReport(from: Date, to: Date): Promise<ChurchReport | null> {
  return ok(await supabase.rpc('church_report', { p_from: from.toISOString(), p_to: to.toISOString() }));
}

export async function listContacts(): Promise<Contact[]> {
  return ok(await supabase.from('contacts').select('*').eq('archived', false).order('created_at', { ascending: false }).limit(500)) ?? [];
}

export async function getContact(id: string) {
  const [c, children, visits, attendances] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', id).maybeSingle(),
    supabase.from('contact_children').select('*').eq('contact_id', id).order('age', { ascending: false }),
    supabase.from('contact_visits').select('*').eq('contact_id', id).order('visited_at', { ascending: false }),
    supabase.from('attendances').select('*').eq('contact_id', id).order('attended_on', { ascending: false }),
  ]);
  return {
    contact: ok(c) as Contact | null,
    children: (ok(children) ?? []) as ContactChild[],
    visits: (ok(visits) ?? []) as ContactVisit[],
    attendances: (ok(attendances) ?? []) as Attendance[],
  };
}

export async function listProfiles(): Promise<Profile[]> {
  return ok(await supabase.from('profiles').select('*').order('display_name')) ?? [];
}

export async function listGroups(): Promise<Group[]> {
  return ok(await supabase.from('groups').select('*').order('name')) ?? [];
}

export async function mySessions(): Promise<Session[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  return ok(await supabase.from('sessions').select('*').eq('user_id', u.user.id).order('started_at', { ascending: false }).limit(60)) ?? [];
}

export async function sessionPoints(sessionId: string): Promise<TrackPointRow[]> {
  return ok(await supabase.from('track_points').select('id, session_id, recorded_at, lat, lng, accuracy_m, speed_mps').eq('session_id', sessionId).order('recorded_at').limit(6000)) ?? [];
}

export async function trimSession(sessionId: string, cutoff: Date): Promise<Session> {
  return ok(await supabase.rpc('trim_session', { p_session: sessionId, p_cutoff: cutoff.toISOString(), p_auto_stopped: false }));
}

export async function listTraining(): Promise<TrainingItem[]> {
  return ok(await supabase.from('training_items').select('*').order('category').order('sort_order')) ?? [];
}

export async function getTraining(id: string): Promise<TrainingItem | null> {
  return ok(await supabase.from('training_items').select('*').eq('id', id).maybeSingle());
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('No hay sesión');
  ok(await supabase.from('profiles').update(patch).eq('id', u.user.id));
}

// ---------- Parte 2: la iglesia ----------
export async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('No hay sesión');
  return id;
}

export async function listPeople(): Promise<Contact[]> {
  return ok(await supabase.from('contacts').select('*').eq('archived', false).order('name').limit(2000)) ?? [];
}

export async function updateContact(id: string, patch: Partial<Contact>): Promise<void> {
  ok(await supabase.from('contacts').update(patch).eq('id', id));
}

export async function addPerson(p: Partial<Contact> & { name: string }): Promise<Contact> {
  const me = await uid();
  return ok(await supabase.from('contacts').insert({ created_by: me, share_mode: 'group', ...p }).select('*').single());
}

export async function linkAccount(contactId: string, profileId: string): Promise<void> {
  ok(await supabase.rpc('link_account', { p_contact: contactId, p_profile: profileId }));
}

export async function personJourney(id: string): Promise<JourneyStep[]> {
  return (ok(await supabase.rpc('person_journey', { p_contact: id })) as JourneyStep[] | null) ?? [];
}

export async function listServices(): Promise<ChurchService[]> {
  return ok(await supabase.from('church_services').select('*').eq('active', true).order('sort_order')) ?? [];
}

export async function listAllServices(): Promise<ChurchService[]> {
  return ok(await supabase.from('church_services').select('*').order('sort_order')) ?? [];
}

export async function attendanceSheet(date: string, serviceId: string): Promise<SheetRow[]> {
  return ok(await supabase.rpc('attendance_sheet', { p_date: date, p_service: serviceId })) ?? [];
}

export async function setAttendance(contactId: string, date: string, serviceId: string, present: boolean): Promise<void> {
  ok(await supabase.rpc('set_attendance', { p_contact: contactId, p_date: date, p_service: serviceId, p_present: present }));
}

export async function peopleEngagement(weeks = 12): Promise<Engagement[]> {
  return ok(await supabase.rpc('people_engagement', { p_weeks: weeks })) ?? [];
}

export async function weekendAbsences(saturday: string): Promise<AbsenceRow[]> {
  return ok(await supabase.rpc('weekend_absences', { p_saturday: saturday })) ?? [];
}

export async function myUpcoming(days = 21): Promise<UpcomingItem[]> {
  return ok(await supabase.rpc('my_upcoming', { p_days: days })) ?? [];
}

// Clases
export async function listClasses(): Promise<ClassRow[]> {
  return ok(await supabase.from('classes').select('*').eq('active', true).order('sort_order')) ?? [];
}
export async function classTeachers(classId?: string): Promise<ClassTeacher[]> {
  let q = supabase.from('class_teachers').select('*');
  if (classId) q = q.eq('class_id', classId);
  return ok(await q) ?? [];
}
export async function classStudents(classId: string): Promise<Contact[]> {
  const rows = (ok(await supabase.from('class_students').select('contact_id').eq('class_id', classId)) ?? []) as { contact_id: string }[];
  if (!rows.length) return [];
  return ok(await supabase.from('contacts').select('*').in('id', rows.map((r) => r.contact_id)).order('name')) ?? [];
}
const SCHEDULE_COLS = '*, teacher_contact:contacts!class_schedule_teacher_contact_id_fkey(id,name), helper_contact:contacts!class_schedule_helper_contact_id_fkey(id,name)';
export async function classSchedule(classId: string | null, from: string, to: string): Promise<ClassSchedule[]> {
  let q = supabase.from('class_schedule').select(SCHEDULE_COLS).gte('on_date', from).lte('on_date', to).order('on_date');
  if (classId) q = q.eq('class_id', classId);
  return (ok(await q) ?? []) as ClassSchedule[];
}
export async function saveSchedule(row: Partial<ClassSchedule> & { class_id: string; on_date: string }): Promise<void> {
  const { teacher_contact: _t, helper_contact: _h, ...plain } = row;
  ok(await supabase.from('class_schedule').upsert({ ...plain }, { onConflict: 'class_id,on_date' }));
}
/** Nombre del maestro o ayudante de un turno: primero la ficha, si no la cuenta. */
export function scheduleName(s: ClassSchedule | undefined | null, who: 'teacher' | 'helper', nameOf: (pid: string | null) => string | undefined): string | undefined {
  if (!s) return undefined;
  const c = who === 'teacher' ? s.teacher_contact : s.helper_contact;
  if (c?.name) return c.name;
  const pid = who === 'teacher' ? s.teacher_id : s.helper_id;
  return pid ? nameOf(pid) : undefined;
}
/** Los miembros de la iglesia (para elegir maestros, cónyuge, etc.). */
export async function listMembers(): Promise<Contact[]> {
  return ok(await supabase.from('contacts').select('*').eq('archived', false).eq('status', 'member').order('name').limit(1000)) ?? [];
}
/** Sugerencias de personas por nombre (sin importar acentos), para el cónyuge. */
export async function searchPeople(q: string): Promise<{ id: string; name: string; status: string; photo_path: string | null }[]> {
  return ok(await supabase.rpc('search_people', { p_q: q })) ?? [];
}
/** Hijos de la familia: los de la persona y los de su cónyuge. */
export async function familyChildren(contactId: string): Promise<ContactChild[]> {
  return ok(await supabase.rpc('family_children', { p_contact: contactId })) ?? [];
}
export async function classAttendance(classId: string, date: string): Promise<ClassAttendance[]> {
  return ok(await supabase.from('class_attendance').select('*').eq('class_id', classId).eq('on_date', date)) ?? [];
}
export async function saveClassAttendance(classId: string, date: string, contactId: string, present: boolean, note: string | null): Promise<void> {
  ok(await supabase.from('class_attendance').upsert(
    { class_id: classId, on_date: date, contact_id: contactId, present, note },
    { onConflict: 'class_id,on_date,contact_id' },
  ));
}

// Material
export async function listMaterials(): Promise<Material[]> {
  return ok(await supabase.from('materials').select('*').order('series').order('chapter_order')) ?? [];
}
export async function getMaterial(id: string): Promise<Material | null> {
  return ok(await supabase.from('materials').select('*').eq('id', id).maybeSingle());
}

// Ministerios
export async function listMinistries(): Promise<Ministry[]> {
  return ok(await supabase.from('ministries').select('*').order('sort_order')) ?? [];
}
export async function ministryMembers(ministryId?: string): Promise<MinistryMember[]> {
  let q = supabase.from('ministry_members').select('*');
  if (ministryId) q = q.eq('ministry_id', ministryId);
  return ok(await q) ?? [];
}
export async function ministryMessages(ministryId: string): Promise<MinistryMessage[]> {
  return ok(await supabase.from('ministry_messages').select('*').eq('ministry_id', ministryId).order('created_at', { ascending: false }).limit(200)) ?? [];
}
export async function sendMinistryMessage(ministryId: string, body: string, kind: MinistryMessage['kind']): Promise<void> {
  const me = await uid();
  ok(await supabase.from('ministry_messages').insert({ ministry_id: ministryId, user_id: me, body, kind }));
}
export async function listDuties(ministryId: string | null, from: string): Promise<Duty[]> {
  let q = supabase.from('duties').select('*').gte('on_date', from).order('on_date').limit(300);
  if (ministryId) q = q.eq('ministry_id', ministryId);
  return ok(await q) ?? [];
}

// Avisos
export async function listNotifications(): Promise<NotificationRow[]> {
  return ok(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)) ?? [];
}
export async function unreadCount(): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}
export async function markRead(id?: string): Promise<void> {
  let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (id) q = q.eq('id', id);
  ok(await q);
}

// Prédicas
export async function listSermons(): Promise<Sermon[]> {
  return ok(await supabase.from('sermons').select('*').order('preached_on', { ascending: false }).limit(200)) ?? [];
}
export async function getSermon(id: string): Promise<Sermon | null> {
  return ok(await supabase.from('sermons').select('*').eq('id', id).maybeSingle());
}

// ---------- Parte 3: versículo del día, devocional, racha, cuentas ----------
export async function dailyFor(date: string | null = null): Promise<DailyContent | null> {
  const d = ok(await supabase.rpc('daily_for', { p_date: date })) as DailyContent | null;
  return d && d.id ? d : null;
}

export async function listDailyContent(from: string, to: string): Promise<DailyContent[]> {
  return ok(await supabase.from('daily_content').select('*').gte('on_date', from).lte('on_date', to).order('on_date')) ?? [];
}

export async function saveDailyContent(row: Partial<DailyContent> & { on_date: string; reference: string; verse: string }): Promise<void> {
  // study/prayer pueden faltar en bases viejas; se mandan solo si tienen valor.
  const { id, church_id: _c, created_by: _b, created_at: _a, ...rest } = row;
  if (id) ok(await supabase.from('daily_content').update(rest).eq('id', id));
  else ok(await supabase.from('daily_content').insert(rest));
}

export async function deleteDailyContent(id: string): Promise<void> {
  ok(await supabase.from('daily_content').delete().eq('id', id));
}

export async function markReading(): Promise<ReadingStreak> {
  return ok(await supabase.rpc('mark_reading'));
}

export async function readingStreak(): Promise<ReadingStreak> {
  return ok(await supabase.rpc('reading_streak'));
}

export async function readingBoard(): Promise<ReadingBoardRow[]> {
  return ok(await supabase.rpc('reading_board')) ?? [];
}

export async function accountsOverview(): Promise<AccountRow[]> {
  const [rows, reqs] = await Promise.all([
    supabase.rpc('accounts_overview'),
    supabase.rpc('account_deletion_requests'),
  ]);
  const list = (ok(rows) ?? []) as AccountRow[];
  // Si la función de pedidos todavía no existe en la base, se sigue sin ese dato.
  const pending = new Map(((reqs.data ?? []) as { id: string; deletion_requested_at: string }[]).map((r) => [r.id, r.deletion_requested_at]));
  return list
    .map((r) => ({ ...r, deletion_requested_at: pending.get(r.id) ?? null }))
    .sort((a, b) => (b.deletion_requested_at ? 1 : 0) - (a.deletion_requested_at ? 1 : 0));
}

export async function setAccountDisabled(userId: string, disabled: boolean): Promise<void> {
  ok(await supabase.rpc('set_account_disabled', { p_user: userId, p_disabled: disabled }));
}

export async function requestAccountDeletion(): Promise<void> {
  ok(await supabase.rpc('request_account_deletion'));
}
