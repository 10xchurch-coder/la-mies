// Quién está logueado, su perfil, su iglesia y su grupo.
import { setFollowupConfig } from '@/lib/messages';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { PROFILE_COLS } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { netState } from '../lib/netFetch';
import { registerForPush } from '../lib/push';
import type { Church, Contact, Group, Profile } from '../types';
import { financeLevelFromPerms, hasRole, rolePerms, type Perm } from '../lib/perms';
import { isDemoSession, leaveDemo } from '../lib/demo';

// Quién fue el último en entrar en este teléfono. Si la app se abre sin señal y la sesión no se puede renovar,
// se sigue como esa persona con lo último guardado; cuando vuelve la señal, la sesión se renueva sola.
const LAST_USER = 'lamies.lastUser';
async function offlineSession(): Promise<AuthSession | null> {
  if (netState().online) return null;
  try {
    const u = JSON.parse((await AsyncStorage.getItem(LAST_USER)) ?? 'null') as { id: string; email?: string } | null;
    return u?.id ? ({ access_token: '', refresh_token: '', token_type: 'bearer', expires_in: 0, user: { id: u.id, email: u.email, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } } as unknown as AuthSession) : null;
  } catch {
    return null;
  }
}
function rememberUser(s: AuthSession | null) {
  if (s?.user.id && s.access_token) AsyncStorage.setItem(LAST_USER, JSON.stringify({ id: s.user.id, email: s.user.email })).catch(() => undefined);
}

type AuthState = {
  loading: boolean;
  session: AuthSession | null;
  profile: Profile | null;
  church: Church | null;
  group: Group | null;
  /** La ficha de la persona (foto, colectivo, estado de miembro). */
  me: Contact | null;
  /** Dan roles y permisos (pastor y administrador de la app). */
  isAdmin: boolean;
  /** Pueden cargar y editar personas (pastor, secretaría…). */
  isStaff: boolean;
  /** Capitán, secretaría o pastor: ven el panel, la fidelidad y las ausencias. */
  isLeader: boolean;
  /** 0 sin acceso · 1 revisor · 2 carga · 3 tesorero · 4 pastor / administrador de finanzas */
  financeLevel: number;
  /** Permisos efectivos (rol + permisos sueltos). */
  perms: string[];
  can: (p: Perm) => boolean;
  /** "Ver como miembro": el pastor mira la app como la ve un hermano común. Solo cambia lo que se muestra, no lo que se puede hacer en la base. */
  viewAsMember: boolean;
  setViewAsMember: (on: boolean) => void;
  /** Permisos reales de la cuenta (no cambian con "ver como miembro"). */
  realPerms: string[];
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

/** Permisos aproximados de una persona según su rol (los exactos los da la base con perms_of). */
export function permsOf(p: Profile | null | undefined): string[] {
  if (!p) return [];
  let v: string[] = [...rolePerms(p.role), ...(p.extra_roles ?? []).flatMap((r) => rolePerms(r))];
  if (p.role !== 'admin' && p.role !== 'app_admin' && p.finance_role) {
    v = v.filter((x) => !x.startsWith('fin.'));
    const f: Record<string, string[]> = { manager: ['fin.ver', 'fin.cargar', 'fin.tesoreria', 'fin.roles'], treasurer: ['fin.ver', 'fin.cargar', 'fin.tesoreria'], secretary: ['fin.ver', 'fin.cargar'], viewer: ['fin.ver'] };
    v = [...v, ...(f[p.finance_role] ?? [])];
  }
  return v;
}

/** Nivel de finanzas de una persona según su rol (igual que public.finance_level_of sin permisos sueltos). */
export function financeLevelOf(p: Profile | null | undefined): number {
  return financeLevelFromPerms(permsOf(p));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [me, setMe] = useState<Contact | null>(null);
  const [realPerms, setPerms] = useState<string[]>([]);
  const [viewAsMember, setViewAsMemberRaw] = useState(false);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setViewAsMemberRaw(false);
      setProfile(null);
      setPerms([]);
      setChurch(null);
      setGroup(null);
      setMe(null);
      return;
    }
    // Lo propio se lee con my_profile() (el teléfono y domicilio de los demás no se leen directo).
    let { data: p } = await supabase.rpc('my_profile');
    if (!p || !(p as Profile).id) ({ data: p } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle());
    const prof = (p as Profile | null) ?? null;
    setProfile(prof);
    const { data: pp, error: pe } = await supabase.rpc('my_permissions');
    setPerms(!pe && Array.isArray(pp) ? (pp as string[]) : permsOf(prof));
    if (prof?.church_id) {
      const { data: c } = await supabase.from('churches').select('*').eq('id', prof.church_id).maybeSingle();
      setChurch((c as Church | null) ?? null);
      setFollowupConfig((c as Church | null)?.followup ?? null);
    } else {
      setChurch(null);
    }
    if (prof?.church_id) {
      let { data: m } = await supabase.from('contacts').select('*').eq('profile_id', userId).maybeSingle();
      if (!m) {
        const { data: newId } = await supabase.rpc('ensure_my_card');
        if (newId) ({ data: m } = await supabase.from('contacts').select('*').eq('id', newId as string).maybeSingle());
      }
      setMe((m as Contact | null) ?? null);
      registerForPush(userId);
    } else {
      setMe(null);
    }
    if (prof?.group_id) {
      const { data: g } = await supabase.from('groups').select('*').eq('id', prof.group_id).maybeSingle();
      setGroup((g as Group | null) ?? null);
    } else {
      setGroup(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const s = data.session ?? (await offlineSession());
      rememberUser(s);
      setSession(s);
      await loadProfile(s?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, real) => {
      if (event === 'SIGNED_OUT') AsyncStorage.removeItem(LAST_USER).catch(() => undefined);
      const s = real ?? (event === 'SIGNED_OUT' ? null : await offlineSession());
      rememberUser(s);
      setSession(s);
      await loadProfile(s?.user.id);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const canSwitchView = realPerms.includes('admin.permisos');
  const value = useMemo<AuthState>(
    () => {
      const asMember = viewAsMember && canSwitchView;
      // Mirando como miembro: sin rol especial, sin permisos sueltos y sin rol de finanzas.
      const shownProfile = asMember && profile ? { ...profile, role: 'member', extra_roles: [], finance_role: null } as Profile : profile;
      const perms = asMember ? permsOf(shownProfile) : realPerms;
      return {
        loading,
        session,
        profile: shownProfile,
        church,
        group,
        me,
        isAdmin: perms.includes('admin.permisos'),
        isStaff: perms.includes('personas.editar'),
        isLeader: perms.includes('personas.ver_todas') || perms.includes('inf.panel') || hasRole(shownProfile, 'captain'),
        financeLevel: financeLevelFromPerms(perms),
        perms,
        can: (k: Perm) => perms.includes(k),
        viewAsMember: asMember,
        setViewAsMember: (on: boolean) => setViewAsMemberRaw(on && canSwitchView),
        realPerms,
        refreshProfile: () => loadProfile(session?.user.id),
        signOut: async () => {
          setViewAsMemberRaw(false);
          // En la demostración se sale solo de este navegador: los demás visitantes usan la misma cuenta de ejemplo.
          if (isDemoSession(session)) await leaveDemo();
          else await supabase.auth.signOut();
        },
      };
    },
    [loading, session, profile, church, group, me, realPerms, viewAsMember, canSwitchView, loadProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}
