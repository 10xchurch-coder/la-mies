// Administración: lista de hermanos con su rol y grupo; crear grupos.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Avatar, Button, Card, Field, SectionTitle, Tag } from '@/components/ui';
import { listGroups, listProfiles } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { ROLE_LABEL, groupWord } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Group, Profile } from '@/types';

export default function Miembros() {
  const router = useRouter();
  const { church, profile } = useAuth();
  const [people, setPeople] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroup, setNewGroup] = useState('');

  const load = useCallback(() => {
    listProfiles().then(setPeople).catch(() => undefined);
    listGroups().then(setGroups).catch(() => undefined);
  }, []);

  useFocusEffect(load);

  const addGroup = async () => {
    if (!newGroup.trim() || !church) return;
    const { error } = await supabase.from('groups').insert({ church_id: church.id, name: newGroup.trim() });
    if (error) Alert.alert('No se pudo', errorMessage(error));
    else {
      setNewGroup('');
      load();
    }
  };

  const gw = groupWord(church?.grouping);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Hermanos y roles" subtitle={`${people.length} en ${church?.name ?? 'la iglesia'}`} back />
      <Screen>
        <SectionTitle>{groupWord(church?.grouping, true)}</SectionTitle>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {groups.map((g) => (
              <Tag key={g.id} text={`${g.name} · ${people.filter((p) => p.group_id === g.id).length}`} tone="blue" />
            ))}
            {!groups.length ? <Text style={{ fontSize: 13, color: colors.muted }}>Todavía no hay {groupWord(church?.grouping, true).toLowerCase()}. Si la iglesia no se organiza así, no hace falta crear ninguno.</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Field label={`Nuevo ${gw.toLowerCase()}`} value={newGroup} onChangeText={setNewGroup} placeholder={church?.grouping === 'bus_routes' ? 'Colectivo 3' : 'Grupo norte'} style={{ flex: 1 }} />
            <Button title="Crear" small onPress={addGroup} disabled={!newGroup.trim()} />
          </View>
        </Card>

        <SectionTitle>Hermanos</SectionTitle>
        <Card style={{ padding: 0 }}>
          {people.map((p, i) => (
            <Pressable key={p.id} onPress={() => router.push({ pathname: '/admin/miembro', params: { id: p.id } })} accessibilityRole="button" style={[styles.row, i === people.length - 1 && { borderBottomWidth: 0 }]}>
              <Avatar name={p.display_name} size={36} color={p.role === 'admin' || p.role === 'secretary' ? colors.green : p.role === 'captain' ? colors.blueSoft : colors.bgSoft} textColor={p.role === 'admin' || p.role === 'secretary' ? '#FFFFFF' : p.role === 'captain' ? colors.blueText : colors.text} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>{p.display_name}{p.id === profile?.id ? ' (vos)' : ''}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {ROLE_LABEL[p.role]}{p.group_id ? ` · ${groups.find((g) => g.id === p.group_id)?.name ?? ''}` : ''}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
});
