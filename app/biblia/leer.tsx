// Leer un capítulo de la Biblia: letra grande, pasar al anterior o siguiente, tocar versículos para copiar o compartir.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button } from '@/components/ui';
import { bookName, chapterText, chaptersIn, cleanPlace, neighbor, shareVerses, versionOf } from '@/lib/bible';
import { DEFAULT_PREFS, SIZES, loadBiblePrefs, saveBiblePrefs } from '@/lib/bibleStore';
import { shareText } from '@/lib/share';
import { colors } from '@/theme';

export default function LeerBiblia() {
  const router = useRouter();
  const params = useLocalSearchParams<{ libro?: string; cap?: string; v?: string }>();
  const place = cleanPlace(params.libro, params.cap) ?? { book: DEFAULT_PREFS.book, chapter: 1 };
  const { book, chapter } = place;
  const version = versionOf(params.v);
  const [size, setSize] = useState(DEFAULT_PREFS.size);
  const [picked, setPicked] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);

  const verses = useMemo(() => chapterText(version, book, chapter), [version, book, chapter]);
  const prev = neighbor(book, chapter, -1);
  const next = neighbor(book, chapter, 1);
  const single = chaptersIn(book) === 1;

  // La letra elegida se recuerda; y dónde se quedó, para "Seguir leyendo".
  useEffect(() => { loadBiblePrefs().then((p) => setSize(p.size)); }, []);
  useEffect(() => { saveBiblePrefs({ version: version.id, book, chapter, size }); }, [version.id, book, chapter, size]);
  useEffect(() => { setPicked([]); setCopied(false); }, [book, chapter]);

  const open = (p: { book: number; chapter: number }) =>
    router.replace({ pathname: '/biblia/leer', params: { libro: String(p.book), cap: String(p.chapter), v: version.id } });

  const bump = (dir: 1 | -1) => {
    const i = SIZES.indexOf(size);
    const j = Math.max(0, Math.min(SIZES.length - 1, (i < 0 ? 1 : i) + dir));
    setSize(SIZES[j]);
  };

  const toggle = (n: number) => { setCopied(false); setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n])); };
  const text = () => shareVerses(version, book, chapter, picked);

  const sizeBtn = (label: string, dir: 1 | -1, enabled: boolean) => (
    <Pressable onPress={() => bump(dir)} disabled={!enabled} accessibilityRole="button" accessibilityLabel={dir > 0 ? 'Letra más grande' : 'Letra más chica'}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.4 }}>
      <Text style={{ fontSize: dir > 0 ? 19 : 14, fontWeight: '800', color: colors.blueText }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={single ? bookName(book) : `${bookName(book)} ${chapter}`} subtitle={version.name} back
        right={<View style={{ flexDirection: 'row', gap: 8 }}>{sizeBtn('A', -1, size > SIZES[0])}{sizeBtn('A', 1, size < SIZES[SIZES.length - 1])}</View>} />
      <Screen key={`${book}-${chapter}`}>
        <Text style={{ fontSize: size, lineHeight: Math.round(size * 1.65), color: colors.text }}>
          {verses.map((t, i) => {
            const n = i + 1;
            const on = picked.includes(n);
            return (
              <Text key={n} onPress={() => toggle(n)} accessibilityRole="button" accessibilityLabel={`Versículo ${n}`}
                style={on ? { backgroundColor: colors.blueSoft } : undefined}>
                <Text style={{ fontSize: Math.round(size * 0.62), fontWeight: '800', color: colors.blueText }}>{`${n} `}</Text>
                {`${t} `}
              </Text>
            );
          })}
        </Text>
        {!picked.length ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Tocá un versículo para copiarlo o compartirlo.</Text> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Anterior" icon="chevron-left" variant="outline" disabled={!prev} onPress={() => prev && open(prev)} style={{ flex: 1 }} />
          <Button title="Siguiente" icon="chevron-right" disabled={!next} onPress={() => next && open(next)} style={{ flex: 1 }} />
        </View>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{version.notice}</Text>
      </Screen>
      {picked.length ? (
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
          <Button title={copied ? 'Copiado' : 'Copiar'} icon={copied ? 'check' : 'copy'} variant="outline" style={{ flex: 1 }}
            onPress={() => { Clipboard.setStringAsync(text()).then(() => setCopied(true)).catch(() => undefined); }} />
          <Button title="Compartir" icon="share-2" style={{ flex: 1 }} onPress={() => { shareText(text(), `${bookName(book)} ${chapter}`).catch(() => undefined); }} />
          <Pressable onPress={() => { setPicked([]); setCopied(false); }} accessibilityRole="button" accessibilityLabel="Quitar selección"
            style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
