// Colectivo en vivo: el jefe de la ruta (o el chofer elegido) toca "Salimos" y los de la ruta ven el colectivo en el mapa.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MapView, Marker } from '@/components/map';
import { Header, Screen } from '@/components/Screen';
import { Button, Card } from '@/components/ui';
import { PickerModal } from '@/components/Picker';
import { listProfiles } from '@/lib/api';
import { getBusRun, startBus, stopBus } from '@/lib/busTask';
import { errorMessage, supabase } from '@/lib/supabase';
import { fmtTime } from '@/lib/format';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';

type Route = {
  group_id: string; name: string; can_drive: boolean; run_id: string | null; driver_name: string | null; mine: boolean | null;
  lat: number | null; lng: number | null; heading: number | null; started_at: string | null; updated_at: string | null;
};

function ago(iso: string | null, now: number): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'recién';
  const m = Math.round(s / 60);
  return m === 1 ? 'hace 1 minuto' : `hace ${m} minutos`;
}

export default function ColectivoVivo() {
  const { isStaff } = useAuth();
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [drivers, setDrivers] = useState<Record<string, { id: string; name: string }[]>>({});
  const [picking, setPicking] = useState<Route | null>(null);
  const [people, setPeople] = useState<{ id: string; title: string }[]>([]);

  const load = useCallback(() => {
    supabase.rpc('bus_live_routes').then(({ data }) => setRoutes((data ?? []) as Route[]));
    supabase.from('bus_route_drivers').select('group_id, profile_id, profiles:profile_id(display_name)').then(({ data }) => {
      const map: Record<string, { id: string; name: string }[]> = {};
      for (const r of (data ?? []) as unknown as { group_id: string; profile_id: string; profiles: { display_name: string } | null }[]) {
        (map[r.group_id] ??= []).push({ id: r.profile_id, name: r.profiles?.display_name ?? 'Alguien' });
      }
      setDrivers(map);
    });
  }, []);

  useEffect(() => {
    load();
    const a = setInterval(load, 10000); // el colectivo se mueve: se actualiza cada 10 segundos
    const b = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);
  useRefreshOnResume(load);

  // Si este teléfono tenía el colectivo prendido pero la salida ya se cerró en otro lado, se apaga.
  useEffect(() => {
    if (!routes) return;
    getBusRun().then((run) => {
      if (run && !routes.some((r) => r.run_id === run.runId)) stopBus(run.runId).catch(() => undefined);
    });
  }, [routes]);

  const start = (r: Route) => {
    Alert.alert(`Salimos con el colectivo de ${r.name}`, 'Les llega un aviso a los de la ruta y ven el colectivo en el mapa hasta que toques "Llegamos". Dejá el teléfono con batería.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salimos',
        onPress: async () => {
          setBusy(r.group_id);
          try { await startBus(r.group_id, r.name); load(); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); } finally { setBusy(null); }
        },
      },
    ]);
  };

  const stop = (r: Route) => {
    Alert.alert('¿Llegaron?', 'Se deja de mostrar el colectivo en el mapa.', [
      { text: 'Seguir', style: 'cancel' },
      {
        text: 'Llegamos',
        onPress: async () => {
          setBusy(r.group_id);
          try { await stopBus(r.run_id); load(); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); } finally { setBusy(null); }
        },
      },
    ]);
  };

  const openMaps = (r: Route) => {
    if (r.lat == null || r.lng == null) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`).catch(() => undefined);
  };

  const saveDrivers = async (r: Route, ids: string[]) => {
    const { error } = await supabase.rpc('set_bus_drivers', { p_group: r.group_id, p_profiles: ids });
    if (error) Alert.alert('No se pudo', errorMessage(error));
    load();
  };

  const openPicker = (r: Route) => {
    setPicking(r);
    if (!people.length) listProfiles().then((ps) => setPeople(ps.filter((p) => !p.disabled_at).map((p) => ({ id: p.id, title: p.display_name })))).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Colectivo en vivo" subtitle="Dónde está el colectivo de tu ruta" back />
      <Screen>
        {routes === null ? null : !routes.length ? (
          <Card style={{ gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Todavía no estás en una ruta</Text>
            <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>Pedile al jefe de tu colectivo que te agregue a la ruta. Así vas a ver el colectivo cuando salga a buscarte.</Text>
          </Card>
        ) : routes.map((r) => {
          const live = !!r.run_id;
          const ownerCanEdit = isStaff;
          const list = drivers[r.group_id] ?? [];
          return (
            <Card key={r.group_id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.busIcon, live && { backgroundColor: colors.green }]}>
                  <Feather name="truck" size={20} color={live ? '#FFF' : colors.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                  <Text style={{ fontSize: 13, color: live ? colors.greenText : colors.muted, fontWeight: live ? '700' : '500' }}>
                    {live ? `En camino desde las ${fmtTime(r.started_at as string)} · ${r.driver_name ?? ''}` : 'El colectivo no salió todavía'}
                  </Text>
                </View>
              </View>
              {live && r.lat != null && r.lng != null ? (
                <>
                  <View style={styles.mapBox}>
                    <MapView style={{ flex: 1 }}
                      region={{ latitude: r.lat, longitude: r.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
                      showsUserLocation>
                      <Marker coordinate={{ latitude: r.lat, longitude: r.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                        <View style={styles.busPin}><Feather name="truck" size={18} color="#FFF" /></View>
                      </Marker>
                    </MapView>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Ubicación {ago(r.updated_at, now)} · se actualiza sola</Text>
                  <Button title="Ver en Google Maps" icon="external-link" variant="ghost" small onPress={() => openMaps(r)} />
                </>
              ) : live ? (
                <Text style={{ fontSize: 13, color: colors.muted }}>Esperando la ubicación del colectivo…</Text>
              ) : null}
              {r.can_drive && Platform.OS !== 'web' ? (
                live && r.mine ? (
                  <Button title="Llegamos" icon="square" variant="danger" onPress={() => stop(r)} loading={busy === r.group_id} />
                ) : live ? (
                  <Button title="Terminar la salida del colectivo" variant="ghost" small onPress={() => stop(r)} loading={busy === r.group_id} />
                ) : (
                  <Button title="Salimos" icon="play" onPress={() => start(r)} loading={busy === r.group_id} />
                )
              ) : null}
              {ownerCanEdit ? (
                <View style={{ gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>QUIÉNES PUEDEN PRENDERLO (ADEMÁS DEL JEFE DE LA RUTA)</Text>
                  {list.length ? list.map((d) => (
                    <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{d.name}</Text>
                      <Text onPress={() => saveDrivers(r, list.filter((x) => x.id !== d.id).map((x) => x.id))} style={{ fontSize: 13, fontWeight: '700', color: colors.red }}>Quitar</Text>
                    </View>
                  )) : <Text style={{ fontSize: 13, color: colors.muted }}>Nadie más por ahora.</Text>}
                  <Text onPress={() => openPicker(r)} style={{ fontSize: 14, fontWeight: '800', color: colors.green }}>+ Agregar a un obrero</Text>
                </View>
              ) : null}
            </Card>
          );
        })}
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>
          La ubicación del colectivo se comparte solo mientras está en camino. Se apaga al tocar "Llegamos" o sola si el teléfono deja de mandarla.
        </Text>
      </Screen>
      <PickerModal visible={!!picking} title="¿Quién puede prender el colectivo?" items={people}
        onClose={() => setPicking(null)}
        onPick={(id) => {
          const r = picking;
          setPicking(null);
          if (r && id) saveDrivers(r, [...(drivers[r.group_id] ?? []).map((d) => d.id), id]);
        }} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  busIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  mapBox: { height: 240, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  busPin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.amber, borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 4 },
}));
