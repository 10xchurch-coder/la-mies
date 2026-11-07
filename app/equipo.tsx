// Equipo: quién está saliendo ahora, cómo va el día, mi grupo.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Avatar, Card, Empty, SectionTitle, Stat } from '@/components/ui';
import { listProfiles, teamLive, teamTotals } from '@/lib/api';
import { fmtDistance, fmtMinutes, fmtTime, groupWord } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { Profile, TeamLiveRow, TeamTotals } from '@/types';

export default function Equipo() {
  const router = useRouter();
  const { session, profile, church, group } = useAuth();
  const [live, setLive] = useState<TeamLiveRow[]>([]);
  const [totals, setTotals] = useState<TeamTotals | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);

  const load = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([teamLive(), teamTotals('day')]);
      setLive(l);
      setTotals(t);
    } catch {
      // sin señal
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      listProfiles().then(setMembers).catch(() => undefined);
      const id = setInterval(load, 15000);
      return () => clearInterval(id);
    }, [load]),
  );

  const mine = members.filter((m) => (group ? m.group_id === group.id : true) && m.id !== profile?.id);
  const gw = groupWord(church?.grouping);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        back
        title="Equipo"
        subtitle={live.length ? `${live.length} ${live.length === 1 ? 'hermano' : 'hermanos'} en salida ahora` : 'Nadie está saliendo ahora'}
        right={
          <Pressable onPress={() => router.push('/tablero')} accessibilityRole="button" style={styles.tablero}>
            <Feather name="award" size={16} color={colors.greenText} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.greenText }}>Tablero</Text>
          </Pressable>
        }
      />
      <Screen>
        <SectionTitle>En salida ahora</SectionTitle>
        {live.length ? (
          live.map((r) => (
            <Card key={r.user_id} style={styles.liveRow}>
              <Avatar name={r.display_name} color={colors.green} textColor="#FFFFFF" />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                  {r.display_name} {r.user_id === session?.user.id ? <Text style={{ color: colors.muted, fontWeight: '500' }}>(vos)</Text> : null}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Salió {fmtTime(r.started_at)} · {fmtMinutes((Date.now() - new Date(r.started_at).getTime()) / 60000)} · {r.contacts} contactos · {r.presentations} evangelio · {r.promises} promesas
                </Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/mapa')} accessibilityRole="button" accessibilityLabel={`Ver a ${r.display_name} en el mapa`} style={styles.iconBtn}>
                <Feather name="map" size={20} color={colors.green} />
              </Pressable>
            </Card>
          ))
        ) : (
          <Empty icon="users" title="Nadie está en salida" text="Cuando alguien toque Iniciar salida, lo ves acá y en el mapa." />
        )}

        <SectionTitle right={<Text style={{ fontSize: 11, fontWeight: '700', color: colors.greenText }}>● En vivo</Text>}>Salida de hoy · todo el equipo</SectionTitle>
        {totals ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={totals.members} label="Salieron" />
              <Stat value={fmtMinutes(totals.minutes)} label="Horas (entre todos)" />
              <Stat value={fmtDistance(Number(totals.km) * 1000)} label="Caminados" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={totals.houses ?? '—'} label="Casas" tone="blue" />
              <Stat value={totals.contacts} label="Contactos" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={totals.presentations} label="Evangelio presentado" tone="green" />
              <Stat value={totals.promises} label="Promesas" tone="amber" />
            </View>
          </View>
        ) : null}

        <SectionTitle right={group ? <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>{members.find((m) => m.id === (group.captain_id ?? ''))?.display_name ? `Capitán: ${members.find((m) => m.id === group.captain_id)?.display_name}` : ''}</Text> : undefined}>
          {group ? `Mi ${gw.toLowerCase()} · ${group.name}` : 'Mi iglesia'}
        </SectionTitle>
        <Card style={{ padding: 0 }}>
          {mine.length ? (
            mine.map((m, i) => (
              <View key={m.id} style={[styles.memberRow, i === mine.length - 1 && { borderBottomWidth: 0 }]}>
                <Avatar name={m.display_name} size={36} color={colors.bgSoft} textColor={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                    {m.display_name} {m.role !== 'member' ? <Text style={{ fontSize: 11, color: colors.blueText }}>{m.role === 'admin' ? ' · Administrador' : ' · Capitán'}</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{live.some((l) => l.user_id === m.id) ? 'En salida ahora' : m.phone ?? ''}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ padding: 14, color: colors.muted, fontSize: 13 }}>Todavía no hay más hermanos en tu {gw.toLowerCase()}.</Text>
          )}
        </Card>
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  tablero: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.greenSoft },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
}));
