// La tarjeta del versículo del día, al estilo de la app de la Biblia: una foto de fondo distinta cada día,
// arriba "Versículo del día" chiquito y la cita, después el versículo y abajo la frase.
// Sirve en la pestaña Iglesia (compacta) y a pantalla completa en el devocional (para compartir como imagen).
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { cachedSignedUrl } from '../lib/files';
import { chosenPhotoId, dailyPhotoId, photoUrl } from '../lib/backgrounds';
import type { DailyContent } from '../types';
import { themed } from '../theme';

export type CardHandle = React.ComponentRef<typeof View>;

/** Fondos de color (opcionales; lo normal es "auto" = la foto del día). */
export const BACKGROUNDS: Record<string, { label: string; colors: [string, string, string] }> = {
  campo:    { label: 'Campo',    colors: ['#1F6B45', '#2F8F5B', '#9CCB8E'] },
  cielo:    { label: 'Cielo',    colors: ['#1E3A8A', '#2563EB', '#93C5FD'] },
  amanecer: { label: 'Amanecer', colors: ['#7C2D12', '#EA580C', '#FDE68A'] },
  noche:    { label: 'Noche',    colors: ['#0F172A', '#1E293B', '#475569'] },
  rio:      { label: 'Río',      colors: ['#134E4A', '#0D9488', '#99F6E4'] },
  montana:  { label: 'Montaña',  colors: ['#44403C', '#78716C', '#D6D3D1'] },
};
export const BACKGROUND_NAMES = Object.keys(BACKGROUNDS);

/** El fondo del día: foto automática, un color elegido o una foto subida por la iglesia. Ocupa todo el lugar. */
export function DayBackground({ background, date, width = 1080, height = 1920, dim = 'normal' }: {
  background: string | null | undefined; date: string; width?: number; height?: number; dim?: 'normal' | 'strong';
}) {
  const bg = background && BACKGROUNDS[background];
  // "u:<id>" = una foto de Unsplash elegida para ese versículo; "auto" = la foto que toca ese día.
  const chosen = chosenPhotoId(background);
  const uploaded = !bg && !chosen && background && background !== 'auto' ? cachedSignedUrl('photos', background) : null;
  const uri = bg ? null : uploaded ?? photoUrl(chosen ?? dailyPhotoId(date), width * 2, height * 2);
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1F3B2C' }]} />
      {bg ? (
        <LinearGradient colors={bg.colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={250} />
      ) : null}
      {/* Oscurecer un poco para que el texto blanco se lea sobre cualquier foto. */}
      <LinearGradient
        colors={dim === 'strong' ? ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.7)'] : ['rgba(0,0,0,0.38)', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0.55)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill}
      />
    </>
  );
}

export const VerseCard = forwardRef<CardHandle, {
  item: DailyContent; church?: string | null; style?: StyleProp<ViewStyle>;
  /** Compacta: la tarjeta de la pestaña Iglesia. Si no, ocupa todo el lugar (pantalla completa). */
  compact?: boolean; lines?: number; hideMessage?: boolean; width?: number; height?: number;
}>(function VerseCard({ item, church, style, compact, lines, hideMessage, width, height }, ref) {
  const long = item.verse.length > 220;
  const veryLong = item.verse.length > 380;
  return (
    <View ref={ref} collapsable={false} style={[compact ? styles.compact : styles.full, style]}>
      <DayBackground background={item.background} date={item.on_date} width={width ?? (compact ? 540 : 540)} height={height ?? (compact ? 340 : 960)} />
      <View style={{ gap: compact ? 2 : 6 }}>
        <View style={styles.top}>
          <Feather name="sun" size={compact ? 11 : 13} color="rgba(255,255,255,0.85)" />
          <Text style={[styles.label, compact && { fontSize: 10 }]}>Versículo del día</Text>
        </View>
        <Text style={[styles.ref, compact && { fontSize: 17 }]}>{item.reference}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: compact ? 8 : 18, gap: compact ? 8 : 18 }}>
        <Text
          style={[styles.verse, compact && { fontSize: 16, lineHeight: 23 }, !compact && long && { fontSize: 21, lineHeight: 30 }, !compact && veryLong && { fontSize: 18, lineHeight: 26 }]}
          numberOfLines={lines ?? (compact ? 5 : undefined)}
        >
          {item.verse}
        </Text>
        {item.message && !hideMessage ? <Text style={[styles.msg, compact && { fontSize: 13, lineHeight: 18 }]} numberOfLines={compact ? 2 : undefined}>{item.message}</Text> : null}
      </View>
      <Text style={[styles.foot, compact && { fontSize: 10 }]}>{church ?? 'La Mies'} · RV1960</Text>
    </View>
  );
});

const styles = themed(() => StyleSheet.create({
  full: { flex: 1, overflow: 'hidden', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 28, justifyContent: 'space-between', backgroundColor: '#1F3B2C' },
  compact: { width: '100%', aspectRatio: 16 / 11, maxHeight: 300, borderRadius: 18, overflow: 'hidden', padding: 18, justifyContent: 'space-between', backgroundColor: '#1F3B2C' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  ref: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  verse: { color: '#FFFFFF', fontSize: 25, lineHeight: 35, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  msg: { color: 'rgba(255,255,255,0.95)', fontSize: 17, fontStyle: 'italic', lineHeight: 24, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  foot: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', textAlign: 'right' },
}));
