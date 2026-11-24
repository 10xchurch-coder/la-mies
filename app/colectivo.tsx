// El colectivo: los pasajeros de cada ruta, quién subió hoy y un aviso por WhatsApp ("pasamos en 10 minutos").
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Button, Card, Choice, Empty, Field, Loading, SectionTitle } from '@/components/ui';
import { listGroups, routeRiders, searchPeople, setBusRider, setPicked, type RiderRow } from '@/lib/api';
import { whatsappNumber } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Group } from '@/types';
import { tx } from '@/lib/i18n';
import { IfOn } from '@/components/IfOn';

export default function Colectivo() {
  const { profile, church } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [group, setGroup] = useState<string | null>(profile?.group_id ?? null);
  const [rows, setRows] = useState<RiderRow[] | null>(null);
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState<{ id: string; name: string; photo_path: string | null }[]>([]);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { listGroups().then((g) => { setGroups(g); if (!group && g[0]) setGroup(g[0].id); }).catch(() => undefined); }, [group]);
  const load = useCallback(() => { if (group) routeRiders(group).then(setRows).catch(() => setRows([])); }, [group]);
  useFocusEffect(load);
  useEffect(load, [load]);

  const toggle = async (r: RiderRow) => {
    if (!group) return;
    setRows((rs) => (rs ?? []).map((x) => (x.contact_id === r.contact_id ? { ...x, picked: !x.picked } : x)));
    try { await setPicked(r.contact_id, group, !r.picked); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); load(); }
  };
  const notify = (r: RiderRow, mins: number) => {
    if (!r.phone) return;
    const msg = tx('Hola {split}, el colectivo de la {name} pasa por tu casa en {mins} minutos. ¡Te esperamos!', { split: r.name.split(' ')[0], name: church?.name ?? 'iglesia', mins });
    Linking.openURL(`https://wa.me/${whatsappNumber(r.phone)}?text=${encodeURIComponent(msg)}`);
  };
  const onQ = (v: string) => {
    setQ(v);
    if (t.current) clearTimeout(t.current);
    if (v.trim().length < 2) { setSugg([]); return; }
    t.current = setTimeout(() => searchPeople(v.trim()).then((r) => setSugg(r.slice(0, 6))).catch(() => setSugg([])), 250);
  };
  const add = async (id: string) => {
    try { await setBusRider(id, true); setQ(''); setSugg([]); load(); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); }
  };

  const picked = (rows ?? []).filter((r) => r.picked).length;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Colectivo')} subtitle={rows ? tx('{picked} de {n} subieron hoy', { picked, n: rows.length }) : undefined} back />
      <Screen>
        {groups.length > 1 ? <Choice columns={2} options={groups.map((g) => ({ value: g.id, label: g.name }))} value={group ?? ''} onChange={setGroup} /> : null}
        {group ? (
          <IfOn feature="colectivo_paradas"><Button title={tx('Paradas en orden y mapa')} icon="map-pin" variant="outline" small
            onPress={() => router.push({ pathname: '/colectivo-paradas', params: { ruta: group } } as unknown as Href)} /></IfOn>
        ) : null}
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="truck" title={tx('No hay pasajeros en esta ruta')} text={tx('Agregá abajo a los que viajan en el colectivo. También aparecen los que prometieron venir y pidieron que los busquen.')} /> : (
          <Card style={{ padding: 0 }}>
            {rows.map((r, i) => (
              <View key={r.contact_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Pressable onPress={() => toggle(r)} accessibilityRole="checkbox" accessibilityState={{ checked: r.picked }}
                  style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: r.picked ? colors.green : colors.input, backgroundColor: r.picked ? colors.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {r.picked ? <Feather name="check" size={18} color="#FFF" /> : null}
                </Pressable>
                <Face name={r.name} path={r.photo_path} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{[r.pickup_time, r.address].filter(Boolean).join(' · ') || tx('Sin dirección')}</Text>
                </View>
                {r.phone ? (
                  <Pressable onPress={() => notify(r, 10)} accessibilityRole="button" accessibilityLabel={tx('Avisar a {name}', { name: r.name })} style={{ paddingHorizontal: 10, height: 34, borderRadius: 17, backgroundColor: colors.greenSoft, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="message-circle" size={14} color={colors.green} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.green }}>{tx('10 min')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Card>
        )}
        <SectionTitle>{tx('Agregar un pasajero')}</SectionTitle>
        <Field label={tx('Nombre')} value={q} onChangeText={onQ} placeholder={tx('Buscar por nombre')} autoCapitalize="words" />
        {sugg.map((p) => (
          <Pressable key={p.id} onPress={() => add(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <Face name={p.name} path={p.photo_path} size={30} />
            <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{p.name}</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.green }}>{tx('Agregar')}</Text>
          </Pressable>
        ))}
        <Text style={{ fontSize: 12, color: colors.muted }}>{tx('El pasajero tiene que estar en esta ruta (en su ficha). El aviso por WhatsApp sale desde tu teléfono. El aviso de 10 minutos a la app sale solo: armalo en “Paradas en orden y mapa”.')}</Text>
      </Screen>
    </View>
  );
}
