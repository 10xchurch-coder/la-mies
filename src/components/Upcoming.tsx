// Lista de "lo que me toca": turnos de ministerio y clases de las próximas semanas.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fmtDateShort } from '../lib/format';
import { colors, themed } from '../theme';
import type { UpcomingItem } from '../types';

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  const router = useRouter();
  if (!items.length) return <Text style={{ fontSize: 13, color: colors.muted }}>No tenés turnos ni clases en las próximas semanas.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {items.map((u) => {
        const link: Href | null = u.kind === 'duty' && u.ministry_id
          ? { pathname: '/ministerio/[id]', params: { id: u.ministry_id } }
          : u.material_id ? { pathname: '/material/[id]', params: { id: u.material_id } }
          : u.class_id ? { pathname: '/clase/[id]', params: { id: u.class_id } } : null;
        return (
          <Pressable key={`${u.kind}-${u.id}`} onPress={() => link && router.push(link)} style={styles.upcoming}>
            <View style={styles.dateBox}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.greenText }}>{fmtDateShort(u.on_date).split(' ')[0].toUpperCase()}</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.greenText }}>{fmtDateShort(u.on_date).split(' ')[1]}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
                {u.kind === 'duty' ? `Turno: ${u.title}` : u.kind === 'class' ? `Das la clase ${u.title}` : `Ayudás en ${u.title}`}
              </Text>
              <Text style={{ fontSize: 13, color: colors.text }}>{u.detail}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}


const styles = themed(() => StyleSheet.create({
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: colors.greenSoft },
  dateBox: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
}));
