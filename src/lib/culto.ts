// Lo que va y viene de la base para: orden del culto, oraciones respondidas, lección de cada clase,
// versículos de memoria, caja de preguntas y la lista de mis apuntes de prédicas.
import { supabase } from './supabase';
import { cleanItems, type PlanItem, type ServicePlan } from './servicePlan';
import type { MemoryVerse, VerseDone } from './verses';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}
type Raw = Omit<ServicePlan, 'items'> & { items: unknown };
const plan = (r: Raw): ServicePlan => ({ ...r, items: cleanItems(r.items) });
const PLAN_COLS = 'id, church_id, service_date, title, items, updated_at';

// ---------- Orden del culto ----------
/** Los que puedo ver: todos si soy líder; si no, solo donde tengo una parte. */
export async function listPlans(from: string): Promise<ServicePlan[]> {
  const rows = (ok(await supabase.from('service_plans').select(PLAN_COLS).gte('service_date', from).order('service_date').limit(60)) ?? []) as Raw[];
  return rows.map(plan);
}
export async function pastPlans(before: string): Promise<ServicePlan[]> {
  const rows = (ok(await supabase.from('service_plans').select(PLAN_COLS).lt('service_date', before).order('service_date', { ascending: false }).limit(12)) ?? []) as Raw[];
  return rows.map(plan);
}
export async function getPlan(id: string): Promise<ServicePlan | null> {
  const r = ok(await supabase.from('service_plans').select(PLAN_COLS).eq('id', id).maybeSingle()) as Raw | null;
  return r ? plan(r) : null;
}
export async function createPlan(service_date: string, title: string, items: PlanItem[]): Promise<string> {
  const r = ok(await supabase.from('service_plans').insert({ service_date, title, items }).select('id').single()) as { id: string };
  return r.id;
}
export async function savePlan(id: string, patch: { service_date?: string; title?: string; items?: PlanItem[] }): Promise<void> {
  ok(await supabase.from('service_plans').update(patch).eq('id', id));
}
export async function removePlan(id: string): Promise<void> {
  ok(await supabase.from('service_plans').delete().eq('id', id));
}

// ---------- Oraciones respondidas ----------
export type AnsweredPrayer = { id: string; author: string | null; body: string; answer_note: string | null; answered_at: string; created_at: string; prayed: number; mine: boolean };
export async function markAnswered(id: string, note: string | null): Promise<void> {
  ok(await supabase.rpc('culto_prayer_answered', { p_id: id, p_note: note }));
}
export async function answeredPrayers(): Promise<AnsweredPrayer[]> {
  return (ok(await supabase.rpc('culto_answered_prayers')) ?? []) as AnsweredPrayer[];
}

// ---------- Lección de la clase ----------
export type Lesson = { id: string; series: string; title: string; body: string | null; link_url: string | null; file_path: string | null; file_name: string | null; class_id: string | null };
export type LessonDay = { on_date: string; material_id: string | null; note: string | null; lesson: Lesson | null };
const LESSON_COLS = 'id, series, title, body, link_url, file_path, file_name, class_id';

/** Lo que hay cargado para cada día de la clase entre dos fechas. */
export async function lessonDays(classId: string, from: string, to: string): Promise<LessonDay[]> {
  const rows = (ok(await supabase.from('class_schedule').select('on_date, material_id, note').eq('class_id', classId).gte('on_date', from).lte('on_date', to).order('on_date')) ?? []) as { on_date: string; material_id: string | null; note: string | null }[];
  const ids = [...new Set(rows.map((r) => r.material_id).filter((x): x is string => !!x))];
  const mats = ids.length ? ((ok(await supabase.from('materials').select(LESSON_COLS).in('id', ids)) ?? []) as Lesson[]) : [];
  const by = new Map(mats.map((m) => [m.id, m]));
  return rows.map((r) => ({ ...r, lesson: r.material_id ? by.get(r.material_id) ?? null : null }));
}
export async function saveLesson(a: { classId: string; date: string; title: string; body: string | null; link: string | null; filePath: string | null; fileName: string | null }): Promise<string> {
  return ok(await supabase.rpc('culto_save_class_lesson', { p_class: a.classId, p_date: a.date, p_title: a.title, p_body: a.body, p_link: a.link, p_file_path: a.filePath, p_file_name: a.fileName })) as string;
}
/** El enlace de un material (columna nueva; la pantalla de materiales la pide aparte). */
export async function materialLink(id: string): Promise<string | null> {
  const r = await supabase.from('materials').select('link_url').eq('id', id).maybeSingle();
  return ((r.data as { link_url: string | null } | null)?.link_url) ?? null;
}

