// Biblioteca de material: libros o series enteras, capítulo por capítulo.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, RowLink, SectionTitle } from '@/components/ui';
import { classTeachers, listMaterials } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Material } from '@/types';

export default function Materiales() {
  const router = useRouter();
  const { profile, isStaff } = useAuth();
  const [rows, setRows] = useState<Material[] | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listMaterials().then(setRows).catch(() => setRows([]));
      classTeachers().then((t) => setIsTeacher(t.some((x) => x.profile_id === profile?.id))).catch(() => undefined);
    }, [profile?.id]),
  );

  const series = useMemo(() => {
    const m = new Map<string, Material[]>();
    (rows ?? []).forEach((r) => m.set(r.series, [...(m.get(r.series) ?? []), r]));
    return [...m.entries()];
  }, [rows]);
  const canAdd = isStaff || isTeacher;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="Material"
        subtitle="Libros, series y apuntes para las clases"
        back
        right={canAdd ? (
          <Pressable onPress={() => router.push('/material/nuevo')} accessibilityRole="button" accessibilityLabel="Subir material" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="plus" size={22} color="#FFF" />
          </Pressable>
        ) : undefined}
      />
      <Screen>
        {rows && !rows.length ? (
          <Empty icon="book" title="Todavía no hay material" text={canAdd ? 'Tocá + para cargar el primer capítulo de un libro o serie. Podés pegar el texto y/o adjuntar un PDF.' : 'Los maestros y la secretaría pueden cargarlo.'} />
        ) : null}
        {series.map(([name, list]) => (
          <View key={name} style={{ gap: 8 }}>
            <SectionTitle right={canAdd ? <Text onPress={() => router.push({ pathname: '/material/nuevo', params: { series: name, order: String((list[list.length - 1]?.chapter_order ?? 0) + 1) } })} style={{ color: colors.green, fontWeight: '800', fontSize: 13 }}>+ Capítulo</Text> : undefined}>{name}</SectionTitle>
            <Card style={{ padding: 0 }}>
              {list.map((m) => (
                <RowLink key={m.id} icon={m.file_path ? 'file-text' : 'book-open'} title={m.title} subtitle={m.file_name ?? (m.body ? 'Texto para leer' : undefined)} onPress={() => router.push({ pathname: '/material/[id]', params: { id: m.id } })} />
              ))}
            </Card>
          </View>
        ))}
      </Screen>
    </View>
  );
}
