// Mis notas: todos mis apuntes de los estudios, para volver a leerlos.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { fmtRelativeDay } from '@/lib/format';
import { colors } from '@/theme';

type Note = { kind: 'article' | 'training' | 'material'; ref: string; title: string; body: string; updated_at: string };

export default function MisNotas() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[] | null>(null);
  useFocusEffect(useCallback(() => {
    supabase.from('study_notes').select('kind, ref, title, body, updated_at').order('updated_at', { ascending: false }).then(({ data }) => setNotes((data as Note[]) ?? []));
  }, []));
  const open = (n: Note) => router.push((n.kind === 'article' ? `/crecimiento/${n.ref}` : n.kind === 'training' ? `/capacitacion/${n.ref}` : `/material/${n.ref}`) as Href);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mis notas" subtitle="Tus apuntes de los estudios. Solo los ves vos" back />
      <Screen>
        {notes === null ? <Loading /> : !notes.length ? (
          <Empty icon="edit-3" title="Todavía no escribiste notas" />
        ) : notes.map((n) => (
          <Pressable key={`${n.kind}-${n.ref}`} onPress={() => open(n)} accessibilityRole="button">
            <Card style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }} numberOfLines={1}>{n.title || 'Estudio'}</Text>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </View>
              <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }} numberOfLines={3}>{n.body}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{fmtRelativeDay(n.updated_at)}</Text>
            </Card>
          </Pressable>
        ))}
      </Screen>
    </View>
  );
}