// ---------- Versículos de memoria ----------
const VERSE_COLS = 'id, class_id, reference, body, position, active';
/** Los versículos de una clase más los que son para toda la iglesia. */
export async function classVerses(classId: string): Promise<MemoryVerse[]> {
  return (ok(await supabase.from('memory_verses').select(VERSE_COLS).eq('active', true).or(`class_id.eq.${classId},class_id.is.null`).order('position').order('created_at')) ?? []) as MemoryVerse[];
}
export async function addVerse(classId: string | null, reference: string, body: string | null, position: number): Promise<void> {
  ok(await supabase.from('memory_verses').insert({ class_id: classId, reference, body, position }));
}
/** No se borra: se saca de la lista (lo que los chicos ya aprendieron queda guardado). */
export async function hideVerse(id: string): Promise<void> {
  ok(await supabase.from('memory_verses').update({ active: false }).eq('id', id));
}
export async function versesDone(contactIds: string[]): Promise<VerseDone[]> {
  if (!contactIds.length) return [];
  return (ok(await supabase.from('memory_verse_done').select('verse_id, contact_id, learned_on').in('contact_id', contactIds)) ?? []) as VerseDone[];
}
export async function setVerseDone(verseId: string, contactId: string, done: boolean): Promise<void> {
  if (done) ok(await supabase.from('memory_verse_done').upsert({ verse_id: verseId, contact_id: contactId }, { onConflict: 'verse_id,contact_id', ignoreDuplicates: true }));
  else ok(await supabase.from('memory_verse_done').delete().eq('verse_id', verseId).eq('contact_id', contactId));
}
/** Lo que aprendió un chico, con la cita de cada versículo (solo los que siguen en la lista). */
export async function childVerses(contactId: string): Promise<{ reference: string; learned_on: string }[]> {
  const r = await supabase.from('memory_verse_done').select('learned_on, memory_verses!inner(reference, active)').eq('contact_id', contactId).order('learned_on');
  if (r.error) throw r.error;
  type Row = { learned_on: string; memory_verses: { reference: string; active: boolean } | { reference: string; active: boolean }[] };
  return ((r.data ?? []) as unknown as Row[])
    .map((x) => ({ learned_on: x.learned_on, v: Array.isArray(x.memory_verses) ? x.memory_verses[0] : x.memory_verses }))
    .filter((x) => x.v?.active)
    .map((x) => ({ reference: x.v.reference, learned_on: x.learned_on }));
}

// ---------- Caja de preguntas ----------
export type QuestionRow = { id: string; body: string; status: 'new' | 'answered'; answer: string | null; answered_at: string | null; created_at: string; mine: boolean; author: string | null; anonymous: boolean };
export async function questionsList(): Promise<QuestionRow[]> {
  return (ok(await supabase.rpc('culto_questions_list')) ?? []) as QuestionRow[];
}
/** Si es anónima no se manda quién la hizo: en la base no queda ningún dato de la persona. */
export async function askQuestion(body: string, anonymous: boolean): Promise<void> {
  let user_id: string | null = null;
  if (!anonymous) {
    const { data } = await supabase.auth.getUser();
    user_id = data.user?.id ?? null;
    if (!user_id) throw new Error('Sin sesión');
  }
  ok(await supabase.from('bible_questions').insert({ body, user_id }));
}
export async function answerQuestion(id: string, answered: boolean, answer: string | null): Promise<void> {
  const { data } = await supabase.auth.getUser();
  ok(await supabase.from('bible_questions').update(
    answered ? { status: 'answered', answer, answered_by: data.user?.id ?? null, answered_at: new Date().toISOString() } : { status: 'new', answered_at: null },
  ).eq('id', id));
}
export async function removeQuestion(id: string): Promise<void> {
  ok(await supabase.from('bible_questions').delete().eq('id', id));
}

// ---------- Mis apuntes de prédicas ----------
export type MySermonNote = { sermon_id: string; answers: string[]; notes: string | null; updated_at: string; title: string; preached_on: string | null; preacher: string | null; notes_outline: string | null };
export async function mySermonNotesList(): Promise<MySermonNote[]> {
  const { data: u } = await supabase.auth.getUser();
  const r = await supabase.from('sermon_notes').select('sermon_id, answers, notes, updated_at, sermons(title, preached_on, preacher, notes_outline)')
    .eq('user_id', u.user?.id ?? '').order('updated_at', { ascending: false }).limit(300);
  if (r.error) throw r.error;
  type S = { title: string; preached_on: string | null; preacher: string | null; notes_outline: string | null };
  type Row = { sermon_id: string; answers: string[] | null; notes: string | null; updated_at: string; sermons: S | S[] | null };
  return ((r.data ?? []) as unknown as Row[]).map((x) => {
    const s = Array.isArray(x.sermons) ? x.sermons[0] : x.sermons;
    return { sermon_id: x.sermon_id, answers: x.answers ?? [], notes: x.notes, updated_at: x.updated_at, title: s?.title ?? 'Prédica', preached_on: s?.preached_on ?? null, preacher: s?.preacher ?? null, notes_outline: s?.notes_outline ?? null };
  });
}
