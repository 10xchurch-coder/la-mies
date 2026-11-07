// Crecimiento espiritual: para leer y crecer. Doctrina de la iglesia, la salvación, el bautismo,
// la Cena del Señor, el Espíritu Santo, creación y las preguntas más comunes sobre la fe, con la Biblia.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading, SectionTitle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type Row = { id: string; slug: string; section: string; title: string; summary: string | null; sort_order: number; body?: string };

const ORDER = ['Lo primero', 'Lo que creemos', 'Preguntas y respuestas'];

export default function Crecimiento() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    supabase.from('growth_articles').select('id, slug, section, title, summary, sort_order, body').order('sort_order').then(({ data }) => setRows((data as Row[]) ?? []));
  }, []);
  useFocusEffect(load);

  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const groups = useMemo(() => {
    const s = n(q.trim());
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) {
      if (s && !n(`${r.title} ${r.summary ?? ''} ${r.body ?? ''}`).includes(s)) continue;
      m.set(r.section, [...(m.get(r.section) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => (ORDER.indexOf(a[0]) + 99) % 99 - (ORDER.indexOf(b[0]) + 99) % 99);
  }, [rows, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Crecimiento" subtitle="Para leer, aprender y crecer en la fe" back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input }}>
          <Feather name="search" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar: bautismo, Trinidad, oración…" placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 15, color: colors.text }} accessibilityLabel="Buscar" />
        </View>
      </View>
      <Screen>
        {rows === null ? <Loading /> : !groups.length ? <Empty icon="book-open" title={q ? 'No encontramos ese tema' : 'Todavía no hay material'} /> : null}
        {groups.map(([section, list]) => (
          <View key={section} style={{ gap: 8 }}>
            <SectionTitle>{`${section}${section === 'Preguntas y respuestas' ? ` (${list.length})` : ''}`}</SectionTitle>
            {list.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/crecimiento/${r.slug}` as Href)} accessibilityRole="button">
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: section === 'Preguntas y respuestas' ? colors.blueSoft : colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={section === 'Preguntas y respuestas' ? 'help-circle' : 'book-open'} size={19} color={section === 'Preguntas y respuestas' ? colors.blueText : colors.greenText} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.title}</Text>
                    {r.summary ? <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }} numberOfLines={2}>{r.summary}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.muted} />
                </Card>
              </Pressable>
            ))}
          </View>
        ))}
      </Screen>
    </View>
  );
}
