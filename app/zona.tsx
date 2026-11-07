// Una zona para salir: el líder la dibuja tocando el mapa (esquinas), le pone nombre y elige quiénes van.
// Todos la ven en el mapa; acá se ve el avance (veredas y casas cubiertas desde que se creó).
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { CoverageMap, bboxOfRegion, regionAround } from '@/components/CoverageMap';
import { Circle, Polygon, type Region } from '@/components/map';
import { Header } from '@/components/Screen';
import { Button, Field, Loading } from '@/components/ui';
import { coverageInBbox, deleteZone, housesInBbox, listProfiles, listZones, roadsInBbox, saveZone, zoneProgress } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { CoverageRow, HouseRow, Profile, RoadRow, Zone, ZoneProgress } from '@/types';

const COLORS = ['#2F8F5B', '#2563EB', '#D97706', '#7C3AED', '#DB2777', '#0D9488'];

export default function ZonaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isLeader, profile } = useAuth();
  const [zone, setZone] = useState<Zone | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [editing, setEditing] = useState(!id);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [poly, setPoly] = useState<[number, number][]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [progress, setProgress] = useState<ZoneProgress | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [roads, setRoads] = useState<RoadRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listProfiles().then(setPeople).catch(() => undefined);
    if (id) {
      listZones(true).then((zs) => {
        const z = zs.find((x) => x.id === id) ?? null;
        setZone(z);
        if (z) {
          setName(z.name);
          setColor(z.color);
          setPoly(z.polygon);
          setAssigned(z.assigned);
          const lat = z.polygon.reduce((a, p) => a + p[0], 0) / z.polygon.length;
          const lng = z.polygon.reduce((a, p) => a + p[1], 0) / z.polygon.length;
          setRegion(regionAround({ lat, lng }, 450));
          zoneProgress(z.id).then(setProgress).catch(() => undefined);
        }
        setLoaded(true);
      }).catch(() => setLoaded(true));
    } else {
      Location.getForegroundPermissionsAsync()
        .then((p) => (p.status === 'granted' ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }) : null))
        .then((here) => setRegion(regionAround(here ? { lat: here.coords.latitude, lng: here.coords.longitude } : { lat: -27.3671, lng: -55.896 }, 500)))
        .catch(() => setRegion(regionAround({ lat: -27.3671, lng: -55.896 }, 500)));
    }
  }, [id]);

  const loadArea = (r: Region) => {
    if (r.latitudeDelta > 0.05) return;
    const b = bboxOfRegion(r);
    Promise.all([roadsInBbox(b), coverageInBbox(b), r.latitudeDelta < 0.014 ? housesInBbox(b) : Promise.resolve([])])
      .then(([rs, cv, hs]) => {
        setRoads(rs);
        setCoverage(cv);
        setHouses(hs);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (region) loadArea(region);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region === null]);

  const names = useMemo(() => people.filter((p) => assigned.includes(p.id)).map((p) => p.display_name), [people, assigned]);

  const save = async () => {
    if (poly.length < 3) {
      Alert.alert('Faltan esquinas', 'Tocá el mapa al menos en 3 lugares para marcar la zona.');
      return;
    }
    setBusy(true);
    try {
      const z = await saveZone({ id: zone?.id, name: name.trim() || 'Zona', color, polygon: poly, assigned, note: zone?.note ?? null, on_date: zone?.on_date ?? null });
      setZone(z);
      setEditing(false);
      zoneProgress(z.id).then(setProgress).catch(() => undefined);
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!zone) return;
    Alert.alert('Borrar la zona', `¿Borrar "${zone.name}"? Lo caminado no se toca.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => deleteZone(zone.id).then(() => router.back()).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
    ]);
  };

  if (!loaded || !region) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Zona" back />
        <Loading />
      </View>
    );
  }

  const pct = progress && progress.sidewalks ? Math.round((progress.done / progress.sidewalks) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={zone ? zone.name : 'Nueva zona'} subtitle={editing ? 'Tocá el mapa para marcar las esquinas' : names.length ? `Van: ${names.join(', ')}` : undefined} back />
      <View style={{ height: 340 }}>
        <CoverageMap
          roads={roads}
          coverage={coverage}
          houses={houses}
          initialRegion={region}
          onRegionChangeComplete={(r) => loadArea(r)}
          onPress={(e) => {
            if (!editing) return;
            const c = e.nativeEvent.coordinate;
            setPoly((p) => [...p, [Number(c.latitude.toFixed(6)), Number(c.longitude.toFixed(6))]]);
          }}
        >
          {poly.length >= 3 ? <Polygon coordinates={poly.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))} strokeColor={color} fillColor={`${color}22`} strokeWidth={3} /> : null}
          {editing ? poly.map(([lat, lng], i) => <Circle key={i} center={{ latitude: lat, longitude: lng }} radius={6} fillColor={color} strokeColor="#FFFFFF" strokeWidth={2} />) : null}
        </CoverageMap>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {editing ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Deshacer" variant="outline" small icon="corner-up-left" onPress={() => setPoly((p) => p.slice(0, -1))} disabled={!poly.length} style={{ flex: 1 }} />
              <Button title="Empezar de nuevo" variant="ghost" small onPress={() => setPoly([])} disabled={!poly.length} style={{ flex: 1 }} />
            </View>
            <Field label="Nombre" value={name} onChangeText={setName} placeholder="Barrio Itaembé Guazú, manzanas 1 a 6" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {COLORS.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="button" style={[styles.color, { backgroundColor: c }, color === c && styles.colorOn]} />
              ))}
            </View>
            <Text style={styles.label}>¿Quiénes van?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {people.map((p) => {
                const on = assigned.includes(p.id);
                return (
                  <Pressable key={p.id} onPress={() => setAssigned((a) => (on ? a.filter((x) => x !== p.id) : [...a, p.id]))} accessibilityRole="button" style={[styles.person, on && styles.personOn]}>
                    <Text style={{ fontSize: 14, fontWeight: on ? '800' : '600', color: on ? colors.greenText : colors.text }}>{p.display_name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button title="Guardar zona" icon="check" onPress={save} loading={busy} />
            {zone ? <Button title="Cancelar" variant="ghost" onPress={() => setEditing(false)} /> : null}
          </>
        ) : (
          <>
            {progress ? (
              <View style={styles.progress}>
                <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{pct}%</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.barBg}><View style={[styles.bar, { width: `${pct}%`, backgroundColor: color }]} /></View>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {progress.done} de {progress.sidewalks} veredas · {progress.houses_done} de {progress.houses} casas
                  </Text>
                </View>
              </View>
            ) : null}
            {names.length ? <Text style={{ fontSize: 14, color: colors.text }}><Text style={{ fontWeight: '800' }}>Asignada a: </Text>{names.join(', ')}</Text> : null}
            {zone && assigned.includes(profile?.id ?? '') ? (
              <View style={styles.mine}>
                <Feather name="flag" size={18} color={colors.greenText} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.greenText }}>Esta zona es tuya. Las veredas que camines se van pintando y el avance sube solo.</Text>
              </View>
            ) : null}
            {isLeader ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Editar" variant="outline" icon="edit-2" onPress={() => setEditing(true)} style={{ flex: 1 }} />
                <Button title="Borrar" variant="ghost" icon="trash-2" onPress={remove} style={{ flex: 1 }} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.label },
  color: { width: 36, height: 36, borderRadius: 18 },
  colorOn: { borderWidth: 3, borderColor: colors.text },
  person: { height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  personOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: colors.bgSoft },
  barBg: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.greenSoft },
}));
