// Todo lo que la persona marcó en su Biblia: notas, resaltados y versículos guardados. Tocar uno abre ese versículo.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading } from '@/components/ui';
import { bookName, chapterText, versionOf } from '@/lib/bible';
import { MARK_COLORS } from '@/lib/bibleLook';
import { myMarks, type BibleMark } from '@/lib/bibleMarks';
import { loadBiblePrefs } from '@/lib/bibleStore';
import { colors } from '@/theme';

type Tab = 'notas' | 'resaltados' | 'guardados';
const TABS: { id: Tab; label: string; icon: React.ComponentProps<typeof Feather>['name']; empty: string }[] = [
  { id: 'notas', label: 'Notas', icon: 'edit-3', empty: 'Tocá un versículo y elegí “Nota” para escribir lo que querés recordar.' },
  { id: 'resaltados', label: 'Resaltados', icon: 'droplet', empty: 'Tocá un versículo y elegí un color para resaltarlo.' },
  { id: 'guardados', label: 'Guardados', icon: 'star', empty: 'Tocá un versículo y elegí “Guardar” para tenerlo siempre a mano.' },
];

export default function MisMarcas() {
  const router = useRouter();
  const [rows, setRows] = useState<BibleMark[] | null>(null);
  const [tab, setTab] = useState<Tab>('notas');
  const [versionId, setVersionId] = useState<string | undefined>();
  const version = versionOf(versionId);

  useFocusEffect(useCallback(() => {
    loadBiblePrefs().then((p) => setVersionId(p.version));
    myMarks().then(setRows).catch(() => setRows([]));
  }, []));

  const list = useMemo(() => (rows ?? []).filter((m) => (tab === 'notas' ? !!m.note : tab === 'resaltados' ? !!m.color : m.saved)), [rows, tab]);
  const count = (t: Tab) => (rows ?? []).filter((m) => (t === 'notas' ? !!m.note : t === 'resaltados' ? !!m.color : m.saved)).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mis notas y resaltados" subtitle="Solo vos las ves" back />
      <Screen>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: on ? colors.blueSoft : colors.bg }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: on ? colors.blueText : colors.text }}>{rows ? count(t.id) : '–'}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: on ? colors.blueText : colors.muted }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {rows === null ? <Loading /> : !list.length ? <Empty icon={TABS.find((t) => t.id === tab)!.icon} title="Todavía no hay nada acá" text={TABS.find((t) => t.id === tab)!.empty} /> : null}
        {list.map((m) => {
          const text = chapterText(version, m.book, m.chapter)[m.verse - 1] ?? '';
          const dot = MARK_COLORS.find((c) => c.id === m.color)?.dot;
          return (
            <Pressable key={`${m.book}-${m.chapter}-${m.verse}`} accessibilityRole="button"
              onPress={() => router.push({ pathname: '/biblia/leer', params: { libro: String(m.book), cap: String(m.chapter), v: version.id, ver: String(m.verse) } })}>
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {dot ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot }} /> : null}
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{bookName(m.book)} {m.chapter}:{m.verse}</Text>
                  {m.saved ? <Feather name="star" size={15} color={colors.blueText} /> : null}
                  <Feather name="chevron-right" size={18} color={colors.muted} />
                </View>
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }} numberOfLines={3}>{text}</Text>
                {m.note ? (
                  <View style={{ backgroundColor: colors.blueSoft, borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontSize: 14, color: colors.blueText, lineHeight: 20 }}>{m.note}</Text>
                  </View>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
      </Screen>
    </View>
  );
}
