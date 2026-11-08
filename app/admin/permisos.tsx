// Permisos de una persona: lo que le da su rol y lo que se le dio o sacó aparte.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Card, Loading, SectionTitle, Tag } from '@/components/ui';
import { getProfile } from '@/lib/api';
import { PERM_GROUPS, isTopRole, roleLabel, type Perm } from '@/lib/perms';
import { errorMessage, supabase } from '@/lib/supabase';
import { permsOf, useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Profile } from '@/types';

export default function Permisos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me, isAdmin, refreshProfile } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    getProfile(id).then(setP).catch(() => undefined);
    supabase.rpc('church_permissions').then(({ data }) => {
      const row = ((data ?? []) as { profile_id: string; perms: string[]; overrides: Record<string, boolean> }[]).find((r) => r.profile_id === id);
      setPerms(row?.perms ?? []);
      setOverrides(row?.overrides ?? {});
    });
  }, [id]);
  useFocusEffect(load);

  if (!p) return <Loading />;
  const locked = !isAdmin || (isTopRole(p.role) && !isTopRole(me?.role));
  const base = permsOf({ ...p });

  const toggle = async (k: Perm, on: boolean) => {
    if (k === 'admin.permisos' && !on && p.id === me?.id) { Alert.alert('No te podés sacar a vos mismo el permiso de dar permisos'); return; }
    const state = on === base.includes(k) ? 'default' : on ? 'grant' : 'revoke';
    setBusy(k);
    const { error } = await supabase.rpc('set_permission', { p_profile: p.id, p_perm: k, p_state: state });
    setBusy(null);
    if (error) Alert.alert('No se pudo', errorMessage(error));
    load();
    if (p.id === me?.id) refreshProfile();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={p.display_name} subtitle={`Permisos · ${roleLabel(p.role)}`} back />
      <Screen>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
          {locked
            ? isTopRole(p.role) ? 'Es pastor o administrador de la app: tiene todo, y solo otro pastor o administrador lo puede cambiar.' : 'Solo el pastor y el administrador de la app cambian permisos.'
            : 'Prendé o apagá lo que quieras. Lo que viene con su rol dice "por su rol"; lo que cambiás vos queda marcado.'}
        </Text>
        {PERM_GROUPS.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <SectionTitle>{g.title}</SectionTitle>
            <Card style={{ padding: 0 }}>
              {g.perms.map((x, i) => {
                const on = perms.includes(x.key);
                const ov = overrides[x.key];
                return (
                  <Pressable key={x.key} disabled={locked || busy !== null} onPress={() => toggle(x.key, !on)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{x.label}</Text>
                      {x.hint ? <Text style={{ fontSize: 12, color: colors.muted }}>{x.hint}</Text> : null}
                      <View style={{ flexDirection: 'row' }}>
                        {ov === true ? <Tag text="Dado aparte" tone="green" /> : ov === false ? <Tag text="Sacado aparte" tone="red" /> : on ? <Tag text="Por su rol" tone="gray" /> : null}
                      </View>
                    </View>
                    <Switch value={on} disabled={locked || busy !== null} onValueChange={(v) => toggle(x.key, v)} trackColor={{ true: colors.green, false: colors.input }} />
                  </Pressable>
                );
              })}
            </Card>
          </View>
        ))}
      </Screen>
    </View>
  );
}
