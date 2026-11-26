// Grupos pequeños: todos los grupos de la iglesia, con cuándo y dónde se reúnen. Arriba, los míos.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, Tag } from '@/components/ui';
import { whenText } from '@/components/GroupGuide';
import { classTeachers, listSmallGroups, listProfiles, myGroupIds } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ClassRow, ClassTeacher, Profile } from '@/types';
import { tx } from '@/lib/i18n';

export default function Grupos() {
  const router = useRouter();
  const { profile, isStaff, can } = useAuth();
  const [groups, setGroups] = useState<ClassRow[] | null>(null);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [mine, setMine] = useState<string[]>([]);

  useFocusEffect(useCallback(() => {
    Promise.all([listSmallGroups(), classTeachers(), listProfiles().catch(() => [] as Profile[]), myGroupIds().catch(() => [] as string[])])
      .then(([g, t, p, m]) => { setGroups(g); setTeachers(t); setPeople(p); setMine(m); })
      .catch(() => setGroups([]));
  }, []));

  const canManage = isStaff || can('ens.editar');
  if (!groups) return <Loading />;
  const leadOf = (gid: string) => teachers.some((t) => t.class_id === gid && t.profile_id === profile?.id);
  const sorted = [...groups].sort((a, b) => Number(leadOf(b.id) || mine.includes(b.id)) - Number(leadOf(a.id) || mine.includes(a.id)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Grupos pequeños')} subtitle={tx('Durante la semana, en las casas')} back />
      <Screen>
        {canManage ? <Button title={tx('Nuevo grupo')} icon="plus" onPress={() => router.push('/grupo/editar' as Href)} /> : null}
        {!groups.length ? (
          <Empty icon="home" title={tx('Todavía no hay grupos')}
            text={canManage ? tx('Tocá “Nuevo grupo” para crear el primero. Después elegís el líder y quiénes van.') : tx('Cuando la iglesia arme grupos, aparecen acá.')} />
        ) : null}
        {sorted.map((g) => {
          const leaders = teachers.filter((t) => t.class_id === g.id && !t.is_helper).map((t) => people.find((p) => p.id === t.profile_id)?.display_name).filter(Boolean);
          const lead = leadOf(g.id);
          const inIt = mine.includes(g.id);
          return (
            <Pressable key={g.id} onPress={() => router.push({ pathname: '/grupo/[id]', params: { id: g.id } } as never)} accessibilityRole="button">
              <Card style={[{ gap: 6 }, (lead || inIt) && { borderColor: colors.green, borderWidth: 2 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Feather name="home" size={22} color={colors.green} />
                  <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text }}>{g.name}</Text>
                  {lead ? <Tag text={tx('Sos líder')} tone="green" /> : inIt ? <Tag text={tx('Tu grupo')} tone="green" /> : null}
                  <Feather name="chevron-right" size={20} color={colors.muted} />
                </View>
                {whenText(g) || g.place ? <Text style={{ fontSize: 14, color: colors.text }}>{[whenText(g), g.place].filter(Boolean).join(' · ')}</Text> : null}
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {[leaders.length ? tx('Líder: {names}', { names: leaders.join(', ') }) : tx('Sin líder todavía'),
                    (g.study ?? 'predica') === 'predica' ? tx('Repasan la prédica del domingo') : tx('Estudio propio')].join(' · ')}
                </Text>
              </Card>
            </Pressable>
          );
        })}
      </Screen>
    </View>
  );
}
