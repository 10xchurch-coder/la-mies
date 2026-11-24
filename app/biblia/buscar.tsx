// Buscar en la Biblia: una palabra, varias palabras o una frase exacta, sin importar tildes ni mayúsculas.
// También entiende una cita ("Juan 3:16") y lleva directo ahí. Lo encontrado sale agrupado por libro.
// Al tocar una palabra de un versículo se abre la concordancia de esa palabra.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { BibleHits } from '@/components/BibleHits';
import { BibleVersionChips } from '@/components/BibleVersionChips';
import { Button, Card, Empty } from '@/components/ui';
import { bookNameIn, chaptersIn, versionOf, type BibleVersion } from '@/lib/bible';
import { makeQuery, parseRef, searchBibleAsync, type Query, type SearchResult } from '@/lib/bibleStudy';
import { loadBiblePrefs, saveBiblePrefs } from '@/lib/bibleStore';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function BuscarBiblia() {
  const router = useRouter();
  const params = useLocalSearchParams<{ v?: string; q?: string }>();
  const [version, setVersion] = useState<BibleVersion>(versionOf(params.v));
  const [text, setText] = useState(params.q ?? '');
  const [phrase, setPhrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ result: SearchResult; query: Query; asked: string } | null>(null);
  const [nothing, setNothing] = useState(false);
  const run = useRef(0);
  const en = version.lang === 'en';

  // Si se entra sin versión elegida, se usa la última con la que se leyó.
  useEffect(() => { if (!params.v) loadBiblePrefs().then((p) => setVersion(versionOf(p.version))); }, [params.v]);
  useEffect(() => () => { run.current++; }, []);

  const place = parseRef(text, version);
  const placeLabel = place
    ? `${bookNameIn(version, place.book)}${chaptersIn(place.book) === 1 ? (place.verse ? ` ${place.verse}` : '') : ` ${place.chapter}${place.verse ? `:${place.verse}` : ''}`}`
    : '';

  const search = async (ver = version, asPhrase = phrase) => {
    const q = makeQuery(text, asPhrase);
    const id = ++run.current;
    setNothing(false);
    if (!q) { setFound(null); setBusy(false); return; }
    setBusy(true);
    const result = await searchBibleAsync(ver, q, () => run.current === id);
    if (!result) return;
    setFound({ result, query: q, asked: text.trim() });
    setNothing(!result.verses);
    setBusy(false);
  };
  const changeVersion = (v: BibleVersion) => {
    setVersion(v);
    loadBiblePrefs().then((p) => saveBiblePrefs({ ...p, version: v.id }));
    if (found || nothing) search(v);
  };
  const changeMode = (p: boolean) => { setPhrase(p); if (found || nothing) search(version, p); };
  const openPlace = (book: number, chapter: number, verse?: number) =>
    router.push({ pathname: '/biblia/leer', params: { libro: String(book), cap: String(chapter), v: version.id, ...(verse ? { ver: String(verse) } : {}) } });

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: on ? colors.blueSoft : colors.bg }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.blueText : colors.text }}>{label}</Text>
    </Pressable>
  );
  const words = makeQuery(text)?.words.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Buscar en la Biblia')} subtitle={version.name} back />
      <Screen>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12 }}>
            <Feather name="search" size={19} color={colors.muted} />
            <TextInput value={text} onChangeText={setText} onSubmitEditing={() => search()} returnKeyType="search" autoFocus={!params.q} autoCorrect={false} autoCapitalize="none"
              placeholder={en ? tx('Una palabra, una frase o “John 3:16”') : tx('Una palabra, una frase o “Juan 3:16”')} placeholderTextColor={colors.muted} accessibilityLabel={tx('Qué querés buscar')}
              style={{ flex: 1, fontSize: 17, color: colors.text, paddingVertical: 12 }} />
            {text ? <Pressable onPress={() => { setText(''); setFound(null); setNothing(false); run.current++; setBusy(false); }} accessibilityRole="button" accessibilityLabel={tx('Borrar')} hitSlop={10}><Feather name="x" size={20} color={colors.muted} /></Pressable> : null}
          </View>
          <BibleVersionChips value={version.id} onChange={changeVersion} />
          {words > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {chip(tx('Todas las palabras'), !phrase, () => changeMode(false))}
              {chip(tx('La frase exacta'), phrase, () => changeMode(true))}
            </View>
          ) : null}
          <Button title={tx('Buscar')} icon="search" onPress={() => search()} disabled={!words} loading={busy} />
        </View>

        {place ? (
          <Pressable onPress={() => openPlace(place.book, place.chapter, place.verse)} accessibilityRole="button" accessibilityLabel={tx('Ir a {placeLabel}', { placeLabel })}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.blueSoft }}>
              <Feather name="book-open" size={22} color={colors.blueText} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.blueText }}>{tx('IR A')}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{placeLabel}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.blueText} />
            </Card>
          </Pressable>
        ) : null}

        {busy && !found ? <ActivityIndicator color={colors.blue} style={{ marginTop: 12 }} /> : null}
        {nothing && !busy ? (
          <Empty icon="search" title={tx('No se encontró nada')} text={en
            ? tx('Revisá cómo está escrito. Estás buscando en la Biblia en inglés.')
            : tx('Revisá cómo está escrito, o probá con menos palabras. Esta Biblia es de 1909 y usa algunas palabras antiguas.')} />
        ) : null}
        {found && found.result.verses ? (
          <>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                {found.result.verses === 1 ? tx('1 versículo') : tx('{verses} versículos', { verses: found.result.verses })} {tx('en')} {found.result.books.length === 1 ? tx('1 libro') : tx('{n} libros', { n: found.result.books.length })}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Tocá un libro para ver sus versículos. Tocá la cita para abrir el capítulo, o una palabra para ver dónde más aparece.')}</Text>
            </View>
            <BibleHits version={version} books={found.result.books} query={found.query} unit="versículos"
              onOpen={(book, h) => openPlace(book, h.chapter, h.verse)}
              onWord={(w) => router.push({ pathname: '/biblia/concordancia', params: { p: w, v: version.id } })} />
          </>
        ) : null}
        {!found && !busy && !place && !nothing ? (
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
            {tx('No hace falta poner tildes ni mayúsculas. Para ir a un versículo, escribí la cita: {pl}.', { pl: en ? tx('“John 3:16” o “Ps 23”') : tx('“Juan 3:16”, “Sal 23” o “1 Co 13”') })}
          </Text>
        ) : null}
      </Screen>
    </View>
  );
}
