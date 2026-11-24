// La Biblia: elegir un libro y un capítulo, o seguir donde se quedó. También: buscar, cambiar de versión (español o inglés)
// y ver de dónde sale cada texto.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { BibleVersionChips } from '@/components/BibleVersionChips';
import { Card, SectionTitle } from '@/components/ui';
import { OT_COUNT, bookNameIn, chaptersIn, versionOf, type BibleVersion } from '@/lib/bible';
import { BOOKS } from '@/lib/biblePlan';
import { DEFAULT_PREFS, loadBiblePrefs, saveBiblePrefs, type BiblePrefs } from '@/lib/bibleStore';
import { colors } from '@/theme';

export default function Biblia() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<BiblePrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const version = versionOf(prefs.version);
  const bookName = (i: number) => bookNameIn(version, i);
  /** Cambia la Biblia en la que se lee y se busca. Las notas y resaltados siguen ahí: van por versículo, no por versión. */
  const pickVersion = (v: BibleVersion) => { const next = { ...prefs, version: v.id }; setPrefs(next); saveBiblePrefs(next); };

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
        <Pressable onPress={() => router.push({ pathname: '/biblia/buscar', params: { v: version.id } })} accessibilityRole="button" accessibilityLabel="Buscar en la Biblia">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="search" size={20} color={colors.blueText} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Buscar en la Biblia</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>Una palabra, una frase o una cita como “{bookName(42)} 3:16”</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </Card>
        </Pressable>
        <Pressable onPress={() => router.push('/biblia/marcas')} accessibilityRole="button" accessibilityLabel="Mis notas y resaltados">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="edit-3" size={20} color={colors.blueText} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Mis notas y resaltados</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>Lo que marcaste y guardaste al leer</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </Card>
        </Pressable>
        <BibleVersionChips value={version.id} onChange={pickVersion} />
        <SectionTitle>Antiguo Testamento</SectionTitle>
        {books(0, OT_COUNT)}
        <SectionTitle>Nuevo Testamento</SectionTitle>
        {books(OT_COUNT, BOOKS.length)}
        <Pressable onPress={() => router.push('/biblia/textos')} accessibilityRole="button" accessibilityLabel="Acerca de los textos: de dónde sale cada Biblia" hitSlop={8}>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{version.notice}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.blueText, textAlign: 'center', marginTop: 4 }}>Acerca de los textos</Text>
        </Pressable>
      </Screen>
    </View>
  );
}
