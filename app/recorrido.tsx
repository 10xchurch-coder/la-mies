// El recorrido del colectivo: las paradas en orden (casas de la gente o puntos del mapa) y el botón para abrirlo en Google Maps o Apple Maps.
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { PickerModal } from '@/components/Picker';
import { showActions } from '@/components/ActionSheet';
import { Button, Card, Empty, Loading, Tag } from '@/components/ui';
import { listPeople } from '@/lib/api';
import { appleStopUrl, googleRouteUrls, googleStopUrl, moved, MAX_PER_LEG } from '@/lib/busRoute';
import { supabase, errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import type { Contact } from '@/types';

type Stop = { id: string; sort: number; contact_id: string | null; label: string; lat: number; lng: number; address: string | null; phone: string | null; pickup_time: string | null; picked: boolean; note: string | null };

const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir el mapa'));

export default function Recorrido() {
  const router = useRouter();
  const { group, name } = useLocalSearchParams<{ group: string; name?: string }>();
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [people, setPeople] = useState<Contact[]>([]);
  const [picker, setPicker] = useState(false);

  const load = useCallback(() => {
    supabase.rpc('bus_route_stops', { p_group: group }).then(({ data }) => setStops((data ?? []) as Stop[]));
  }, [group]);
  useFocusEffect(useCallback(() => {
    load();
    supabase.rpc('can_drive_bus', { p_group: group }).then(({ data }) => setCanEdit(!!data));
  }, [load, group]));

  const fail = (e: unknown) => Alert.alert('No se pudo', errorMessage(e));
  const reorder = (i: number, dir: -1 | 1) => {
    if (!stops) return;
    const next = moved(stops, i, dir);
    setStops(next);
    supabase.rpc('bus_stops_reorder', { p_group: group, p_ids: next.map((s) => s.id) }).then(({ error }) => { if (error) { fail(error); load(); } });
  };
  const addAll = () => supabase.rpc('bus_stops_from_riders', { p_group: group }).then(({ data, error }) => {
    if (error) return fail(error);
    load();
    Alert.alert(data ? `Sumamos ${data} ${data === 1 ? 'parada' : 'paradas'}` : 'No había pasajeros nuevos', data ? 'Quedaron por hora de pasada. Acomodá el orden con las flechas.' : 'Todos los pasajeros de esta ruta ya son parada.');
  });
  const addHome = (contactId: string) => {
    const sort = ((stops ?? [])[(stops ?? []).length - 1]?.sort ?? 0) + 10;
    supabase.from('bus_stops').insert({ group_id: group, contact_id: contactId, sort }).then(({ error }) => { if (error) fail(error.code === '23505' ? new Error('Esa persona ya es una parada de esta ruta.') : error); else load(); });
  };
  const remove = (s: Stop) => supabase.from('bus_stops').delete().eq('id', s.id).then(({ error }) => { if (error) fail(error); else load(); });
  const openPeople = () => { if (!people.length) listPeople().then(setPeople).catch(() => undefined); setPicker(true); };

  const go = (s: Stop) => {
    if (Platform.OS !== 'ios') return open(googleStopUrl(s));
    showActions(`Ir a ${s.label}`, undefined, [
      { text: 'Apple Maps', icon: 'map', onPress: () => open(appleStopUrl(s)) },
      { text: 'Google Maps', icon: 'map-pin', onPress: () => open(googleStopUrl(s)) },
      { text: 'Cancelar', icon: 'x' },
    ]);
  };
  const wholeRoute = () => {
    const urls = googleRouteUrls(stops ?? []);
    if (urls.length === 1) return open(urls[0]);
    showActions('Abrir el recorrido', `Son muchas paradas: Google Maps las abre de a ${MAX_PER_LEG}. Abrí un tramo y, al terminar, volvé por el siguiente.`, [
      ...urls.map((u, i) => ({ text: `Tramo ${i + 1}: paradas ${i * MAX_PER_LEG + 1} a ${Math.min((i + 1) * MAX_PER_LEG, (stops ?? []).length)}`, icon: 'navigation' as const, onPress: () => open(u) })),
      { text: 'Cancelar', icon: 'x' as const },
    ]);
  };

  if (!stops) return <Loading />;
  const left = stops.filter((s) => s.contact_id && !s.picked).length;
  const nextStop = stops.find((s) => s.contact_id && !s.picked);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Recorrido" subtitle={[name, `${stops.length} ${stops.length === 1 ? 'parada' : 'paradas'}`, stops.length ? `faltan subir ${left}` : null].filter(Boolean).join(' · ')} back />
      <Screen style={{ gap: 10 }}>
        {stops.length ? (
          <>
            <Button title="Abrir todo el recorrido en Google Maps" icon="navigation" onPress={wholeRoute} />
            {nextStop ? <Button title={`Ir a la próxima: ${nextStop.label}`} icon="corner-up-right" variant="outline" onPress={() => go(nextStop)} /> : null}
          </>
        ) : (
          <Empty icon="map" title="Todavía no hay paradas" text={canEdit ? 'Sumá las casas de los pasajeros o marcá puntos en el mapa. Después abrís el recorrido en Google Maps o Apple Maps.' : 'El encargado de la ruta todavía no armó el recorrido.'} />
        )}
        {stops.map((s, i) => (
          <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: s.picked ? 0.55 : 1 }}>
            <Text style={{ width: 22, fontSize: 15, fontWeight: '800', color: colors.muted, textAlign: 'center' }}>{i + 1}</Text>
            <Feather name={s.contact_id ? 'home' : 'map-pin'} size={18} color={colors.green} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{s.label}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={2}>{[s.pickup_time, s.address, s.note].filter(Boolean).join(' · ') || (s.contact_id ? 'Casa' : 'Punto en el mapa')}</Text>
            </View>
            {s.picked ? <Tag text="Subió" tone="green" /> : null}
            <Pressable hitSlop={8} onPress={() => go(s)} accessibilityRole="button" accessibilityLabel={`Ir a ${s.label}`}><Feather name="navigation" size={20} color={colors.green} /></Pressable>
            {canEdit ? (
              <View style={{ gap: 2 }}>
                <Pressable hitSlop={6} disabled={i === 0} onPress={() => reorder(i, -1)} accessibilityLabel="Subir"><Feather name="chevron-up" size={20} color={i === 0 ? colors.border : colors.muted} /></Pressable>
                <Pressable hitSlop={6} disabled={i === stops.length - 1} onPress={() => reorder(i, 1)} accessibilityLabel="Bajar"><Feather name="chevron-down" size={20} color={i === stops.length - 1 ? colors.border : colors.muted} /></Pressable>
              </View>
            ) : null}
            {canEdit ? <Pressable hitSlop={8} onPress={() => remove(s)} accessibilityLabel="Quitar parada"><Feather name="x" size={20} color={colors.muted} /></Pressable> : null}
          </Card>
        ))}
        {canEdit ? (
          <>
            <Button title="Sumar a todos los pasajeros de la ruta" icon="users" variant="outline" onPress={addAll} />
            <Button title="Elegir la casa de una persona" icon="home" variant="outline" onPress={openPeople} />
            <Button title="Marcar un punto en el mapa" icon="map-pin" variant="outline" onPress={() => router.push({ pathname: '/ubicacion', params: { route: group } } as unknown as Href)} />
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>La casa usa el punto que tiene la ficha de la persona. Si está mal, corregilo en su ficha y acá cambia solo.</Text>
          </>
        ) : null}
      </Screen>
      <PickerModal visible={picker} title="¿La casa de quién?" onClose={() => setPicker(false)}
        items={people.filter((p) => !stops.some((s) => s.contact_id === p.id)).map((p) => ({ id: p.id, title: p.name, subtitle: p.address ?? p.address_hint ?? undefined, photo: p.photo_path, face: true }))}
        onPick={(cid) => { setPicker(false); if (cid) addHome(cid); }} />
    </View>
  );
}
