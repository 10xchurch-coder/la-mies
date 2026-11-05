// Capacitación: consejos, artículos y videos cortos, por tema.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, SectionTitle } from '@/components/ui';
import { listTraining } from '@/lib/api';
import { colors, themed } from '@/theme';
import type { TrainingItem } from '@/types';

export default function Capacitacion() {
  const router = useRouter();
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [q, setQ] = useState('');

  useFocusEffect(
    useCallback(() => {
      listTraining().then(setItems).catch(() => undefined);
    }, []),
  );

  const grouped = useMemo(() => {
    const s = q.trim().toLowerCase();
    const map = new Map<string, TrainingItem[]>();
    for (const it of items) {
      if (s && !`${it.title} ${it.summary ?? ''} ${it.category}`.toLowerCase().includes(s)) continue;
      if (!map.has(it.category)) map.set(it.category, []);
      map.get(it.category)!.push(it);
    }
    return [...map.entries()];
  }, [items, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Capacitación" subtitle="Para aprender antes de salir y repasar después" back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={styles.search}>
          <Feather name="search" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar un tema o una pregunta" placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} accessibilityLabel="Buscar" />
        </View>
      </View>
      <Screen>
        {grouped.length ? (
          grouped.map(([cat, list]) => (
            <View key={cat} style={{ gap: 8 }}>
              <SectionTitle>{cat}</SectionTitle>
              {list.map((it) => (
                <Pressable key={it.id} onPress={() => router.push({ pathname: '/capacitacion/[id]', params: { id: it.id } })} accessibilityRole="button">
                  <Card style={styles.item}>
                    <View style={[styles.icon, { backgroundColor: it.kind === 'video' ? colors.blueSoft : colors.greenSoft }]}>
                      <Feather name={it.kind === 'video' ? 'play' : 'file-text'} size={20} color={it.kind === 'video' ? colors.blueText : colors.greenText} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{it.title}</Text>
                      {it.summary ? <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }} numberOfLines={2}>{it.summary}</Text> : null}
                      <Text style={{ fontSize: 11, color: colors.muted }}>{it.kind === 'video' ? 'Video' : 'Para leer'}{it.minutes ? ` · ${it.minutes} min` : ''}</Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.muted} />
                  </Card>
                </Pressable>
              ))}
            </View>
          ))
        ) : (
          <Empty icon="book-open" title="Todavía no hay material cargado" text="El administrador puede cargar consejos, artículos y videos desde el panel de Supabase (tabla training_items)." />
        )}
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
}));
