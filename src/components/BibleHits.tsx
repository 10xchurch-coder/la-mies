// La lista de lo que se encontró en la Biblia, agrupada por libro. La usan "Buscar" y la concordancia.
// Cada libro muestra cuántos hay; al tocarlo se abren sus versículos. Tocar la cita abre el capítulo;
// tocar una palabra del versículo muestra todos los versículos que la tienen (concordancia).
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card } from '@/components/ui';
import { bookNameIn, chapterText, chaptersIn, type BibleVersion } from '@/lib/bible';
import { pieces, type BookHits, type Hit, type Query } from '@/lib/bibleStudy';
import { colors } from '@/theme';

const STEP = 40;

export function BibleHits({ version, books, query, unit, bars, onOpen, onWord }: {
  version: BibleVersion; books: BookHits[]; query: Query | null;
  /** Qué se cuenta al lado de cada libro. */
  unit: 'versículos' | 'veces';
  /** Una barrita por libro, para comparar de un vistazo dónde aparece más. */
  bars?: boolean;
  onOpen: (book: number, hit: Hit) => void;
  onWord?: (word: string) => void;
}) {
  const [open, setOpen] = useState<Record<number, number>>({});
  // Con un solo libro, o pocos versículos en total, se muestra todo abierto de entrada.
  useEffect(() => {
    const few = books.reduce((n, b) => n + b.hits.length, 0) <= 12;
    setOpen(books.length === 1 || few ? Object.fromEntries(books.map((b) => [b.book, STEP])) : {});
  }, [books]);
  const max = Math.max(1, ...books.map((b) => (unit === 'veces' ? b.count : b.hits.length)));

  return (
    <Card style={{ paddingVertical: 2 }}>
      {books.map((b, k) => {
        const n = unit === 'veces' ? b.count : b.hits.length;
        const showing = open[b.book] ?? 0;
        const name = bookNameIn(version, b.book);
        const single = chaptersIn(b.book) === 1;
        return (
          <View key={b.book} style={k ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
            <Pressable onPress={() => setOpen((o) => ({ ...o, [b.book]: showing ? 0 : STEP }))} accessibilityRole="button" accessibilityState={{ expanded: showing > 0 }}
              accessibilityLabel={`${name}, ${n} ${unit === 'veces' && n === 1 ? 'vez' : unit === 'versículos' && n === 1 ? 'versículo' : unit}`} style={{ paddingVertical: 12, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{name}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.blueText }}>{n}</Text>
                <Feather name={showing ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray} />
              </View>
              {bars ? (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.blueSoft }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.blue, width: `${Math.max(2, Math.round((n / max) * 100))}%` }} />
                </View>
              ) : null}
            </Pressable>
            {showing ? (
              <View style={{ gap: 12, paddingBottom: 12 }}>
                {b.hits.slice(0, showing).map((h) => {
                  const text = chapterText(version, b.book, h.chapter)[h.verse - 1] ?? '';
                  const ref = single ? `${name} ${h.verse}` : `${name} ${h.chapter}:${h.verse}`;
                  return (
                    <View key={`${h.chapter}:${h.verse}`} style={{ gap: 2 }}>
                      <Pressable onPress={() => onOpen(b.book, h)} accessibilityRole="button" accessibilityLabel={`Abrir ${ref}`} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.blueText }}>{ref}</Text>
                        <Feather name="chevron-right" size={15} color={colors.blueText} />
                      </Pressable>
                      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>
                        {pieces(text, query).map((p, i) => (p.word
                          ? <Text key={i} onPress={onWord ? () => onWord(p.word) : undefined} suppressHighlighting style={p.hit ? { fontWeight: '800', backgroundColor: colors.blueSoft, color: colors.blueText } : undefined}>{p.text}</Text>
                          : p.text))}
                      </Text>
                    </View>
                  );
                })}
                {b.hits.length > showing ? <Button title={`Ver más de ${name} (${b.hits.length - showing})`} variant="ghost" small icon="chevron-down" onPress={() => setOpen((o) => ({ ...o, [b.book]: showing + STEP * 2 }))} /> : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
