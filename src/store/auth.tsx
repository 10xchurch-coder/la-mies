// Quién está logueado, su perfil, su iglesia y su grupo.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { PROFILE_COLS } from '@/lib/api';
import { supabase } from '../lib/supabase';
import { registerForPush } from '../lib/push';
import type { Church, Contact, Group, Profile } from '../types';
import { financeLevelFromPerms, rolePerms, type Perm } from '../lib/perms';

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
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

/** Permisos aproximados de una persona según su rol (los exactos los da la base con perms_of). */
export function permsOf(p: Profile | null | undefined): string[] {
  if (!p) return [];
  let v: string[] = rolePerms(p.role);
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
  const [perms, setPerms] = useState<string[]>([]);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
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
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      await loadProfile(s?.user.id);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      church,
      group,
      me,
      isAdmin: perms.includes('admin.permisos'),
      isStaff: perms.includes('personas.editar'),
      isLeader: perms.includes('personas.ver_todas') || perms.includes('inf.panel') || profile?.role === 'captain',
      financeLevel: financeLevelFromPerms(perms),
      perms,
      can: (k: Perm) => perms.includes(k),
      refreshProfile: () => loadProfile(session?.user.id),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, profile, church, group, me, perms, loadProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}
