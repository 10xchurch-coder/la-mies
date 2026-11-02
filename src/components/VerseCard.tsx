// La tarjeta del versículo del día: fondo con color o foto, el versículo y una frase corta.
// Formato vertical (como una historia de WhatsApp o Instagram), lista para compartir.
import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type CardHandle = React.ComponentRef<typeof View>;
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { cachedSignedUrl } from '../lib/files';
import type { DailyContent } from '../types';

/** Fondos incluidos (nombre → colores). Si el fondo no está acá, se toma como foto del bucket "photos". */
export const BACKGROUNDS: Record<string, { label: string; colors: [string, string, string] }> = {
  campo:    { label: 'Campo',    colors: ['#1F6B45', '#2F8F5B', '#9CCB8E'] },
  cielo:    { label: 'Cielo',    colors: ['#1E3A8A', '#2563EB', '#93C5FD'] },
  amanecer: { label: 'Amanecer', colors: ['#7C2D12', '#EA580C', '#FDE68A'] },
  noche:    { label: 'Noche',    colors: ['#0F172A', '#1E293B', '#475569'] },
  rio:      { label: 'Río',      colors: ['#134E4A', '#0D9488', '#99F6E4'] },
  montana:  { label: 'Montaña',  colors: ['#44403C', '#78716C', '#D6D3D1'] },
};
export const BACKGROUND_NAMES = Object.keys(BACKGROUNDS);

export const VerseCard = forwardRef<CardHandle, { item: DailyContent; church?: string | null; style?: StyleProp<ViewStyle>; compact?: boolean }>(
  function VerseCard({ item, church, style, compact }, ref) {
    const bg = BACKGROUNDS[item.background];
    const photo = bg ? null : cachedSignedUrl('photos', item.background);
    const long = item.verse.length > 220;
    return (
      <View ref={ref} collapsable={false} style={[styles.card, compact && styles.compact, style]}>
        {bg ? (
          <LinearGradient colors={bg.colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : (
          <>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1F6B45' }]} />
            {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
          </>
        )}
        <View style={styles.top}>
          <Feather name="feather" size={compact ? 16 : 20} color="rgba(255,255,255,0.9)" />
          <Text style={[styles.brand, compact && { fontSize: 12 }]}>Versículo del día</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', gap: compact ? 8 : 14 }}>
          <Text style={[styles.verse, compact && { fontSize: 15, lineHeight: 21 }, long && !compact && { fontSize: 19, lineHeight: 27 }]} numberOfLines={compact ? 5 : undefined}>
            {item.verse}
          </Text>
          <Text style={[styles.ref, compact && { fontSize: 13 }]}>{item.reference}</Text>
          {item.message ? <Text style={[styles.msg, compact && { fontSize: 13 }]}>{item.message}</Text> : null}
        </View>
        <Text style={[styles.foot, compact && { fontSize: 10 }]}>{church ?? 'La Mies'} · RV1960</Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: 9 / 16, maxHeight: 640, borderRadius: 22, overflow: 'hidden', padding: 26, justifyContent: 'space-between', backgroundColor: '#1F6B45' },
  compact: { aspectRatio: 16 / 10, maxHeight: 260, padding: 18, borderRadius: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  verse: { color: '#FFFFFF', fontSize: 23, lineHeight: 32, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  ref: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', opacity: 0.95 },
  msg: { color: 'rgba(255,255,255,0.92)', fontSize: 16, fontStyle: 'italic', lineHeight: 22 },
  foot: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', textAlign: 'right' },
});
