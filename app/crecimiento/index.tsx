// Crecimiento espiritual: para leer y crecer. Arriba "¿Cómo ser salvo?"; después carpetas:
// Lo que creemos, Preguntas y respuestas, Finanzas bíblicas. Se busca en todo.
// Con ?seccion=… se abre una carpeta.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading, SectionTitle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type Row = { id: string; slug: string; section: string; title: string; summary: string | null; sort_order: number; body?: string };
type IconName = React.ComponentProps<typeof Feather>['name'];

const FOLDERS: { section: string; icon: IconName; hint: string; bg: string; fg: string }[] = [
  { section: 'Lo que creemos', icon: 'book-open', hint: 'Las doctrinas de la iglesia, explicadas con la Biblia', bg: 'greenSoft', fg: 'greenText' },
  { section: 'Preguntas y respuestas', icon: 'help-circle', hint: 'Las preguntas más comunes sobre la fe', bg: 'blueSoft', fg: 'blueText' },
  { section: 'Finanzas bíblicas', icon: 'dollar-sign', hint: 'El dinero, el trabajo, las deudas y los negocios según Dios', bg: 'amberSoft', fg: 'amberText' },
];
const pal = colors as unknown as Record<string, string>;

function ArticleRow({ r, icon, onPress }: { r: Row; icon: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={19} color={colors.greenText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.title}</Text>
          {r.summary ? <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }} numberOfLines={2}>{r.summary}</Text> : null}
        </View>
        <Feather name="chevron-right" size={18} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

export default function Crecimiento() {
  const router = useRouter();
  const { seccion } = useLocalSearchParams<{ seccion?: string }>();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    supabase.from('growth_articles').select('id, slug, section, title, summary, sort_order, body').order('sort_order').then(({ data }) => setRows((data as Row[]) ?? []));
  }, []);
  useFocusEffect(load);

  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const s = n(q.trim());
  const found = useMemo(() => (s ? (rows ?? []).filter((r) => (!seccion || r.section === seccion) && n(`${r.title} ${r.summary ?? ''} ${r.body ?? ''}`).includes(s)) : []), [rows, s, seccion]);
  const open = (r: Row) => router.push(`/crecimiento/${r.slug}` as Href);
  const folder = FOLDERS.find((f) => f.section === seccion);
  const inFolder = (rows ?? []).filter((r) => r.section === seccion);
  const first = (rows ?? []).filter((r) => r.section === 'Lo primero');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={seccion ?? 'Crecimiento'} subtitle={folder ? `${inFolder.length} temas` : 'Para leer, aprender y crecer en la fe'} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input }}>
          <Feather name="search" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={seccion ? `Buscar en ${seccion.toLowerCase()}` : 'Buscar: bautismo, deudas, oración…'} placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 15, color: colors.text }} accessibilityLabel="Buscar" />
        </View>
      </View>
      <Screen>
        {rows === null ? <Loading /> : s ? (
          found.length ? found.map((r) => <ArticleRow key={r.id} r={r} icon="search" onPress={() => open(r)} />) : <Empty icon="book-open" title="No encontramos ese tema" />
        ) : seccion ? (
          inFolder.length ? inFolder.map((r) => <ArticleRow key={r.id} r={r} icon={folder?.icon ?? 'book-open'} onPress={() => open(r)} />) : <Empty icon="book-open" title="Todavía no hay material" />
        ) : (
          <>
            {first.map((r) => (
              <Pressable key={r.id} onPress={() => open(r)} accessibilityRole="button">
                <Card style={{ gap: 6, backgroundColor: colors.green, borderColor: colors.green, padding: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1, opacity: 0.9 }}>LO PRIMERO</Text>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFFFF' }}>{r.title}</Text>
                  {r.summary ? <Text style={{ fontSize: 13, color: '#FFFFFF', opacity: 0.92, lineHeight: 19 }}>{r.summary}</Text> : null}
                </Card>
              </Pressable>
            ))}
            <SectionTitle>Carpetas</SectionTitle>
            {FOLDERS.map((f) => {
              const count = (rows ?? []).filter((r) => r.section === f.section).length;
              if (!count) return null;
              return (
                <Pressable key={f.section} onPress={() => router.push({ pathname: '/crecimiento', params: { seccion: f.section } } as unknown as Href)} accessibilityRole="button">
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
                    <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: pal[f.bg], alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={f.icon} size={24} color={pal[f.fg]} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{f.section}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{f.hint} · {count} temas</Text>
                    </View>
                    <Feather name="folder" size={18} color={colors.muted} />
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}
      </Screen>
    </View>
  );
}
