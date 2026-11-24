// La Mies Central: lo que se le pide a la base. Todo pasa por funciones central_* (0087) que deciden en la base quién entra
// y devuelven solo datos de la iglesia y cantidades. Acá no se lee ninguna tabla.
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { cleanChurch, cleanWeek, type CentralChurch, type CentralRole, type CentralWeek, type HelpStatus, type IdeaStatus } from './central';
import { isDemoNow } from './demo';
import { getLang } from './i18n';
import { supabase } from './supabase';
import { useAuth } from '@/store/auth';

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

// ---------- ¿Soy del equipo de La Mies? ----------
// Se pregunta una vez por cuenta y se recuerda mientras la app está abierta. El menú se arma con esto;
// igual, cada función de la base vuelve a revisar el permiso.
const roles = new Map<string, CentralRole>();
const asking = new Set<string>();
const listeners = new Set<() => void>();
let stamp = 0;
const changed = () => { stamp++; listeners.forEach((l) => l()); };

async function askRole(uid: string): Promise<void> {
  if (asking.has(uid)) return;
  asking.add(uid);
  try {
    const r = await supabase.rpc('central_role');
    const v = r.error ? null : (r.data as string | null);
    roles.set(uid, v === 'owner' || v === 'staff' ? v : null);
  } catch { roles.set(uid, null); } finally { asking.delete(uid); changed(); }
}

/** 'owner' (dueño de la red), 'staff' (equipo designado), null (no entra) o undefined (todavía no se sabe). */
export function useCentralRole(): CentralRole | undefined {
  const { session, profile } = useAuth();
  const uid = session?.user?.id ?? null;
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => stamp, () => stamp);
  useEffect(() => { if (uid && profile?.church_id && !roles.has(uid) && !isDemoNow()) askRole(uid); }, [uid, profile?.church_id]);
  if (!uid || !profile) return undefined;
  if (isDemoNow() || !profile.church_id) return null;
  if (profile.is_network_admin) return 'owner';
  return roles.has(uid) ? roles.get(uid) ?? null : undefined;
}

/** Las marcas para el menú del escritorio: 'central' (entra a Central) y 'net' (dueño de la red). */
export function useDeskFlags(): string[] {
  const role = useCentralRole();
  return role === 'owner' ? ['central', 'net'] : role === 'staff' ? ['central'] : [];
}

// ---------- La app avisa que se abrió hoy (para contar usuarios activos, versiones e idiomas; nunca qué hizo cada uno) ----------
let pinged = '';
export function pingCentral(uid: string | null | undefined, version: string): void {
  if (!uid || isDemoNow()) return;
  const key = `${uid}|${new Date().toISOString().slice(0, 10)}|${getLang()}`;
  if (pinged === key) return;
  pinged = key;
  Promise.resolve(supabase.rpc('central_ping', { p_platform: Platform.OS, p_version: version, p_lang: getLang() })).catch(() => { pinged = ''; });
}

// ---------- Resumen, iglesias y semanas ----------
export type CentralOverview = { role: CentralRole; churches: CentralChurch[]; weeks: CentralWeek[]; demo: { name: string } | null; help_open: number; ideas_new: number; computed_at: string | null };
export async function centralOverview(): Promise<CentralOverview> {
  const d = ok(await supabase.rpc('central_overview')) as Record<string, unknown>;
  return {
    role: d.role === 'owner' ? 'owner' : 'staff',
    churches: ((d.churches as unknown[]) ?? []).map(cleanChurch),
    weeks: ((d.weeks as unknown[]) ?? []).map(cleanWeek),
    demo: d.demo && typeof d.demo === 'object' ? { name: String((d.demo as { name?: string }).name ?? '') } : null,
    help_open: Number(d.help_open ?? 0), ideas_new: Number(d.ideas_new ?? 0), computed_at: (d.computed_at as string) ?? null,
  };
}
export async function centralWeeks(o: { church?: string | null; from?: string; to?: string } = {}): Promise<CentralWeek[]> {
  return ((ok(await supabase.rpc('central_weeks', { p_church: o.church ?? null, p_from: o.from ?? null, p_to: o.to ?? null })) as unknown[]) ?? []).map(cleanWeek);
}
export const centralRefresh = async (weeks = 2) => Number(ok(await supabase.rpc('central_refresh', { p_weeks: weeks })) ?? 0);

