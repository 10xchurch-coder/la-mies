// Partes de los grupos pequeños que se usan en varias pantallas: cuándo se reúne y la guía con sus preguntas.
import React from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { parseGuide } from '@/lib/groupGuide';
import { colors } from '@/theme';
import type { ClassRow } from '@/types';
import { tx } from '@/lib/i18n';

export const dayName = (d: string) => ({ mon: tx('Lunes'), tue: tx('Martes'), wed: tx('Miércoles'), thu: tx('Jueves'), fri: tx('Viernes'), sat: tx('Sábado'), sun: tx('Domingo') } as Record<string, string>)[d] ?? d;
export const whenText = (k: ClassRow) => [(k.days ?? []).map(dayName).join(' y '), k.meet_time].filter(Boolean).join(' · ');

/** La guía con sus títulos y preguntas. */
export function GuideView({ text }: { text: string }) {
  return (
    <Card style={{ gap: 8 }}>
      {parseGuide(text).map((p, i) => p.kind === 'title' ? (
        <Text key={i} style={{ fontSize: 15, fontWeight: '800', color: colors.green, marginTop: i ? 8 : 0 }}>{p.text}</Text>
      ) : p.kind === 'item' ? (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={{ fontSize: 15, color: colors.green, fontWeight: '800' }}>•</Text>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: colors.text }}>{p.text}</Text>
        </View>
      ) : (
        <Text key={i} style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{p.text}</Text>
      ))}
    </Card>
  );
}

