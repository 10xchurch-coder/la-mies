// Ubicación en familia: cada uno decide si comparte dónde está y con quién (como un "círculo").
// Viene apagado. Nadie lo prende por otro, y solo ven mi posición las personas que yo elegí.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Circle, MapView, Marker, Polyline } from '@/components/map';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading, SectionTitle, Tag, Toggle } from '@/components/ui';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { agoText, batteryText, isPaused, isStale, pauseUntil, regionFor, sharingLine, type PauseKind } from '@/lib/famLoc';
import {
  churchPeople, locHelp, locHelpClear, locPause, locPlaceArchive, locPlaceSave, locSet, locTrail, locViewerAdd, locViewerRemove, locVisible,
  type LocPerson,
} from '@/lib/famLocApi';
import { canBackground, hereNow, refreshFamLoc, startDevice, stopDevice, useFamLoc } from '@/lib/famLocTask';
import { errorMessage } from '@/lib/supabase';
import { fmtTime } from '@/lib/format';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';

const VIA_LABEL = { familia: 'Familia', pastor: 'Pastor', persona: 'Elegido por vos' } as const;
const PLACE_NAMES = ['Casa', 'Iglesia', 'Trabajo', 'Escuela', 'Otro'] as const;
type PlaceName = (typeof PLACE_NAMES)[number];
const RADII = [{ value: '100', label: 'Chico (100 m)' }, { value: '200', label: 'Mediano (200 m)' }, { value: '500', label: 'Grande (500 m)' }];
// Posadas: solo para que el mapa no arranque en el medio del mar cuando todavía no hay nadie.
const START = { latitude: -27.3671, longitude: -55.8961, latitudeDelta: 0.08, longitudeDelta: 0.08 };

function openDirections(lat: number, lng: number) {
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => undefined));
}

