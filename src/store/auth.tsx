// Quién está logueado, su perfil, su iglesia y su grupo.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerForPush } from '../lib/push';
import type { Church, Contact, Group, Profile } from '../types';

type AuthState = {
  loading: boolean;
  session: AuthSession | null;
  profile: Profile | null;
  church: Church | null;
  group: Group | null;
  /** La ficha de la persona (foto, colectivo, estado de miembro). */
  me: Contact | null;
  isAdmin: boolean;
  /** Pastor o secretaría: cargan miembros, editan clases, ministerios, prédicas. */
  isStaff: boolean;
  /** Capitán, secretaría o pastor: ven el panel, la fidelidad y las ausencias. */
  isLeader: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [me, setMe] = useState<Contact | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setChurch(null);
      setGroup(null);
      setMe(null);
      return;
    }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    const prof = (p as Profile | null) ?? null;
    setProfile(prof);
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
      isAdmin: profile?.role === 'admin',
      isStaff: profile?.role === 'admin' || profile?.role === 'secretary',
      isLeader: profile?.role === 'admin' || profile?.role === 'secretary' || profile?.role === 'captain',
      refreshProfile: () => loadProfile(session?.user.id),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, profile, church, group, me, loadProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}
