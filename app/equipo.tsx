// Evangelismo en vivo: quién está saliendo ahora y por dónde va (en el mapa), cómo va el día y mi grupo.
// Se ve en cualquier momento, sin iniciar una salida.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { CoverageMap, regionAround, type LiveMember } from '@/components/CoverageMap';
import { MapTypeButton, mapStyleProps, useMapStyle } from '@/components/MapTypeButton';
import { Header, Screen } from '@/components/Screen';
import { Avatar, Card, Empty, SectionTitle, Stat } from '@/components/ui';
import { listProfiles, teamLive, teamTotals } from '@/lib/api';
import { liveMemberActions } from '@/lib/directions';
import { fmtDistance, fmtMinutes, fmtTime, groupWord } from '@/lib/format';
import { haversine, type LatLng } from '@/lib/geo';
import { useLayout } from '@/lib/layout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { Profile, TeamLiveRow, TeamTotals } from '@/types';

export default function Equipo() {
  const router = useRouter();
  const { session, profile, church, group } = useAuth();
  const [live, setLive] = useState<TeamLiveRow[]>([]);
  const [totals, setTotals] = useState<TeamTotals | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [trails, setTrails] = useState<{ id: string; points: LatLng[]; color: string; name: string }[]>([]);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [mapStyle, setMapStyle] = useMapStyle();
  const { width } = useLayout();

  const load = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([teamLive(), teamTotals('day')]);
      setLive(l);
      setTotals(t);
      // El recorrido de hoy de cada uno, con su color.
      if (l.length) {
        const { data } = await supabase.from('track_points').select('session_id, lat, lng, recorded_at').in('session_id', l.map((o) => o.session_id)).order('recorded_at').limit(6000);
        const by = new Map<string, LatLng[]>();
        for (const p of (data ?? []) as { session_id: string; lat: number; lng: number }[]) {
          if (!by.has(p.session_id)) by.set(p.session_id, []);
          by.get(p.session_id)!.push({ lat: p.lat, lng: p.lng });
        }
        setTrails(l.map((o, i) => ({ id: o.session_id, name: o.display_name, points: by.get(o.session_id) ?? [], color: TRAIL_COLORS[i % TRAIL_COLORS.length] })).filter((x) => x.points.length > 1));
      } else {
        setTrails([]);
      }
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

  const onMap: LiveMember[] = useMemo(
    () => live.filter((r) => r.lat != null && r.lng != null).map((r) => ({ user_id: r.user_id, display_name: r.display_name, lat: r.lat as number, lng: r.lng as number, me: r.user_id === session?.user.id })),
    [live, session?.user.id],
  );
  // El mapa se acomoda para que entren todos; solo se vuelve a acomodar cuando cambia quién está saliendo (no en cada actualización).
  const who = onMap.map((m) => m.user_id).sort().join(',');
  const region = useMemo(() => {
    if (focus) return regionAround(focus, 250);
    if (!onMap.length) return undefined;
    const center = { lat: onMap.reduce((a, m) => a + m.lat, 0) / onMap.length, lng: onMap.reduce((a, m) => a + m.lng, 0) / onMap.length };
    const far = Math.max(0, ...onMap.map((m) => haversine(center, m)));
    return regionAround(center, Math.max(350, far * 1.5));
  }, [who, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = members.filter((m) => (group ? m.group_id === group.id : true) && m.id !== profile?.id);
  const gw = groupWord(church?.grouping);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        back
        title="Evangelismo en vivo"
        subtitle={live.length ? `${live.length} ${live.length === 1 ? 'hermano' : 'hermanos'} en salida ahora` : 'Nadie está saliendo ahora'}
        right={
          <Pressable onPress={() => router.push('/tablero')} accessibilityRole="button" style={styles.tablero}>
            <Feather name="award" size={16} color={colors.greenText} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.greenText }}>Tablero</Text>
          </Pressable>
        }
      />
      <Screen>
        {onMap.length && region ? (
          <View style={[styles.map, { height: width >= 900 ? 460 : 300 }]}>
            <CoverageMap roads={[]} coverage={[]} live={onMap} trails={trails} region={region} {...mapStyleProps(mapStyle)} onPressLive={(m) => liveMemberActions(m)} />
            <MapTypeButton style={mapStyle} onChange={setMapStyle} top={10} />
            {focus ? (
              <Pressable onPress={() => setFocus(null)} accessibilityRole="button" accessibilityLabel="Ver a todos en el mapa" style={styles.allBtn}>
                <Feather name="maximize" size={14} color={colors.greenText} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>Ver a todos</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <SectionTitle right={live.length ? <Text style={{ fontSize: 11, fontWeight: '700', color: colors.greenText }}>● Se actualiza solo</Text> : undefined}>En salida ahora</SectionTitle>
        {live.length ? (
          live.map((r, i) => (
            <Card key={r.user_id} style={styles.liveRow}>
              <Avatar name={r.display_name} color={trails.find((t) => t.id === r.session_id)?.color ?? TRAIL_COLORS[i % TRAIL_COLORS.length]} textColor="#FFFFFF" />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                  {r.display_name} {r.user_id === session?.user.id ? <Text style={{ color: colors.muted, fontWeight: '500' }}>(vos)</Text> : null}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Salió {fmtTime(r.started_at)} · {fmtMinutes((Date.now() - new Date(r.started_at).getTime()) / 60000)} · {r.contacts} contactos · {r.presentations} evangelio · {r.promises} promesas
                </Text>
              </View>
              {r.lat != null && r.lng != null ? (
                <Pressable onPress={() => setFocus({ lat: r.lat as number, lng: r.lng as number })} accessibilityRole="button" accessibilityLabel={`Ver a ${r.display_name} en el mapa`} style={styles.iconBtn}>
                  <Feather name="crosshair" size={20} color={colors.green} />
                </Pressable>
              ) : null}
            </Card>
          ))
        ) : (
          <Empty icon="users" title="Nadie está en salida" text="Cuando alguien toque Iniciar salida, lo ves acá en el mapa, con lo que va haciendo. No hace falta que vos inicies una salida." />
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

const TRAIL_COLORS = ['#2563EB', '#D97706', '#7C3AED', '#DB2777', '#0D9488', '#DC2626'];

const styles = themed(() => StyleSheet.create({
  map: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  allBtn: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  tablero: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.greenSoft },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
}));
