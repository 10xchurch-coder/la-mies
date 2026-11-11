// Resumen de una salida, listo para compartir en el grupo de WhatsApp del equipo.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { MapView, Polyline } from '@/components/map';
import { regionAround } from '@/components/CoverageMap';
import { Header, Screen } from '@/components/Screen';
import { Button, Loading } from '@/components/ui';
import { outingPoints, sessionSummary } from '@/lib/api';
import { fmtDayYear, fmtDistance, fmtMinutes, fmtTime } from '@/lib/format';
import { shareImage, shareText } from '@/lib/share';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { SessionSummary } from '@/types';

export default function Resumen() {
  const router = useRouter();
  const { session } = useLocalSearchParams<{ session: string }>();
  const { church } = useAuth();
  const [s, setS] = useState<SessionSummary | null>(null);
  const [pts, setPts] = useState<{ latitude: number; longitude: number }[]>([]);
  const ref = useRef<React.ComponentRef<typeof View>>(null);

  useEffect(() => {
    if (!session) return;
    sessionSummary(session).then(setS).catch(() => undefined);
    outingPoints(session).then((r) => setPts(r.map((p) => ({ latitude: p.lat, longitude: p.lng })))).catch(() => undefined);
  }, [session]);

  if (!s) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Resumen de la salida" back />
        <Loading />
      </View>
    );
  }

  const text = `${s.name} · ${church?.name ?? ''}\n${fmtDayYear(s.started_at)} ${fmtTime(s.started_at)}${s.ended_at ? `–${fmtTime(s.ended_at)}` : ''}\n`
    + `⏱ ${fmtMinutes(s.minutes)} · 🚶 ${fmtDistance(s.distance_m)}\n🏠 ${s.houses} casas · ${s.sidewalks} veredas\n`
    + `📝 ${s.contacts} contactos · 📖 ${s.presentations} con el evangelio · 🤝 ${s.promises} promesas\n\n"Alzad vuestros ojos y mirad los campos, porque ya están blancos para la siega" Juan 4:35`;

  const share = async () => {
    try {
      const ok = await shareImage(async () => {
        const { captureRef } = await import('react-native-view-shot');
        return captureRef(ref as unknown as number, { format: 'png', quality: 1, result: 'tmpfile' });
      });
      if (!ok) {
        const how = await shareText(text, 'Salida');
        if (how === 'copied') Alert.alert('Copiado', 'El resumen quedó copiado. Pegalo en WhatsApp.');
      }
    } catch {
      await shareText(text, 'Salida');
    }
  };

  const center = pts[Math.floor(pts.length / 2)];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Resumen de la salida" back />
      <Screen>
        <View ref={ref} collapsable={false} style={styles.card}>
          <View style={styles.top}>
            <Feather name="sun" size={14} color="#FFFFFF" />
            <Text style={styles.topText}>{church?.name ?? 'La Mies'} · Salida de evangelismo</Text>
          </View>
          <Text style={styles.who}>{s.name}</Text>
          <Text style={styles.when}>{fmtDayYear(s.started_at)} · {fmtTime(s.started_at)}{s.ended_at ? ` a ${fmtTime(s.ended_at)}` : ''}</Text>
          {center ? (
            <View style={styles.map}>
              <MapView style={StyleSheet.absoluteFill} initialRegion={regionAround({ lat: center.latitude, lng: center.longitude }, 380)} scrollEnabled={false} zoomEnabled={false} toolbarEnabled={false}>
                <Polyline coordinates={pts} strokeColor={colors.green} strokeWidth={5} />
              </MapView>
            </View>
          ) : null}
          <View style={styles.grid}>
            <Big value={s.houses} label="Casas" />
            <Big value={s.contacts} label="Contactos" />
            <Big value={s.presentations} label="Evangelio" />
            <Big value={s.promises} label="Promesas" />
          </View>
          <Text style={styles.small}>{fmtMinutes(s.minutes)} · {fmtDistance(s.distance_m)} caminados · {s.sidewalks} veredas</Text>
          <Text style={styles.verse}>"Alzad vuestros ojos y mirad los campos, porque ya están blancos para la siega" Juan 4:35</Text>
        </View>
        {s.ended_at && s.minutes < 10 && s.distance_m < 300 && s.contacts + s.presentations + s.promises === 0 ? (
          <Text style={{ color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 18 }}>
            Esta salida duró menos de 10 minutos, casi no tuvo recorrido y no registraste a nadie, así que no suma a tus números. Si fue una prueba, podés borrarla en Yo → Mis salidas.
          </Text>
        ) : null}
        <Button title="Compartir en WhatsApp" icon="share-2" onPress={share} />
        <Button title="Listo" variant="ghost" onPress={() => router.replace('/(tabs)/mapa')} />
      </Screen>
    </View>
  );
}

function Big({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.big}>
      <Text style={styles.bigValue}>{value}</Text>
      <Text style={styles.bigLabel}>{label}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: { borderRadius: 18, padding: 16, gap: 8, backgroundColor: '#1F6B45' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', opacity: 0.9 },
  who: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  when: { color: '#FFFFFF', fontSize: 13, opacity: 0.9 },
  map: { height: 180, borderRadius: 12, overflow: 'hidden', marginVertical: 4 },
  grid: { flexDirection: 'row', gap: 6 },
  big: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)' },
  bigValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  bigLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  small: { color: '#FFFFFF', fontSize: 13, textAlign: 'center' },
  verse: { color: '#FFFFFF', fontSize: 12, fontStyle: 'italic', textAlign: 'center', opacity: 0.9 },
}));
