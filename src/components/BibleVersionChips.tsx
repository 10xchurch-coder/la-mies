// Para elegir en qué Biblia leer o buscar (hoy: Reina-Valera 1909 en español y King James en inglés).
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { VERSIONS, type BibleVersion } from '@/lib/bible';
import { colors } from '@/theme';

export function BibleVersionChips({ value, onChange }: { value: string; onChange: (v: BibleVersion) => void }) {
  if (VERSIONS.length < 2) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {VERSIONS.map((v) => {
        const on = v.id === value;
        return (
          <Pressable key={v.id} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={v.name}
            style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: on ? colors.blueSoft : colors.bg }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: on ? colors.blueText : colors.text }}>{v.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
