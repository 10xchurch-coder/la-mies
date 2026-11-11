// Una ubicación dentro del chat: mapita con el pin, y si es "en tiempo real", cuánto falta y el botón para dejar de compartir.
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MapView, Marker, mapAvailable } from './map';
import { regionAround } from './CoverageMap';
import { mapsUrl } from '../lib/geoLink';
import { fmtTime } from '../lib/format';
import type { ChatMessage } from '../lib/chat';
import { colors, themed } from '../theme';

export function LocationBubble({ m, onStop }: { m: ChatMessage; onStop: () => void }) {
  const [, tick] = useState(0);
  const live = m.kind === 'live';
  const until = m.live_until ? new Date(m.live_until).getTime() : 0;
  const active = live && until > Date.now();
  // Se refresca cada 30 s para que "faltan X min" y el cartel de "terminó" no queden viejos.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [live]);
  if (m.lat == null || m.lng == null) return null;
  const left = Math.max(0, Math.ceil((until - Date.now()) / 60000));
  const open = () => Linking.openURL(mapsUrl(m.lat as number, m.lng as number, m.body || undefined)).catch(() => undefined);
  return (
    <View style={styles.wrap}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="Abrir la ubicación en el mapa" style={styles.map}>
        {mapAvailable ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <MapView style={StyleSheet.absoluteFill} initialRegion={regionAround({ lat: m.lat, lng: m.lng }, 220)} region={regionAround({ lat: m.lat, lng: m.lng }, 220)}
              scrollEnabled={false} zoomEnabled={false} toolbarEnabled={false} liteMode>
              <Marker coordinate={{ latitude: m.lat, longitude: m.lng }} pinColor={active ? colors.red : colors.green} />
            </MapView>
          </View>
        ) : (
          <View style={styles.fallback}>
            <Feather name="map-pin" size={34} color={active ? colors.red : colors.green} />
            <Text style={styles.coords}>{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</Text>
          </View>
        )}
        {active ? <View style={styles.liveTag}><View style={styles.dot} /><Text style={styles.liveText}>EN VIVO</Text></View> : null}
      </Pressable>
      {m.body ? <Text style={styles.label}>{m.body}</Text> : null}
      {live ? (
        <Text style={styles.sub}>
          {active ? `Ubicación en tiempo real · faltan ${left} min` : 'La ubicación en tiempo real terminó'}
          {m.live_updated_at ? ` · actualizada ${fmtTime(m.live_updated_at)}` : ''}
        </Text>
      ) : <Text style={styles.sub}>Ubicación</Text>}
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Pressable onPress={open} accessibilityRole="button"><Text style={styles.link}>Abrir en el mapa</Text></Pressable>
        {active && m.mine ? <Pressable onPress={onStop} accessibilityRole="button"><Text style={[styles.link, { color: colors.red }]}>Dejar de compartir</Text></Pressable> : null}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { gap: 6, minWidth: 230 },
  map: { height: 130, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.greenSoft },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coords: { fontSize: 12, color: colors.muted },
  liveTag: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.red, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted },
  link: { fontSize: 13, fontWeight: '800', color: colors.blueText },
}));
