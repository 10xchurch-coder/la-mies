// Paradas del colectivo: a quién pasa a buscar cada ruta, en orden, con el mapa.
// Cada parada es una persona o una familia (grandes o chicos). Cuando el colectivo está en camino,
// la base le avisa sola a cada parada cuando faltan unos 10 minutos (una vez por viaje).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { MapView, Marker, Polyline, mapAvailable } from '@/components/map';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Button, Card, Choice, Empty, Field, Loading, SectionTitle, Tag } from '@/components/ui';
import {
  addBusStop, busStops, busStopsSkipped, listGroups, removeBusStop, reorderBusStops, routeRiders, searchHouseholds, searchPeople,
  setBusStopPlace, skipBusStop, type BusStopRow, type HouseholdHit, type RiderRow,
} from '@/lib/api';
import { NOTICE_MINUTES, etaLabel, moveStop, orderStops, regionForPoints, routeEtas } from '@/lib/busStops';
import { currentPlace } from '@/lib/chatLive';
import { errorMessage, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { Group } from '@/types';

// Si la ruta todavía no tiene ningún lugar marcado, el mapa arranca en Posadas.
const START = { latitude: -27.3671, longitude: -55.896, latitudeDelta: 0.06, longitudeDelta: 0.06 };

type Live = { run_id: string | null; lat: number | null; lng: number | null };

export default function ColectivoParadas() {
  const { ruta } = useLocalSearchParams<{ ruta?: string }>();
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [group, setGroup] = useState<string | null>(ruta ?? profile?.group_id ?? null);
  const [stops, setStops] = useState<BusStopRow[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string; photo_path: string | null }[]>([]);
  const [families, setFamilies] = useState<HouseholdHit[]>([]);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listGroups().then((g) => { setGroups(g); setGroup((cur) => cur ?? g[0]?.id ?? null); }).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    if (!group) return;
    busStops(group).then((s) => setStops(orderStops(s))).catch(() => setStops([]));
    busStopsSkipped(group).then(setSkipped).catch(() => undefined);
    routeRiders(group).then(setRiders).catch(() => setRiders([]));
    supabase.rpc('can_edit_bus_route', { p_group: group }).then(({ data }) => setCanEdit(data === true));
    supabase.rpc('bus_live_routes').then(({ data }) => {
      const r = ((data ?? []) as ({ group_id: string } & Live)[]).find((x) => x.group_id === group);
      setLive(r ? { run_id: r.run_id, lat: r.lat, lng: r.lng } : null);
    });
  }, [group]);
  useFocusEffect(load);
  useEffect(() => { setStops(null); setOpen(null); setPlacing(null); load(); }, [load]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);

  // Con el colectivo en camino, la lista se actualiza sola.
  const isLive = !!live?.run_id;
  useEffect(() => {
    if (!isLive) return;
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [isLive, load]);

  const list = stops ?? [];
  const withPlace = list.filter((s) => s.lat != null && s.lng != null);
  const coords = withPlace.map((s) => ({ latitude: s.lat as number, longitude: s.lng as number }));
  const bus = isLive && live?.lat != null && live.lng != null ? { lat: live.lat, lng: live.lng } : null;

  // Los minutos que le faltan al colectivo para cada parada (la misma cuenta que usa la base para avisar).
  const etas = useMemo(() => {
    if (!bus) return new Map<string, number>();
    return routeEtas(bus, list.map((s) => ({
      id: s.id, pos: s.pos, lat: s.lat, lng: s.lng, reached: !!s.reached_at, skipped: skipped.includes(s.id), picked: s.picked, notified: !!s.notified_at,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.lat, bus?.lng, stops, skipped]);

  // El mapa se acomoda una vez por ruta, para que después se pueda mover y acercar a mano.
  const region = useMemo(
    () => regionForPoints(bus ? [...coords, { latitude: bus.lat, longitude: bus.lng }] : coords) ?? START,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, stops === null, coords.length],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); load(); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); } finally { setBusy(false); }
  };

  const move = (s: BusStopRow, dir: -1 | 1) => {
    if (!group) return;
    const ids = moveStop(list.map((x) => x.id), s.id, dir);
    // Se ve el cambio enseguida; si la base no lo acepta, se vuelve a cargar.
    setStops(ids.map((id, i) => ({ ...(list.find((x) => x.id === id) as BusStopRow), pos: i + 1 })));
    run(() => reorderBusStops(group, ids));
  };

  const toggleOpen = (s: BusStopRow) => {
    setPlacing(null);
    setOpen(open === s.id ? null : s.id);
    setAddress(s.address ?? '');
  };

  const placeHere = (s: BusStopRow) => run(async () => {
    const p = await currentPlace();
    await setBusStopPlace(s.id, p.lat, p.lng, address.trim() || null);
  });

  const onMapPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const s = list.find((x) => x.id === placing);
    if (!s) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPlacing(null);
    run(() => setBusStopPlace(s.id, latitude, longitude, address.trim() || s.address || null));
  };

  const remove = (s: BusStopRow) => {
    Alert.alert(`¿Quitar la parada de ${s.title}?`, 'Solo se quita de la lista del colectivo. Su ficha queda igual.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => { setOpen(null); run(() => removeBusStop(s.id)); } },
    ]);
  };

  const onQ = (v: string) => {
    setQ(v);
    if (t.current) clearTimeout(t.current);
    if (v.trim().length < 2) { setPeople([]); setFamilies([]); return; }
    t.current = setTimeout(() => {
      searchPeople(v.trim()).then((r) => setPeople(r.slice(0, 6))).catch(() => setPeople([]));
      searchHouseholds(v.trim()).then((r) => setFamilies(r.slice(0, 4))).catch(() => setFamilies([]));
    }, 250);
  };
  const add = (target: { contact?: string; household?: string }) => {
    if (!group) return;
    setQ(''); setPeople([]); setFamilies([]);
    run(() => addBusStop(group, target));
  };

  const inStops = new Set(list.map((s) => s.contact_id).filter(Boolean) as string[]);
  const famInStops = new Set(list.map((s) => s.household_id).filter(Boolean) as string[]);
  const ridersLeft = riders.filter((r) => !inStops.has(r.contact_id));
  const noPlace = list.length - withPlace.length;
  const routeName = groups.find((g) => g.id === group)?.name;

  const status = (s: BusStopRow): { text: string; tone: 'green' | 'blue' | 'amber' | 'gray' | 'red' } | null => {
    if (s.lat == null || s.lng == null) return { text: 'Falta marcar el lugar', tone: 'red' };
    if (!isLive) return null;
    if (skipped.includes(s.id)) return { text: 'Hoy no viene', tone: 'gray' };
    if (s.picked) return { text: 'Ya subió', tone: 'green' };
    if (s.reached_at) return { text: 'El colectivo ya pasó', tone: 'gray' };
    const eta = etas.get(s.id);
    if (s.notified_at) return { text: eta != null ? `Avisado · ${etaLabel(eta)}` : 'Avisado', tone: 'green' };
    return eta != null ? { text: etaLabel(eta), tone: 'blue' } : null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Paradas del colectivo" subtitle={stops ? `${list.length} ${list.length === 1 ? 'parada' : 'paradas'}${routeName ? ` · ${routeName}` : ''}` : undefined} back />
      <Screen>
        {groups.length > 1 ? <Choice columns={2} options={groups.map((g) => ({ value: g.id, label: g.name }))} value={group ?? ''} onChange={setGroup} /> : null}

        {stops === null ? <Loading /> : (
          <>
            {mapAvailable && (withPlace.length || placing || bus) ? (
              <View style={styles.mapBox}>
                <MapView key={`${group}-${withPlace.length ? 'con' : 'sin'}`} style={{ flex: 1 }} initialRegion={region} onPress={placing ? onMapPress : undefined}>
                  {coords.length > 1 ? <Polyline coordinates={coords} strokeColor={colors.green} strokeWidth={4} /> : null}
                  {withPlace.map((s) => (
                    <Marker key={`${s.id}-${s.pos}-${s.lat}-${s.lng}`} coordinate={{ latitude: s.lat as number, longitude: s.lng as number }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}
                      title={`${s.pos}. ${s.title}`} description={s.address ?? undefined}>
                      <View style={[styles.pin, (s.reached_at || s.picked) && isLive ? { backgroundColor: colors.gray } : null, placing === s.id ? { backgroundColor: colors.amber } : null]}>
                        <Text style={styles.pinText}>{s.pos}</Text>
                      </View>
                    </Marker>
                  ))}
                  {bus ? (
                    <Marker coordinate={{ latitude: bus.lat, longitude: bus.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={10}>
                      <View style={styles.busPin}><Feather name="truck" size={16} color="#FFF" /></View>
                    </Marker>
                  ) : null}
                </MapView>
              </View>
            ) : null}
            {placing ? (
              <Card style={{ backgroundColor: colors.amberSoft, borderColor: colors.amber, gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.amberText }}>Tocá en el mapa donde para el colectivo</Text>
                <Text style={{ fontSize: 13, color: colors.amberText }}>Mové y acercá el mapa hasta ver la casa. Después tocá justo en la puerta.</Text>
                <Button title="Cancelar" variant="ghost" small onPress={() => setPlacing(null)} />
              </Card>
            ) : withPlace.length ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Los números son el orden en que pasa el colectivo. La línea verde une las paradas{isLive ? ' y el punto naranja es el colectivo' : ''}.
              </Text>
            ) : null}

            <Card style={{ gap: 4, backgroundColor: colors.greenSoft, borderColor: colors.green }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.greenText }}>Aviso de {NOTICE_MINUTES} minutos</Text>
              <Text style={{ fontSize: 13, color: colors.greenText, lineHeight: 18 }}>
                Cuando el colectivo sale y le faltan unos {NOTICE_MINUTES} minutos para una parada, a esa persona le llega solo un aviso a la app. Es una vez por viaje. Si es un chico sin la app, les llega a los grandes de su familia.
              </Text>
              {noPlace ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.redText }}>{noPlace === 1 ? 'A 1 parada le falta' : `A ${noPlace} paradas les falta`} el lugar en el mapa: sin eso no se puede avisar.</Text> : null}
            </Card>

            {!list.length ? (
              <Empty icon="map-pin" title="Esta ruta todavía no tiene paradas" text={canEdit ? 'Agregá abajo a cada persona o familia que pasa a buscar el colectivo, en el orden del recorrido.' : 'El jefe de la ruta las carga acá.'} />
            ) : (
              <Card style={{ padding: 0 }}>
                {list.map((s, i) => {
                  const st = status(s);
                  const isOpen = open === s.id;
                  const isSkipped = skipped.includes(s.id);
                  return (
                    <View key={s.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                        <View style={styles.num}><Text style={styles.numText}>{s.pos}</Text></View>
                        <Pressable onPress={() => toggleOpen(s)} accessibilityRole="button" accessibilityLabel={`Parada ${s.pos}: ${s.title}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {s.household_id ? (
                            <View style={styles.famIcon}><Feather name="users" size={18} color={colors.amberText} /></View>
                          ) : <Face name={s.title} path={s.photo_path} size={36} />}
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }} numberOfLines={1}>{s.title}</Text>
                            <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{[s.people, s.address].filter(Boolean).join(' · ') || 'Sin dirección'}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {st ? <Tag text={st.text} tone={st.tone} /> : null}
                              {s.will_notify === 0 ? <Tag text="Nadie tiene la app" tone="amber" /> : null}
                            </View>
                          </View>
                        </Pressable>
                        {canEdit ? (
                          <View style={{ flexDirection: 'row' }}>
                            <Pressable disabled={busy || i === 0} onPress={() => move(s, -1)} accessibilityRole="button" accessibilityLabel={`Subir a ${s.title}`} style={[styles.arrow, i === 0 && { opacity: 0.25 }]}>
                              <Feather name="arrow-up" size={18} color={colors.green} />
                            </Pressable>
                            <Pressable disabled={busy || i === list.length - 1} onPress={() => move(s, 1)} accessibilityRole="button" accessibilityLabel={`Bajar a ${s.title}`} style={[styles.arrow, i === list.length - 1 && { opacity: 0.25 }]}>
                              <Feather name="arrow-down" size={18} color={colors.green} />
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                      {isOpen && canEdit ? (
                        <View style={{ gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
                          <Text style={{ fontSize: 12, color: colors.muted }}>
                            {s.lat == null ? 'Todavía no sabemos dónde para el colectivo.' : s.own_place ? 'El lugar se marcó a mano para esta parada.' : 'El lugar es el de su casa (el de su ficha).'}
                          </Text>
                          <Field label="Dirección o seña" hint="(opcional)" value={address} onChangeText={setAddress} placeholder="Calle y número, o “la casa verde de la esquina”" />
                          {mapAvailable ? <Button title="Marcar en el mapa" icon="map-pin" variant="outline" small onPress={() => setPlacing(s.id)} /> : null}
                          <Button title="Estoy en la parada: usar este lugar" icon="crosshair" variant="outline" small loading={busy} onPress={() => placeHere(s)} />
                          {s.own_place ? (
                            <>
                              <Button title="Guardar la dirección" icon="check" variant="ghost" small onPress={() => run(() => setBusStopPlace(s.id, s.lat, s.lng, address.trim() || null))} />
                              <Button title="Volver a usar el lugar de su casa" icon="home" variant="ghost" small onPress={() => run(() => setBusStopPlace(s.id, null, null, null))} />
                            </>
                          ) : null}
                          {isLive && !s.picked && (isSkipped || !s.reached_at) ? (
                            <Button title={isSkipped ? 'Sí viene: volver a esperarlo' : 'Hoy no viene: saltar esta parada'} icon={isSkipped ? 'rotate-ccw' : 'skip-forward'} variant="ghost" small
                              onPress={() => run(() => skipBusStop(s.id, !isSkipped))} />
                          ) : null}
                          <Button title="Quitar la parada" icon="trash-2" variant="danger" small onPress={() => remove(s)} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            )}

            {canEdit ? (
              <>
                <SectionTitle>Agregar una parada</SectionTitle>
                <Field label="Persona o familia" value={q} onChangeText={onQ} placeholder="Buscar por nombre o apellido" autoCapitalize="words" />
                {families.filter((f) => !famInStops.has(f.id)).map((f) => (
                  <Pressable key={f.id} onPress={() => add({ household: f.id })} accessibilityRole="button" style={styles.hit}>
                    <View style={styles.famIcon}><Feather name="users" size={16} color={colors.amberText} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{f.name}</Text>
                      {f.members ? <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{f.members}</Text> : null}
                    </View>
                    <Text style={styles.addText}>Agregar familia</Text>
                  </Pressable>
                ))}
                {people.filter((p) => !inStops.has(p.id)).map((p) => (
                  <Pressable key={p.id} onPress={() => add({ contact: p.id })} accessibilityRole="button" style={styles.hit}>
                    <Face name={p.name} path={p.photo_path} size={30} />
                    <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{p.name}</Text>
                    <Text style={styles.addText}>Agregar</Text>
                  </Pressable>
                ))}
                {ridersLeft.length && !q ? (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>Pasajeros de esta ruta que todavía no tienen parada</Text>
                    {ridersLeft.slice(0, 30).map((r) => (
                      <Pressable key={r.contact_id} onPress={() => add({ contact: r.contact_id })} accessibilityRole="button" style={styles.hit}>
                        <Face name={r.name} path={r.photo_path} size={30} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, color: colors.text }}>{r.name}</Text>
                          {r.address ? <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{r.address}</Text> : null}
                        </View>
                        <Text style={styles.addText}>Agregar</Text>
                      </Pressable>
                    ))}
                  </>
                ) : null}
                <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
                  Si varios de una casa suben juntos, agregá la familia: es una sola parada y el aviso les llega a todos los que tienen la app.
                </Text>
              </>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  mapBox: { height: 300, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  pin: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 6, backgroundColor: colors.green, borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  pinText: { fontSize: 13, fontWeight: '900', color: '#FFF' },
  busPin: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.amber, borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 13, fontWeight: '900', color: colors.greenText },
  famIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  addText: { fontSize: 13, fontWeight: '800', color: colors.green },
}));
