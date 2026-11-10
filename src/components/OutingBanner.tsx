// Mientras hay una salida en curso se puede usar el resto de la app: este botón flotante lleva de vuelta a la salida.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOuting } from '@/store/outing';
import { fmtDuration } from '@/lib/format';
import { colors } from '@/theme';

const HIDE = new Set(['salida', 'login', 'registro', 'contacto', 'recortar', 'resumen']);

export function OutingBanner() {
  const outing = useOuting();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());
  const active = outing.active;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  const first = (segments[0] ?? '') as string;
  if (!active || HIDE.has(first)) return null;
  const onTabs = first === '(tabs)';
  const flyers = active.kind === 'flyers';
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: (onTabs ? 92 : 16) + (onTabs ? 0 : insets.bottom) }]}>
      <Pressable onPress={() => router.push('/salida')} accessibilityRole="button" accessibilityLabel="Volver a la salida en curso"
        style={({ pressed }) => [styles.pill, flyers && { backgroundColor: colors.orange }, pressed && { opacity: 0.9 }]}>
        <View style={styles.dot} />
        <Text style={styles.text}>{flyers ? 'Volantes' : 'Salida'} en curso · {fmtDuration(now - active.startedAt)}</Text>
        <Text style={styles.back}>Volver</Text>
        <Feather name="chevron-right" size={18} color="#FFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 10, height: 46, borderRadius: 999, backgroundColor: '#1F6B45',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF' },
  text: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  back: { color: '#FFF', fontSize: 14, fontWeight: '900', textDecorationLine: 'underline', marginLeft: 4 },
});
