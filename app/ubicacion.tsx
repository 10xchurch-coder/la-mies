// Mandar una ubicación al chat: mi ubicación de ahora, un lugar elegido en el mapa, o un enlace de Google Maps.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header } from '@/components/Screen';
import { Button } from '@/components/ui';
import { MapView, mapAvailable, type Region } from '@/components/map';
import { regionAround } from '@/components/CoverageMap';
import { chatSendLocation, type ChatRoomKind } from '@/lib/chat';
import { currentPlace } from '@/lib/chatLive';
import { resolvePlace } from '@/lib/geoLink';
import { errorMessage, supabase } from '@/lib/supabase';
import { colors, themed } from '@/theme';

const POSADAS = { lat: -27.3671, lng: -55.8961 };

export default function Ubicacion() {
  const router = useRouter();
  const { room, ministry, route } = useLocalSearchParams<{ room: ChatRoomKind; ministry?: string; route?: string }>();
  const ref = { room: (room ?? 'church') as ChatRoomKind, ministryId: ministry ?? null };
  const [center, setCenter] = useState<{ lat: number; lng: number }>(POSADAS);
  const [region, setRegion] = useState<Region>(regionAround(POSADAS, 700));
  const [label, setLabel] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const moved = useRef(false);

  // El mapa arranca en donde estoy; si todavía no se movió a mano, se acomoda cuando llega la ubicación.
  useEffect(() => {
    currentPlace().then((p) => { if (!moved.current) { setCenter(p); setRegion(regionAround(p, 500)); } }).catch(() => undefined);
  }, []);

  const send = async (p: { lat: number; lng: number }) => {
    setBusy(true);
    try {
      if (route) {
        // Parada nueva para el recorrido del colectivo (va al final).
        const { data: last } = await supabase.from('bus_stops').select('sort').eq('group_id', route).order('sort', { ascending: false }).limit(1);
        const { error } = await supabase.from('bus_stops').insert({ group_id: route, label: label.trim() || 'Parada', lat: p.lat, lng: p.lng, sort: ((last?.[0]?.sort as number | undefined) ?? 0) + 10 });
        if (error) throw error;
      } else await chatSendLocation(ref, p.lat, p.lng, null, label);
      router.back();
    } catch (e) {
      Alert.alert('No se envió', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    setBusy(true);
    const p = await resolvePlace(link);
    setBusy(false);
    if (!p) return Alert.alert('No pude leer ese lugar', 'Pegá el enlace de Google Maps (desde Compartir) o las coordenadas, por ejemplo: -27.3671, -55.8961');
    send(p);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={route ? 'Parada nueva' : 'Mandar ubicación'} subtitle={mapAvailable ? 'Mové el mapa hasta poner el pin donde quieras' : 'Elegí cómo mandarla'} back />
      {mapAvailable ? (
        <View style={{ flex: 1 }}>
          <MapView style={StyleSheet.absoluteFill} region={region} showsUserLocation toolbarEnabled={false}
            onRegionChangeComplete={(r) => { moved.current = true; setRegion(r); setCenter({ lat: r.latitude, lng: r.longitude }); }} />
          <View pointerEvents="none" style={styles.pinWrap}><Feather name="map-pin" size={40} color={colors.red} style={{ marginBottom: 38 }} /></View>
        </View>
      ) : (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
            El mapa para elegir un lugar todavía no está activo en este teléfono. Podés mandar dónde estás ahora, o pegar un enlace de Google Maps:
            abrí el lugar en Google Maps, tocá Compartir, copiá el enlace y pegalo acá.
          </Text>
          <TextInput value={link} onChangeText={setLink} placeholder="Enlace de Google Maps o coordenadas" placeholderTextColor="#8B918C" autoCapitalize="none" autoCorrect={false} style={styles.input} />
          <Button title={route ? 'Guardar ese lugar' : 'Mandar ese lugar'} icon="map-pin" onPress={sendLink} loading={busy} disabled={!link.trim()} />
        </View>
      )}
      <View style={styles.bar}>
        <TextInput value={label} onChangeText={setLabel} placeholder={route ? 'Nombre de la parada (ej: Plaza del barrio)' : 'Nombre del lugar (opcional)'} placeholderTextColor="#8B918C" maxLength={80} style={styles.input} />
        {mapAvailable ? <Button title={route ? 'Guardar esta parada' : 'Mandar este lugar'} icon="map-pin" onPress={() => send(center)} loading={busy} /> : null}
        <Button title={route ? 'Usar donde estoy ahora' : 'Mandar mi ubicación de ahora'} icon="crosshair" variant="outline" loading={busy}
          onPress={async () => { try { send(await currentPlace()); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); } }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bar: { padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  input: { minHeight: 46, borderWidth: 1.5, borderColor: colors.input, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, color: colors.text },
}));
