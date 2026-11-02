// Ministerios de la iglesia. Los míos aparecen primero y resaltados.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Tag } from '@/components/ui';
import { listMinistries, listProfiles, ministryMembers } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Ministry, MinistryMember, Profile } from '@/types';

type IconName = React.ComponentProps<typeof Feather>['name'];

export default function Ministerios() {
  const router = useRouter();
  const { profile } = useAuth();
  const [rows, setRows] = useState<Ministry[] | null>(null);
  const [members, setMembers] = useState<MinistryMember[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([listMinistries(), ministryMembers(), listProfiles()]).then(([m, mm, p]) => {
        setRows(m);
        setMembers(mm);
        setPeople(p);
      }).catch(() => setRows([]));
    }, []),
  );

  const isMine = (m: Ministry) => m.leader_id === profile?.id || members.some((x) => x.ministry_id === m.id && x.profile_id === profile?.id);
  const sorted = [...(rows ?? [])].sort((a, b) => Number(isMine(b)) - Number(isMine(a)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ministerios" subtitle="Cada uno con su chat, sus turnos y sus recomendaciones" back />
      <Screen>
        {rows && !rows.length ? <Empty icon="heart" title="Todavía no hay ministerios" /> : null}
        {sorted.map((m) => {
          const mine = isMine(m);
          const count = members.filter((x) => x.ministry_id === m.id).length;
          const leader = people.find((p) => p.id === m.leader_id)?.display_name;
          return (
            <Pressable key={m.id} onPress={() => router.push({ pathname: '/ministerio/[id]', params: { id: m.id } })} accessibilityRole="button">
              <Card style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, mine && { borderColor: colors.green, borderWidth: 2, backgroundColor: colors.greenSoft }]}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: mine ? colors.green : colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={(m.icon as IconName) ?? 'users'} size={20} color={mine ? '#FFF' : colors.green} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{m.name}</Text>
                    {mine ? <Tag text="Estás acá" tone="green" /> : null}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{count} {count === 1 ? 'integrante' : 'integrantes'}{leader ? ` · líder: ${leader}` : ''}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.muted} />
              </Card>
            </Pressable>
          );
        })}
      </Screen>
    </View>
  );
}
