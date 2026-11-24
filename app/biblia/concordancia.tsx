// Concordancia: todos los versículos de la Biblia que tienen una palabra, y cuántas veces aparece en cada libro.
// Se llega tocando una palabra en "Buscar en la Biblia".
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { BibleHits } from '@/components/BibleHits';
import { Card, Empty, Loading } from '@/components/ui';
import { OT_COUNT, versionOf } from '@/lib/bible';
import { fold, searchBibleAsync, type Query, type SearchResult } from '@/lib/bibleStudy';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Concordancia() {
  const router = useRouter();
  const params = useLocalSearchParams<{ p?: string; v?: string }>();
  const version = versionOf(params.v);
  const word = fold(String(params.p ?? '')).split(' ')[0] ?? '';
  const [result, setResult] = useState<SearchResult | null>(null);
  const query: Query = { words: word ? [word] : [], phrase: false };

  useEffect(() => {
    let alive = true;
    setResult(null);
    if (!word) { setResult({ total: 0, verses: 0, books: [] }); return; }
    searchBibleAsync(version, { words: [word], phrase: false }, () => alive).then((r) => { if (r && alive) setResult(r); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, version.id]);

  const sum = (from: number, to: number) => (result?.books ?? []).filter((b) => b.book >= from && b.book < to).reduce((n, b) => n + b.count, 0);
  const stat = (n: number, label: string) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: colors.blueText }}>{n}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, textAlign: 'center' }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={word ? `“${word}”` : tx('Concordancia')} subtitle={tx('Concordancia · {name}', { name: version.name })} back />
      {result === null ? <Loading /> : (
        <Screen>
          {!result.verses ? <Empty icon="search" title={tx('Esa palabra no está en esta Biblia')} text={tx('Volvé y tocá otra palabra.')} /> : (
            <>
              <Card style={{ gap: 12 }}>
                <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>
                  {tx('La palabra')} <Text style={{ fontWeight: '800' }}>{word}</Text> {tx('aparece')} <Text style={{ fontWeight: '800' }}>{result.total === 1 ? tx('1 vez') : tx('{total} veces', { total: result.total })}</Text> {tx('en')} {result.verses === 1 ? tx('1 versículo') : tx('{verses} versículos', { verses: result.verses })}.
                </Text>
                <View style={{ flexDirection: 'row' }}>
                  {stat(sum(0, OT_COUNT), tx('Antiguo Testamento'))}
                  {stat(sum(OT_COUNT, 66), tx('Nuevo Testamento'))}
                  {stat(result.books.length, result.books.length === 1 ? tx('libro') : tx('libros'))}
                </View>
              </Card>
              <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Cuántas veces aparece en cada libro. Tocá un libro para ver los versículos.')}</Text>
              <BibleHits version={version} books={result.books} query={query} unit="veces" bars
                onOpen={(book, h) => router.push({ pathname: '/biblia/leer', params: { libro: String(book), cap: String(h.chapter), v: version.id, ver: String(h.verse) } })}
                onWord={(w) => { if (w !== word) router.push({ pathname: '/biblia/concordancia', params: { p: w, v: version.id } }); }} />
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{tx('Se cuenta la palabra tal cual está escrita, sin mirar tildes ni mayúsculas.')}</Text>
            </>
          )}
        </Screen>
      )}
    </View>
  );
}