export default function FamiliaUbicacion() {
  const { profile } = useAuth();
  const { ayuda } = useLocalSearchParams<{ ayuda?: string }>();
  const { me, mode, loaded } = useFamLoc();
  const [people, setPeople] = useState<LocPerson[] | null>(null);
  const [selected, setSelected] = useState<string | null>(ayuda ?? null);
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [family, setFamily] = useState(true);
  const [pastors, setPastors] = useState(false);
  const [picking, setPicking] = useState(false);
  const [church, setChurch] = useState<{ id: string; title: string }[]>([]);
  // Lugar nuevo
  const [draft, setDraft] = useState<{ name: PlaceName; other: string; radius: string; pos: { lat: number; lng: number } | null } | null>(null);

  const load = useCallback(() => {
    refreshFamLoc().catch(() => undefined);
    locVisible().then(setPeople).catch(() => setPeople((p) => p ?? []));
  }, []);

  useEffect(() => {
    load();
    const a = setInterval(load, 30_000); // la gente se mueve: se actualiza sola cada medio minuto
    const b = setInterval(() => setNow(Date.now()), 20_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);
  useRefreshOnResume(load);

  useEffect(() => { if (ayuda) setSelected(ayuda); }, [ayuda]);
  useEffect(() => {
    setTrail([]);
    if (selected) locTrail(selected).then(setTrail).catch(() => undefined);
  }, [selected]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); } finally { setBusy(null); load(); }
  };

  const located = useMemo(() => (people ?? []).filter((p) => p.lat != null && p.lng != null), [people]);
  const person = (people ?? []).find((p) => p.profile_id === selected) ?? null;
  // El mapa se acomoda solo al abrir, al elegir a alguien y al marcar un lugar; después no se mueve solo (así se puede recorrer).
  const [region, setRegion] = useState<typeof START | null>(null);
  const ready = loaded && people !== null;
  useEffect(() => {
    if (!ready || region) return;
    const pts = located.map((p) => ({ lat: p.lat as number, lng: p.lng as number }));
    if (me?.enabled && me.lat != null && me.lng != null) pts.push({ lat: me.lat, lng: me.lng });
    setRegion(regionFor(pts) ?? START);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  const pLat = person?.lat ?? null, pLng = person?.lng ?? null;
  useEffect(() => {
    if (selected && pLat != null && pLng != null) setRegion({ latitude: pLat, longitude: pLng, latitudeDelta: 0.012, longitudeDelta: 0.012 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, pLat == null]);
  const dLat = draft?.pos?.lat ?? null, dLng = draft?.pos?.lng ?? null;
  useEffect(() => {
    if (dLat != null && dLng != null) setRegion({ latitude: dLat, longitude: dLng, latitudeDelta: 0.012, longitudeDelta: 0.012 });
  }, [dLat, dLng]);

  if (!loaded || !me || people === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Ubicación en familia" back />
        <Loading />
      </View>
    );
  }

  const paused = isPaused(me.paused_until, now);
  const n = me.viewers.length;

  // --- Prender, pausar, apagar ---
  const turnOn = () => run('on', async () => {
    await locSet(true, family, pastors);
    try {
      await startDevice();
    } catch (e) {
      // Sin permiso en este aparato: queda prendido en la cuenta, pero este aparato no manda nada.
      Alert.alert('Falta el permiso de ubicación', `${errorMessage(e)} Hasta que lo des, nadie va a ver dónde estás.`);
    }
  });
  const turnOff = () => {
    Alert.alert('¿Dejar de compartir?', 'Nadie va a ver más dónde estás, y se borra tu última ubicación.', [
      { text: 'Seguir compartiendo', style: 'cancel' },
      { text: 'Dejar de compartir', style: 'destructive', onPress: () => run('off', async () => { await locSet(false, me.share_family, me.share_pastors); await stopDevice(); }) },
    ]);
  };
  const pause = (kind: PauseKind) => run(`pausa-${kind}`, () => locPause(pauseUntil(kind)));
  const resume = () => run('volver', () => locPause(null));
  const setGroups = (f: boolean, p: boolean) => run('grupos', () => locSet(true, f, p));

  const help = () => {
    Alert.alert('¿Pedir ayuda?', `Les llega un aviso con tu ubicación de ahora a ${n === 1 ? 'la persona que te ve' : `las ${n} personas que te ven`}.${paused ? ' Se saca la pausa.' : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Pedir ayuda', style: 'destructive', onPress: () => run('ayuda', async () => {
        const pos = await hereNow();
        const sent = await locHelp(pos);
        Alert.alert('Aviso enviado', `Le avisamos a ${sent === 1 ? '1 persona' : `${sent} personas`}.${pos ? '' : ' No pudimos tomar tu ubicación de ahora: ven la última que mandaste.'}`);
      }) },
    ]);
  };

  // --- Quién me ve ---
  const openPicker = () => {
    setPicking(true);
    if (!church.length) churchPeople().then((ps) => setChurch(ps.filter((p) => p.id !== profile?.id).map((p) => ({ id: p.id, title: p.name })))).catch(() => undefined);
  };
  const removeViewer = (id: string, name: string) => {
    Alert.alert(`¿Sacar a ${name.split(' ')[0]}?`, 'Deja de ver dónde estás en este momento. No le llega ningún aviso.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sacar', style: 'destructive', onPress: () => run(`quitar-${id}`, () => locViewerRemove(id)) },
    ]);
  };

  // --- Lugares ---
  const startDraft = () => setDraft({ name: me.places.some((p) => p.name === 'Casa') ? 'Iglesia' : 'Casa', other: '', radius: '200', pos: null });
  const useHere = () => run('aca', async () => {
    const pos = await hereNow();
    if (!pos) throw new Error('No pudimos saber dónde estás. Revisá el permiso de ubicación, o tocá el lugar en el mapa.');
    setDraft((d) => (d ? { ...d, pos } : d));
  });
  const savePlace = () => {
    if (!draft) return;
    const name = draft.name === 'Otro' ? draft.other.trim() : draft.name;
    if (!name) { Alert.alert('Falta el nombre', 'Escribí cómo se llama el lugar.'); return; }
    if (!draft.pos) { Alert.alert('Falta el lugar', 'Tocá "Estoy acá ahora" o tocá el lugar en el mapa.'); return; }
    const pos = draft.pos;
    run('lugar', async () => { await locPlaceSave({ name, lat: pos.lat, lng: pos.lng, radius: Number(draft.radius) }); setDraft(null); });
  };

  const viewerIds = new Set(me.viewers.map((v) => v.id));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ubicación en familia" subtitle="Vos elegís quién te ve" back />
      <Screen>
        {!me.available ? (
          <Empty icon="map-pin" title="Tu iglesia no usa esta función" />
        ) : !me.enabled ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.title}>Compartí dónde estás con tu familia</Text>
            <Text style={styles.text}>
              Está apagado. Si lo prendés, las personas que vos elijas ven dónde estás en el mapa. Nadie más lo ve, ni el pastor, si vos no lo elegís. Lo podés pausar o apagar cuando quieras.
            </Text>
            <Toggle label="Mi familia" value={family && me.family_count > 0} disabled={me.family_count === 0} onChange={setFamily}
              hint={me.family_count === 0 ? 'Todavía no hay nadie de tu familia con cuenta en la app. Pedí en la iglesia que carguen tu familia.' : me.family_count === 1 ? '1 familiar con cuenta en la app.' : `${me.family_count} familiares con cuenta en la app.`} />
            <Toggle label="Los pastores" value={pastors && me.pastor_count > 0} disabled={me.pastor_count === 0} onChange={setPastors}
              hint="Solo si vos querés. Viene sin marcar." />
            <Text style={styles.small}>Después podés sumar a otras personas de la iglesia por su nombre, y sacar a cualquiera.</Text>
            <Button title="Compartir mi ubicación" icon="map-pin" onPress={turnOn} loading={busy === 'on'} />
            <Text style={styles.small}>
              {canBackground
                ? 'Funciona también con la app cerrada. Gasta poca batería: manda un punto cada tanto, no todo el tiempo.'
                : 'Por ahora tu ubicación se manda solo mientras tenés la app abierta. Con la próxima versión de la app se va a poder compartir también con el teléfono guardado.'}
            </Text>
          </Card>
        ) : (
          <Card style={[{ gap: 10 }, paused ? { borderColor: colors.border } : { borderColor: colors.violet, borderWidth: 2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.dot, { backgroundColor: paused ? colors.muted : colors.violet }]}>
                <Feather name={paused ? 'pause' : 'map-pin'} size={18} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{paused ? `En pausa hasta las ${fmtTime(me.paused_until as string)}` : sharingLine(n)}</Text>
                <Text style={styles.small}>
                  {paused ? 'Ahora nadie ve dónde estás.' : mode === 'no' ? 'Este aparato no está mandando tu ubicación.' : me.located_at ? `Última vez que se mandó: ${agoText(me.located_at, now)}.` : 'Esperando la primera ubicación…'}
                </Text>
              </View>
            </View>
            {mode === 'no' ? (
              <Button title="Mandar mi ubicación desde este aparato" icon="smartphone" variant="outline" small loading={busy === 'aparato'}
                onPress={() => run('aparato', () => startDevice())} />
            ) : (
              <Text style={styles.small}>
                {mode === 'fondo'
                  ? 'Se manda también con la app cerrada.'
                  : canBackground
                    ? 'Se manda solo con la app abierta. Para que ande con la app cerrada, en los Ajustes del teléfono poné la ubicación de La Mies en "Siempre" o "Permitir todo el tiempo".'
                    : 'Por ahora se manda solo con la app abierta. Con la próxima versión de la app va a andar también con el teléfono guardado.'}
              </Text>
            )}
            {paused ? (
              <Button title="Volver a compartir" icon="play" onPress={resume} loading={busy === 'volver'} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Pausar 1 hora" icon="pause" variant="outline" small style={{ flex: 1 }} onPress={() => pause('hora')} loading={busy === 'pausa-hora'} />
                <Button title="Hasta mañana" icon="moon" variant="outline" small style={{ flex: 1 }} onPress={() => pause('manana')} loading={busy === 'pausa-manana'} />
              </View>
            )}
            <Button title="Dejar de compartir" icon="square" variant="danger" small onPress={turnOff} loading={busy === 'off'} />
          </Card>
        )}

        {me.available && me.enabled && n > 0 ? (
          me.help_at ? (
            <Card style={{ gap: 8, backgroundColor: colors.redSoft, borderColor: colors.red }}>
              <Text style={[styles.title, { color: colors.red }]}>Pediste ayuda a las {fmtTime(me.help_at)}</Text>
              <Button title="Ya estoy bien" icon="check" variant="outline" small onPress={() => run('bien', () => locHelpClear())} loading={busy === 'bien'} />
            </Card>
          ) : (
            <Button title="Pedir ayuda" icon="alert-triangle" variant="danger" onPress={help} loading={busy === 'ayuda'} />
          )
        ) : null}

        {me.available ? (
          <>
            <SectionTitle>Dónde están</SectionTitle>
            <View style={styles.mapBox}>
              <MapView style={{ flex: 1 }} region={region ?? START} showsUserLocation
                onPress={draft ? (e) => { const c = e.nativeEvent.coordinate; setDraft((d) => (d ? { ...d, pos: { lat: c.latitude, lng: c.longitude } } : d)); } : undefined}>
                {me.places.map((p) => (
                  <Circle key={p.id} center={{ latitude: p.lat, longitude: p.lng }} radius={p.radius_m} strokeColor={colors.violet} fillColor="rgba(109,75,195,0.12)" strokeWidth={1} />
                ))}
                {draft?.pos ? (
                  <Circle center={{ latitude: draft.pos.lat, longitude: draft.pos.lng }} radius={Number(draft.radius)} strokeColor={colors.amber} fillColor="rgba(184,92,0,0.18)" strokeWidth={2} />
                ) : null}
                {draft?.pos ? <Marker coordinate={{ latitude: draft.pos.lat, longitude: draft.pos.lng }} pinColor={colors.amber} /> : null}
                {trail.length > 1 ? <Polyline coordinates={trail} strokeColor={colors.violet} strokeWidth={4} lineCap="round" lineJoin="round" /> : null}
                {located.map((p) => (
                  <Marker key={p.profile_id} coordinate={{ latitude: p.lat as number, longitude: p.lng as number }} anchor={{ x: 0.5, y: 0.5 }}
                    zIndex={p.profile_id === selected ? 50 : p.help_at ? 40 : 10} onPress={() => setSelected(p.profile_id)}>
                    <View style={{ alignItems: 'center' }} accessibilityLabel={`${p.name}, ${agoText(p.located_at, now)}`}>
                      <View style={{ opacity: isStale(p.located_at, now) && !p.help_at ? 0.6 : 1 }}>
                        <Face name={p.name} path={p.photo_path} size={42} ring={p.help_at ? colors.red : p.profile_id === selected ? colors.violet : '#FFFFFF'} />
                      </View>
                      <View style={styles.nameTag}><Text style={styles.nameTagText} numberOfLines={1}>{p.name.split(' ')[0]}</Text></View>
                    </View>
                  </Marker>
                ))}
              </MapView>
            </View>

            {person ? (
              <Card style={[{ gap: 8 }, person.help_at ? { borderColor: colors.red, borderWidth: 2 } : null]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Face name={person.name} path={person.photo_path} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{person.name}</Text>
                    <Text style={styles.small}>
                      {person.lat == null ? 'Todavía no mandó su ubicación.' : [
                        `Última vez: ${agoText(person.located_at, now)}`,
                        person.place ? `en ${person.place}` : null,
                        isStale(person.located_at, now) ? null : person.moving ? 'en movimiento' : 'quieto',
                        batteryText(person.battery),
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pressable onPress={() => setSelected(null)} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={10}><Feather name="x" size={20} color={colors.muted} /></Pressable>
                </View>
                {person.help_at ? <Text style={{ fontSize: 15, fontWeight: '800', color: colors.red }}>Pidió ayuda a las {fmtTime(person.help_at)}</Text> : null}
                {person.lat != null && person.lng != null ? (
                  <Button title="Cómo llegar" icon="navigation" onPress={() => openDirections(person.lat as number, person.lng as number)} />
                ) : null}
                {trail.length > 1 ? <Text style={styles.small}>La línea violeta es por donde anduvo en las últimas 24 horas.</Text> : null}
              </Card>
            ) : null}

            {people.length ? (
              <Card style={{ gap: 2 }}>
                {people.map((p) => (
                  <Pressable key={p.profile_id} onPress={() => setSelected(p.profile_id)} accessibilityRole="button" style={styles.row}>
                    <Face name={p.name} path={p.photo_path} size={40} ring={p.help_at ? colors.red : undefined} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{p.name}</Text>
                      <Text style={styles.small}>
                        {p.help_at ? 'Pidió ayuda · ' : ''}{p.lat == null ? 'Todavía no mandó su ubicación' : [agoText(p.located_at, now), p.place ? `en ${p.place}` : null, batteryText(p.battery)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </Card>
            ) : (
              <Empty icon="users" title="Todavía nadie comparte su ubicación con vos" text="Cuando alguien te elija, lo vas a ver acá y en el mapa." />
            )}
          </>
        ) : null}

        {me.available && me.enabled ? (
          <>
            <SectionTitle>Quién me ve</SectionTitle>
            <Card style={{ gap: 4 }}>
              {me.viewers.length ? me.viewers.map((v) => (
                <View key={v.id} style={styles.row}>
                  <Face name={v.name} path={v.photo_path} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{v.name}</Text>
                    <Text style={styles.small}>{VIA_LABEL[v.via]}</Text>
                  </View>
                  <Pressable onPress={() => removeViewer(v.id, v.name)} accessibilityRole="button" accessibilityLabel={`Sacar a ${v.name}`} hitSlop={8}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.red }}>Sacar</Text>
                  </Pressable>
                </View>
              )) : <Text style={styles.text}>Todavía nadie. Elegí abajo con quién compartir.</Text>}
              <View style={styles.sep} />
              <Toggle label="Mi familia" value={me.share_family} disabled={busy === 'grupos' || me.family_count === 0} onChange={(v) => setGroups(v, me.share_pastors)}
                hint={me.family_count === 0 ? 'Todavía no hay nadie de tu familia con cuenta en la app.' : 'Tus familiares que tienen cuenta en la app.'} />
              <Toggle label="Los pastores" value={me.share_pastors} disabled={busy === 'grupos' || me.pastor_count === 0} onChange={(v) => setGroups(me.share_family, v)} />
              {me.family_left.filter((f) => !viewerIds.has(f.id)).map((f) => (
                <View key={f.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{f.name}</Text>
                    <Text style={styles.small}>Es de tu familia y ahora no te ve.</Text>
                  </View>
                  <Pressable onPress={() => run(`sumar-${f.id}`, () => locViewerAdd(f.id))} accessibilityRole="button" hitSlop={8}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green }}>Sumar</Text>
                  </Pressable>
                </View>
              ))}
              <Button title="Agregar a una persona" icon="user-plus" variant="ghost" small onPress={openPicker} />
            </Card>

            <SectionTitle>Mis lugares</SectionTitle>
            <Card style={{ gap: 6 }}>
              <Text style={styles.small}>Cuando llegás o salís de uno de tus lugares, les llega un aviso a las personas que te ven.</Text>
              {me.places.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Feather name="map-pin" size={18} color={colors.violet} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{p.name}</Text>
                    <Text style={styles.small}>{p.radius_m} metros alrededor{p.inside ? ' · estás acá' : ''}</Text>
                  </View>
                  <Pressable onPress={() => run(`lugar-${p.id}`, () => locPlaceArchive(p.id))} accessibilityRole="button" accessibilityLabel={`Sacar ${p.name}`} hitSlop={8}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.red }}>Sacar</Text>
                  </Pressable>
                </View>
              ))}
              {draft ? (
                <View style={{ gap: 10, paddingTop: 6 }}>
                  <Choice options={PLACE_NAMES.map((x) => ({ value: x, label: x }))} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
                  {draft.name === 'Otro' ? <Field label="Nombre del lugar" value={draft.other} onChangeText={(other) => setDraft({ ...draft, other })} maxLength={40} placeholder="Casa de los abuelos" /> : null}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Button title="Estoy acá ahora" icon="crosshair" variant="outline" small onPress={useHere} loading={busy === 'aca'} />
                    {draft.name === 'Casa' && me.home ? (
                      <Button title="Usar la dirección de mi casa" icon="home" variant="outline" small onPress={() => setDraft({ ...draft, pos: me.home })} />
                    ) : null}
                  </View>
                  <Text style={styles.small}>{draft.pos ? 'Listo: mirá el círculo naranja en el mapa. Si no está bien, tocá el lugar en el mapa.' : 'O tocá el lugar en el mapa de arriba.'}</Text>
                  <Choice options={RADII} value={draft.radius} onChange={(radius) => setDraft({ ...draft, radius })} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Cancelar" variant="ghost" small style={{ flex: 1 }} onPress={() => setDraft(null)} />
                    <Button title="Guardar lugar" icon="check" small style={{ flex: 1 }} onPress={savePlace} loading={busy === 'lugar'} />
                  </View>
                </View>
              ) : (
                <Button title="Agregar un lugar" icon="plus" variant="ghost" small onPress={startDraft} />
              )}
            </Card>
          </>
        ) : null}

        {me.available ? (
          <View style={{ gap: 6 }}>
            <Tag text="Tu ubicación es tuya" tone="gray" />
            <Text style={styles.small}>
              Solo se guarda tu última ubicación y el camino de las últimas 24 horas. Solo lo ven las personas de tu lista. Nadie puede prenderlo por vos. En pausa no se guarda nada, y al apagarlo se borra. Los chicos sin cuenta no se siguen: cada uno comparte su propio teléfono.
            </Text>
          </View>
        ) : null}
      </Screen>

      <PickerModal visible={picking} title="¿Con quién querés compartir?" items={church.filter((c) => !viewerIds.has(c.id))}
        onClose={() => setPicking(false)}
        onPick={(id) => { setPicking(false); if (id) run(`sumar-${id}`, () => locViewerAdd(id)); }} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  small: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mapBox: { height: 340, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.text },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 6 },
  nameTag: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9DDD7', maxWidth: 90 },
  nameTagText: { fontSize: 11, fontWeight: '800', color: '#1F2A24' },
}));