export type TechCount = { key: string; users: number };
export type ChurchNote = { id: string; kind: string; body: string; at: string; author: string | null; mine: boolean };
export type TimelineItem = { at: string; kind: string; text: string };
export type CentralChurchDetail = {
  role: CentralRole; church: CentralChurch;
  now: { members: number; visitors: number; contacts: number; leaders: number; services: { name: string; dow: number; time: string | null }[]; classes: number; events_next: number };
  tech: { platforms: TechCount[]; versions: TechCount[]; langs: TechCount[] };
  notes: ChurchNote[]; timeline: TimelineItem[]; weeks: CentralWeek[];
};
export async function centralChurch(id: string): Promise<CentralChurchDetail> {
  const d = ok(await supabase.rpc('central_church', { p_church: id })) as Record<string, unknown>;
  const now = (d.now ?? {}) as Record<string, unknown>;
  const tech = (d.tech ?? {}) as Record<string, TechCount[]>;
  return {
    role: d.role === 'owner' ? 'owner' : 'staff', church: cleanChurch(d.church),
    now: { members: Number(now.members ?? 0), visitors: Number(now.visitors ?? 0), contacts: Number(now.contacts ?? 0), leaders: Number(now.leaders ?? 0),
      services: (now.services as CentralChurchDetail['now']['services']) ?? [], classes: Number(now.classes ?? 0), events_next: Number(now.events_next ?? 0) },
    tech: { platforms: tech.platforms ?? [], versions: tech.versions ?? [], langs: tech.langs ?? [] },
    notes: (d.notes as ChurchNote[]) ?? [], timeline: (d.timeline as TimelineItem[]) ?? [], weeks: ((d.weeks as unknown[]) ?? []).map(cleanWeek),
  };
}
export const noteAdd = async (church: string, kind: string, body: string) => ok(await supabase.rpc('central_note_add', { p_church: church, p_kind: kind, p_body: body })) as string;
export const noteArchive = async (id: string) => { ok(await supabase.rpc('central_note_archive', { p_id: id })); };
/** Prender o apagar una función de otra iglesia (queda anotado y al pastor le llega un aviso). */
export const setChurchFeature = async (church: string, feature: string, on: boolean) => (ok(await supabase.rpc('central_set_feature', { p_church: church, p_feature: feature, p_on: on })) ?? []) as string[];
export const suggestFeature = async (church: string, feature: string, message?: string) => { ok(await supabase.rpc('central_suggest_feature', { p_church: church, p_feature: feature, p_message: message ?? null })); };

// ---------- Equipo ----------
export type TeamMember = { id: string; name: string; role: 'owner' | 'staff'; church_role: string; granted_at?: string; granted_by?: string | null; note?: string | null };
export type CentralTeam = { role: CentralRole; team: TeamMember[]; candidates: { id: string; name: string; church_role: string }[]; log: { at: string; action: string; who: string | null }[] };
export const centralTeam = async () => ok(await supabase.rpc('central_team')) as CentralTeam;
export const staffGrant = async (profile: string, note?: string) => { ok(await supabase.rpc('central_staff_grant', { p_profile: profile, p_note: note ?? null })); };
export const staffRevoke = async (profile: string) => { ok(await supabase.rpc('central_staff_revoke', { p_profile: profile })); };

// ---------- Pedidos de ayuda ----------
export type HelpRequest = {
  id: string; church_id: string | null; church: string; asker_name: string | null; asker_role: string | null; asker_phone: string | null; asker_email: string | null;
  step: string | null; screen: string | null; message: string | null; status: HelpStatus; assignee: string | null; assignee_name: string | null;
  created_at: string; updated_at: string; resolved_at: string | null; notes: { id: string; body: string; at: string; author: string | null }[];
};
export const helpList = async () => (ok(await supabase.rpc('central_help_list')) ?? []) as HelpRequest[];
export const helpUpdate = async (id: string, o: { status?: HelpStatus; assignee?: string | null }) => {
  ok(await supabase.rpc('central_help_update', { p_id: id, p_status: o.status ?? null, p_assignee: o.assignee ?? null, p_set_assignee: o.assignee !== undefined }));
};
export const helpNote = async (id: string, body: string) => { ok(await supabase.rpc('central_help_note', { p_id: id, p_body: body })); };

/** Lo llama cualquier "Necesito ayuda": deja el pedido anotado para el equipo. Nunca frena al que pide: si falla, no pasa nada. */
export function logHelp(o: { step?: string | null; screen?: string | null; message?: string | null; church?: string | null }): void {
  if (isDemoNow()) return;
  Promise.resolve(supabase.auth.getSession()).then(({ data }) => {
    if (!data.session) return undefined;
    return supabase.rpc('central_help_create', { p_step: o.step ?? null, p_screen: o.screen ?? null, p_message: o.message ?? null, p_church_name: o.church ?? null });
  }).catch(() => undefined);
}
/** Igual, pero avisa si no se pudo (para la pantalla "Pedir ayuda a La Mies"). */
export const helpCreate = async (o: { step?: string | null; screen?: string | null; message?: string | null }) =>
  ok(await supabase.rpc('central_help_create', { p_step: o.step ?? null, p_screen: o.screen ?? null, p_message: o.message ?? null, p_church_name: null })) as string | null;
export type MyHelp = { id: string; step: string | null; message: string | null; status: HelpStatus; created_at: string; resolved_at: string | null };
export const helpMine = async () => (ok(await supabase.rpc('central_help_mine')) ?? []) as MyHelp[];

// ---------- Ideas ----------
export type Idea = { id: string; church_id: string; church: string; author_name: string | null; body: string; status: IdeaStatus; reply: string | null; team_note: string | null; created_at: string; updated_at: string };
export const ideasList = async () => (ok(await supabase.rpc('central_ideas_list')) ?? []) as Idea[];
export const ideaUpdate = async (id: string, o: { status?: IdeaStatus; reply?: string; teamNote?: string }) => {
  ok(await supabase.rpc('central_idea_update', { p_id: id, p_status: o.status ?? null, p_reply: o.reply ?? null, p_team_note: o.teamNote ?? null }));
};
export const ideaSend = async (body: string) => ok(await supabase.rpc('central_idea_send', { p_body: body })) as string | null;
export type MyIdea = { id: string; body: string; status: IdeaStatus; reply: string | null; created_at: string };
export const ideasMine = async () => (ok(await supabase.rpc('central_ideas_mine')) ?? []) as MyIdea[];

// ---------- Errores ----------
export type ErrorGroup = { message: string; screen: string | null; platform: string; version: string; count: number; churches: number; people: number; first_at: string; last_at: string; last_7: number };
export const centralErrors = async (days = 30) => (ok(await supabase.rpc('central_errors', { p_days: days })) ?? []) as ErrorGroup[];
