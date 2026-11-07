// Zonas asignadas: lista con avance. El líder crea nuevas; cada uno ve primero las suyas.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, SectionTitle } from '@/components/ui';
import { listProfiles, listZones, zoneProgress } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Profile, Zone, ZoneProgress } from '@/types';

export default function Zonas() {
  const router = useRouter();
  const { profile, isLeader } = useAuth();
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [prog, setProg] = useState<Record<string, ZoneProgress>>({});

  useFocusEffect(
    useCallback(() => {
      listProfiles().then(setPeople).catch(() => undefined);
      listZones().then((zs) => {
        setZones(zs);
        zs.slice(0, 20).forEach((z) => zoneProgress(z.id).then((p) => p && setProg((cur) => ({ ...cur, [z.id]: p }))).catch(() => undefined));
      }).catch(() => setZones([]));
    }, []),
  );

  const mine = (zones ?? []).filter((z) => z.assigned.includes(profile?.id ?? ''));
  const others = (zones ?? []).filter((z) => !z.assigned.includes(profile?.id ?? ''));

  const Row = ({ z }: { z: Zone }) => {
    const p = prog[z.id];
    const pct = p && p.sidewalks ? Math.round((p.done / p.sidewalks) * 100) : null;
    return (
      <Pressable onPress={() => router.push(`/zona?id=${z.id}` as Href)} accessibilityRole="button">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
          <View style={{ width: 14, height: 42, borderRadius: 4, backgroundColor: z.color }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{z.name}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
              {people.filter((x) => z.assigned.includes(x.id)).map((x) => x.display_name).join(', ') || 'Sin asignar'}
            </Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{pct == null ? '…' : `${pct}%`}</Text>
          <Feather name="chevron-right" size={18} color={colors.muted} />
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Zonas" subtitle="Dónde sale cada uno y cuánto falta" back />
      <Screen>
        {isLeader ? <Button title="Nueva zona" icon="plus" onPress={() => router.push('/zona' as Href)} /> : null}
        {zones === null ? <Loading /> : !zones.length ? <Empty icon="map" title="Todavía no hay zonas" text={isLeader ? 'Dibujá una zona en el mapa y asignala a una pareja.' : 'Cuando el líder asigne zonas, las ves acá.'} /> : null}
        {mine.length ? (
          <>
            <SectionTitle>Mis zonas</SectionTitle>
            {mine.map((z) => <Row key={z.id} z={z} />)}
          </>
        ) : null}
        {others.length ? (
          <>
            <SectionTitle>{mine.length ? 'Las demás' : 'Zonas de la iglesia'}</SectionTitle>
            {others.map((z) => <Row key={z.id} z={z} />)}
          </>
        ) : null}
      </Screen>
    </View>
  );
}
