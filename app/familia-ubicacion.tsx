// Ubicación en familia: cada uno decide si comparte dónde está y con quién (como un "círculo").
// Viene apagado. Nadie lo prende por otro, y solo ven mi posición las personas que yo elegí.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Circle, MapView, Marker, Polyline } from '@/components/map';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading, SectionTitle, Tag, Toggle } from '@/components/ui';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { agoText, batteryText, isPaused, isStale, pauseUntil, regionFor, sharingLine, type PauseKind } from '@/lib/famLoc';
import {
  churchPeople, locFamilyAdd, locFamilyAnswer, locFamilyRemove, locHelp, locHelpClear, locPause, locPlaceArchive, locPlaceSave, locSet, locTrail, locViewerAdd, locViewerRemove, locVisible,
  type LocPerson,
} from '@/lib/famLocApi';
import { canBackground, hereNow, refreshFamLoc, startDevice, stopDevice, useFamLoc } from '@/lib/famLocTask';
import { errorMessage, supabase } from '@/lib/supabase';
import { fmtTime } from '@/lib/format';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import { tx } from '@/lib/i18n';

const VIA_LABEL = { familia: 'Familia', pastor: 'Pastor', persona: 'Elegido por vos' } as const;
const PLACE_NAMES = ['Casa', 'Iglesia', 'Trabajo', 'Escuela', 'Otro'] as const;
type PlaceName = (typeof PLACE_NAMES)[number];
const RADII = [{ value: '100', get label() { return tx('Chico (100 m)'); } }, { value: '200', get label() { return tx('Mediano (200 m)'); } }, { value: '500', get label() { return tx('Grande (500 m)'); } }];
// Posadas: solo para que el mapa no arranque en el medio del mar cuando todavía no hay nadie.
const START = { latitude: -27.3671, longitude: -55.8961, latitudeDelta: 0.08, longitudeDelta: 0.08 };

function openDirections(lat: number, lng: number) {
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => undefined));
}

