// La Biblia: elegir un libro y un capítulo, o seguir donde se quedó.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, SectionTitle } from '@/components/ui';
import { OT_COUNT, bookName, chaptersIn, versionOf } from '@/lib/bible';
import { BOOKS } from '@/lib/biblePlan';
import { DEFAULT_PREFS, loadBiblePrefs, type BiblePrefs } from '@/lib/bibleStore';
import { colors } from '@/theme';

export default function Biblia() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<BiblePrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const version = versionOf(prefs.version);

  useFocusEffect(useCallback(() => {
    loadBiblePrefs().then((p) => { setPrefs(p); setSaved(true); });
  }, []));

  const go = (book: number, chapter: number) =>
    router.push({ pathname: '/biblia/leer', params: { libro: String(book), cap: String(chapter), v: version.id } });

  const row = (i: number) => {
    const isOpen = open === i;
    const one = chaptersIn(i) === 1;
    return (
      <View key={i}>
        <Pressable onPress={() => (one ? go(i, 1) : setOpen(isOpen ? null : i))} accessibilityRole="button" accessibilityLabel={`${bookName(i)}, ${chaptersIn(i)} ${one ? 'capítulo' : 'capítulos'}`}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 }}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{bookName(i)}</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>{chaptersIn(i)}</Text>
          <Feather name={one ? 'chevron-right' : isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray} />
        </Pressable>
        {isOpen ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
            {Array.from({ length: chaptersIn(i) }, (_, k) => k + 1).map((c) => (
              <Pressable key={c} onPress={() => go(i, c)} accessibilityRole="button" accessibilityLabel={`${bookName(i)} ${c}`}
                style={{ minWidth: 46, height: 42, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.blueText }}>{c}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const books = (from: number, to: number) => (
    <Card style={{ paddingVertical: 2 }}>
      {Array.from({ length: to - from }, (_, k) => from + k).map((i, k) => (
        <View key={i} style={k ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>{row(i)}</View>
      ))}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Biblia" subtitle={version.name} back />
      <Screen>
        {saved ? (
          <Pressable onPress={() => go(prefs.book, prefs.chapter)} accessibilityRole="button" accessibilityLabel={`Seguir leyendo: ${bookName(prefs.book)} ${prefs.chapter}`}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.blueSoft }}>
              <Feather name="book-open" size={22} color={colors.blueText} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.blueText }}>SEGUIR LEYENDO</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{bookName(prefs.book)}{BOOKS[prefs.book][1] === 1 ? '' : ` ${prefs.chapter}`}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.blueText} />
            </Card>
          </Pressable>
        ) : null}
        <SectionTitle>Antiguo Testamento</SectionTitle>
        {books(0, OT_COUNT)}
        <SectionTitle>Nuevo Testamento</SectionTitle>
        {books(OT_COUNT, BOOKS.length)}
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{version.notice}</Text>
      </Screen>
    </View>
  );
}