export default function FamiliaUbicacion() {
  const { profile } = useAuth();
  const router = useRouter();
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
  const [pickingFam, setPickingFam] = useState(false);
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
    try { await fn(); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); } finally { setBusy(null); load(); }
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
        <Header title={tx('Ubicación en familia')} back />
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
      Alert.alert(tx('Falta el permiso de ubicación'), tx('{errorMessage} Hasta que lo des, nadie va a ver dónde estás.', { errorMessage: errorMessage(e) }));
    }
  });
  const turnOff = () => {
    Alert.alert(tx('¿Dejar de compartir?'), tx('Nadie va a ver más dónde estás, y se borra tu última ubicación.'), [
      { text: tx('Seguir compartiendo'), style: 'cancel' },
      { text: tx('Dejar de compartir'), style: 'destructive', onPress: () => run('off', async () => { await locSet(false, me.share_family, me.share_pastors); await stopDevice(); }) },
    ]);
  };
  const pause = (kind: PauseKind) => run(`pausa-${kind}`, () => locPause(pauseUntil(kind)));
  const resume = () => run('volver', () => locPause(null));
  const setGroups = (f: boolean, p: boolean) => run('grupos', () => locSet(true, f, p));

  const help = () => {
    Alert.alert(tx('¿Pedir ayuda?'), tx('Les llega un aviso con tu ubicación de ahora a {v1}.{pl}', { v1: n === 1 ? tx('la persona que te ve') : tx('las {n} personas que te ven', { n }), pl: paused ? tx(' Se saca la pausa.') : '' }), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Pedir ayuda'), style: 'destructive', onPress: () => run('ayuda', async () => {
        const pos = await hereNow();
        const sent = await locHelp(pos);
        Alert.alert(tx('Aviso enviado'), tx('Le avisamos a {v1}.{pl}', { v1: sent === 1 ? tx('1 persona') : tx('{sent} personas', { sent }), pl: pos ? '' : tx(' No pudimos tomar tu ubicación de ahora: ven la última que mandaste.') }));
      }) },
    ]);
  };

  // --- Quién me ve ---
  const loadChurch = () => {
    if (!church.length) churchPeople().then((ps) => setChurch(ps.filter((p) => p.id !== profile?.id).map((p) => ({ id: p.id, title: p.name })))).catch(() => undefined);
  };
  const openPicker = () => { setPicking(true); loadChurch(); };
  const openFamPicker = () => { setPickingFam(true); loadChurch(); };
  const addFamily = (id: string) => run(`fam-${id}`, async () => {
    const r = await locFamilyAdd(id);
    if (r === 'pedido') Alert.alert(tx('Listo'), tx('Le llegó un aviso para que acepte. Cuando acepte, queda en tu familia.'));
  });
  const removeFamily = (id: string, name: string) => {
    Alert.alert(tx('¿Sacar a {split} de tu familia?', { split: name.split(' ')[0] }), tx('Deja de estar unido a tu familia en la app.'), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Sacar'), style: 'destructive', onPress: () => run(`famx-${id}`, () => locFamilyRemove(id)) },
    ]);
  };
  const openHistory = (id: string, name: string) => router.push({ pathname: '/familia-historial', params: { id, name } } as never);
  const removeViewer = (id: string, name: string) => {
    Alert.alert(tx('¿Sacar a {split}?', { split: name.split(' ')[0] }), tx('Deja de ver dónde estás en este momento. No le llega ningún aviso.'), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Sacar'), style: 'destructive', onPress: () => run(`quitar-${id}`, () => locViewerRemove(id)) },
    ]);
  };

  // --- Lugares ---
  const startDraft = () => setDraft({ name: me.places.some((p) => p.name === 'Casa') ? 'Iglesia' : 'Casa', other: '', radius: '200', pos: null });
  const useHere = () => run('aca', async () => {
    const pos = await hereNow();
    if (!pos) throw new Error(tx('No pudimos saber dónde estás. Revisá el permiso de ubicación, o tocá el lugar en el mapa.'));
    setDraft((d) => (d ? { ...d, pos } : d));
  });
  const savePlace = () => {
    if (!draft) return;
    const name = draft.name === 'Otro' ? draft.other.trim() : draft.name;
    if (!name) { Alert.alert(tx('Falta el nombre'), tx('Escribí cómo se llama el lugar.')); return; }
    if (!draft.pos) { Alert.alert(tx('Falta el lugar'), tx('Tocá "Estoy acá ahora" o tocá el lugar en el mapa.')); return; }
    const pos = draft.pos;
    run('lugar', async () => { await locPlaceSave({ name, lat: pos.lat, lng: pos.lng, radius: Number(draft.radius) }); setDraft(null); });
  };

  const viewerIds = new Set(me.viewers.map((v) => v.id));
  const fam = me.family ?? [];
  const famIds = new Set([...fam.map((f) => f.id), ...(me.family_sent ?? []).map((f) => f.id)]);
  const familyBlock = me.available ? (
    <>
      <SectionTitle>{tx('Mi familia')}</SectionTitle>
      <Card style={{ gap: 4 }}>
        {(me.family_asks ?? []).map((a) => (
          <View key={`ask-${a.id}`} style={[styles.row, { flexWrap: 'wrap' }]}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text style={styles.rowName}>{a.name}</Text>
              <Text style={styles.small}>{tx('Te quiere sumar a su familia.')}</Text>
            </View>
            <Button title={tx('Aceptar')} small onPress={() => run(`si-${a.id}`, () => locFamilyAnswer(a.id, true))} loading={busy === `si-${a.id}`} />
            <Button title={tx('No')} small variant="ghost" onPress={() => run(`no-${a.id}`, () => locFamilyAnswer(a.id, false))} />
          </View>
        ))}
        {fam.map((f) => (
          <View key={f.id} style={styles.row}>
            <Face name={f.name} path={f.photo_path} size={36} />
            <Text style={[styles.rowName, { flex: 1 }]}>{f.name}</Text>
            <Pressable onPress={() => removeFamily(f.id, f.name)} accessibilityRole="button" accessibilityLabel={tx('Sacar a {name}', { name: f.name })} hitSlop={8}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.red }}>{tx('Sacar')}</Text>
            </Pressable>
          </View>
        ))}
        {(me.family_sent ?? []).map((f) => (
          <View key={`sent-${f.id}`} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{f.name}</Text>
              <Text style={styles.small}>{tx('Esperando que acepte.')}</Text>
            </View>
            <Pressable onPress={() => run(`famx-${f.id}`, () => locFamilyRemove(f.id))} accessibilityRole="button" hitSlop={8}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.muted }}>{tx('Cancelar')}</Text>
            </Pressable>
          </View>
        ))}
        {!fam.length && !(me.family_sent ?? []).length && !(me.family_asks ?? []).length ? (
          <Text style={styles.small}>{tx('Sumá a tu esposa, tu esposo o tus hijos que tienen cuenta en la app. Tocás su nombre y listo.')}</Text>
        ) : null}
        <Button title={tx('Sumar a alguien de mi familia')} icon="user-plus" variant="outline" small onPress={openFamPicker} />
      </Card>
    </>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Ubicación en familia')} subtitle={tx('Vos elegís quién te ve')} back />
      <Screen>
        {!me.available ? (
          <Empty icon="map-pin" title={tx('Tu iglesia no usa esta función')} />
        ) : !me.enabled ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.title}>{tx('Compartí dónde estás con tu familia')}</Text>
            <Text style={styles.text}>
              {tx('Está apagado. Si lo prendés, las personas que vos elijas ven dónde estás en el mapa. Nadie más lo ve, ni el pastor, si vos no lo elegís. Lo podés pausar o apagar cuando quieras.')}
            </Text>
            <Toggle label={tx('Mi familia')} value={family && me.family_count > 0} disabled={me.family_count === 0} onChange={setFamily}
              hint={me.family_count === 0 ? tx('Todavía no sumaste a nadie a tu familia. Hacelo abajo, en «Mi familia».') : me.family_count === 1 ? tx('1 familiar con cuenta en la app.') : tx('{family_count} familiares con cuenta en la app.', { family_count: me.family_count })} />
            <Toggle label={tx('Los pastores')} value={pastors && me.pastor_count > 0} disabled={me.pastor_count === 0} onChange={setPastors}
              hint={me.pastor_count === 0 ? tx('No hay otro pastor con cuenta en tu iglesia.') : tx('Solo si vos querés. Viene sin marcar.')} />
            <Text style={styles.small}>{tx('Después podés sumar a otras personas de la iglesia por su nombre, y sacar a cualquiera.')}</Text>
            <Button title={tx('Compartir mi ubicación')} icon="map-pin" onPress={turnOn} loading={busy === 'on'} />
            <Text style={styles.small}>
              {canBackground
                ? tx('Funciona también con la app cerrada y guarda tu recorrido de los últimos 30 días. Usa el GPS, así que gasta algo más de batería.')
                : tx('Por ahora tu ubicación se manda solo mientras tenés la app abierta. Con la próxima versión de la app se va a poder compartir también con el teléfono guardado.')}
            </Text>
          </Card>
        ) : (
          <Card style={[{ gap: 10 }, paused ? { borderColor: colors.border } : { borderColor: colors.violet, borderWidth: 2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.dot, { backgroundColor: paused ? colors.muted : colors.violet }]}>
                <Feather name={paused ? 'pause' : 'map-pin'} size={18} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{paused ? tx('En pausa hasta las {fmtTime}', { fmtTime: fmtTime(me.paused_until as string) }) : sharingLine(n)}</Text>
                <Text style={styles.small}>
                  {paused ? tx('Ahora nadie ve dónde estás.') : mode === 'no' ? tx('Este aparato no está mandando tu ubicación.') : me.located_at ? tx('Última vez que se mandó: {agoText}.', { agoText: agoText(me.located_at, now) }) : tx('Esperando la primera ubicación…')}
                </Text>
              </View>
            </View>
            {mode === 'no' ? (
              <Button title={tx('Mandar mi ubicación desde este aparato')} icon="smartphone" variant="outline" small loading={busy === 'aparato'}
                onPress={() => run('aparato', () => startDevice())} />
            ) : (
              <Text style={styles.small}>
                {mode === 'fondo'
                  ? tx('Se manda también con la app cerrada.')
                  : canBackground
                    ? tx('Se manda solo con la app abierta. Para que ande con la app cerrada, en los Ajustes del teléfono poné la ubicación de La Mies en "Siempre" o "Permitir todo el tiempo".')
                    : tx('Por ahora se manda solo con la app abierta. Con la próxima versión de la app va a andar también con el teléfono guardado.')}
              </Text>
            )}
            {paused ? (
              <Button title={tx('Volver a compartir')} icon="play" onPress={resume} loading={busy === 'volver'} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={tx('Pausar 1 hora')} icon="pause" variant="outline" small style={{ flex: 1 }} onPress={() => pause('hora')} loading={busy === 'pausa-hora'} />
                <Button title={tx('Hasta mañana')} icon="moon" variant="outline" small style={{ flex: 1 }} onPress={() => pause('manana')} loading={busy === 'pausa-manana'} />
              </View>
            )}
            {profile?.id ? <Button title={tx('Mi historial (30 días)')} icon="clock" variant="outline" small onPress={() => openHistory(profile.id, tx('Mi historial'))} /> : null}
            <Button title={tx('Dejar de compartir')} icon="square" variant="danger" small onPress={turnOff} loading={busy === 'off'} />
          </Card>
        )}

        {me.available && me.enabled && n > 0 ? (
          me.help_at ? (
            <Card style={{ gap: 8, backgroundColor: colors.redSoft, borderColor: colors.red }}>
              <Text style={[styles.title, { color: colors.red }]}>{tx('Pediste ayuda a las {fmtTime}', { fmtTime: fmtTime(me.help_at) })}</Text>
              <Button title={tx('Ya estoy bien')} icon="check" variant="outline" small onPress={() => run('bien', () => locHelpClear())} loading={busy === 'bien'} />
            </Card>
          ) : (
            <Button title={tx('Pedir ayuda')} icon="alert-triangle" variant="danger" onPress={help} loading={busy === 'ayuda'} />
          )
        ) : null}

        {familyBlock}

        {me.available ? (
          <>
            <SectionTitle>{tx('Dónde están')}</SectionTitle>
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
                      {person.lat == null ? tx('Todavía no mandó su ubicación.') : [
                        tx('Última vez: {agoText}', { agoText: agoText(person.located_at, now) }),
                        person.place ? `en ${person.place}` : null,
                        isStale(person.located_at, now) ? null : person.moving ? tx('en movimiento') : 'quieto',
                        batteryText(person.battery),
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pressable onPress={() => setSelected(null)} accessibilityRole="button" accessibilityLabel={tx('Cerrar')} hitSlop={10}><Feather name="x" size={20} color={colors.muted} /></Pressable>
                </View>
                {person.help_at ? <Text style={{ fontSize: 15, fontWeight: '800', color: colors.red }}>{tx('Pidió ayuda a las {fmtTime}', { fmtTime: fmtTime(person.help_at) })}</Text> : null}
                {person.lat != null && person.lng != null ? (
                  <Button title={tx('Cómo llegar')} icon="navigation" onPress={() => openDirections(person.lat as number, person.lng as number)} />
                ) : null}
                <Button title={tx('Ver por dónde anduvo (30 días)')} icon="clock" variant="outline" onPress={() => openHistory(person.profile_id, person.name)} />
                {trail.length > 1 ? <Text style={styles.small}>{tx('La línea violeta es por donde anduvo en las últimas 24 horas.')}</Text> : null}
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
                        {p.help_at ? tx('Pidió ayuda · ') : ''}{p.lat == null ? tx('Todavía no mandó su ubicación') : [agoText(p.located_at, now), p.place ? `en ${p.place}` : null, batteryText(p.battery)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </Card>
            ) : (
              <Empty icon="users" title={tx('Todavía nadie comparte su ubicación con vos')} text={tx('Cuando alguien te elija, lo vas a ver acá y en el mapa.')} />
            )}
          </>
        ) : null}

        {me.available && me.enabled ? (
          <>
            <SectionTitle>{tx('Quién me ve')}</SectionTitle>
            <Card style={{ gap: 4 }}>
              {me.viewers.length ? me.viewers.map((v) => (
                <View key={v.id} style={styles.row}>
                  <Face name={v.name} path={v.photo_path} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{v.name}</Text>
                    <Text style={styles.small}>{tx(VIA_LABEL[v.via])}</Text>
                  </View>
                  <Pressable onPress={() => removeViewer(v.id, v.name)} accessibilityRole="button" accessibilityLabel={tx('Sacar a {name}', { name: v.name })} hitSlop={8}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.red }}>{tx('Sacar')}</Text>
                  </Pressable>
                </View>
              )) : <Text style={styles.text}>{tx('Todavía nadie. Elegí abajo con quién compartir.')}</Text>}
              <View style={styles.sep} />
              <Toggle label={tx('Mi familia')} value={me.share_family} disabled={busy === 'grupos' || me.family_count === 0} onChange={(v) => setGroups(v, me.share_pastors)}
                hint={me.family_count === 0 ? tx('Todavía no hay nadie de tu familia con cuenta en la app.') : tx('Tus familiares que tienen cuenta en la app.')} />
              <Toggle label={tx('Los pastores')} value={me.share_pastors} disabled={busy === 'grupos' || me.pastor_count === 0} onChange={(v) => setGroups(me.share_family, v)}
                hint={me.pastor_count === 0 ? tx('No hay otro pastor con cuenta en tu iglesia.') : undefined} />
                {me.family_left.filter((f) => !viewerIds.has(f.id)).map((f) => (
                <View key={f.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{f.name}</Text>
                    <Text style={styles.small}>{tx('Es de tu familia y ahora no te ve.')}</Text>
                  </View>
                  <Pressable onPress={() => run(`sumar-${f.id}`, () => locViewerAdd(f.id))} accessibilityRole="button" hitSlop={8}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green }}>{tx('Sumar')}</Text>
                  </Pressable>
                </View>
              ))}
              <Button title={tx('Agregar a una persona')} icon="user-plus" variant="ghost" small onPress={openPicker} />
            </Card>

            <SectionTitle>{tx('Mis lugares')}</SectionTitle>
            <Card style={{ gap: 6 }}>
              <Text style={styles.small}>{tx('Cuando llegás o salís de uno de tus lugares, les llega un aviso a las personas que te ven.')}</Text>
              {me.places.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Feather name="map-pin" size={18} color={colors.violet} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{p.name}</Text>
                    <Text style={styles.small}>{tx('{radius_m} metros alrededor{pl}', { radius_m: p.radius_m, pl: p.inside ? tx(' · estás acá') : '' })}</Text>
                  </View>
                  <Pressable onPress={() => run(`lugar-${p.id}`, () => locPlaceArchive(p.id))} accessibilityRole="button" accessibilityLabel={tx('Sacar {name}', { name: p.name })} hitSlop={8}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.red }}>{tx('Sacar')}</Text>
                  </Pressable>
                </View>
              ))}
              {draft ? (
                <View style={{ gap: 10, paddingTop: 6 }}>
                  <Choice options={PLACE_NAMES.map((x) => ({ value: x, label: tx(x) }))} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
                  {draft.name === 'Otro' ? <Field label={tx('Nombre del lugar')} value={draft.other} onChangeText={(other) => setDraft({ ...draft, other })} maxLength={40} placeholder={tx('Casa de los abuelos')} /> : null}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Button title={tx('Estoy acá ahora')} icon="crosshair" variant="outline" small onPress={useHere} loading={busy === 'aca'} />
                    {draft.name === 'Casa' && me.home ? (
                      <Button title={tx('Usar la dirección de mi casa')} icon="home" variant="outline" small onPress={() => setDraft({ ...draft, pos: me.home })} />
                    ) : null}
                  </View>
                  <Text style={styles.small}>{draft.pos ? tx('Listo: mirá el círculo naranja en el mapa. Si no está bien, tocá el lugar en el mapa.') : tx('O tocá el lugar en el mapa de arriba.')}</Text>
                  <Choice options={RADII} value={draft.radius} onChange={(radius) => setDraft({ ...draft, radius })} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title={tx('Cancelar')} variant="ghost" small style={{ flex: 1 }} onPress={() => setDraft(null)} />
                    <Button title={tx('Guardar lugar')} icon="check" small style={{ flex: 1 }} onPress={savePlace} loading={busy === 'lugar'} />
                  </View>
                </View>
              ) : (
                <Button title={tx('Agregar un lugar')} icon="plus" variant="ghost" small onPress={startDraft} />
              )}
            </Card>
          </>
        ) : null}

        {me.available ? (
          <View style={{ gap: 6 }}>
            <Tag text={tx('Tu ubicación es tuya')} tone="gray" />
            <Text style={styles.small}>
              {tx('Se guarda por dónde anduviste en los últimos 30 días. Solo lo ven las personas de tu lista. Nadie puede prenderlo por vos. En pausa no se guarda nada, y al dejar de compartir se borra todo. Los chicos sin cuenta no se siguen: cada uno comparte su propio teléfono.')}
            </Text>
          </View>
        ) : null}
      </Screen>

      <PickerModal visible={pickingFam} title={tx('¿Quién es de tu familia?')} items={church.filter((c) => !famIds.has(c.id))}
        onClose={() => setPickingFam(false)}
        onPick={(id) => { setPickingFam(false); if (id) addFamily(id); }} />
      <PickerModal visible={picking} title={tx('¿Con quién querés compartir?')} items={church.filter((c) => !viewerIds.has(c.id))}
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
