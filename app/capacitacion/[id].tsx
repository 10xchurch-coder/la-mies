// Un artículo o video de capacitación.
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Loading } from '@/components/ui';
import { getTraining } from '@/lib/api';
import { colors, themed } from '@/theme';
import { Bridge } from '@/components/Bridge';
import type { TrainingItem } from '@/types';

/** Texto simple con títulos (#), subtítulos (##), viñetas (-), números (1.) y versículos (> Cita | texto). */
function Body({ text }: { text: string }) {
  return (
    <View style={{ gap: 10 }}>
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <View key={i} style={{ height: 4 }} />;
        const br = t.match(/^\[\[puente (\d)\]\]$/);
        if (br) return <Bridge key={i} step={Number(br[1])} />;
        if (t.startsWith('> ')) {
          const [ref, ...rest] = t.slice(2).split(' | ');
          // También "> «texto» Cita", como en Crecimiento.
          const g = t.slice(2).match(/^«([\s\S]+)»\s+(.+)$/);
          if (g) {
            return (
              <View key={i} style={styles.verse}>
                <Text style={styles.verseText}>{g[1]}</Text>
                <Text style={styles.verseRef}>{g[2]} · RV1960</Text>
              </View>
            );
          }
          const verse = rest.join(' | ');
          return (
            <View key={i} style={styles.verse}>
              <Text style={styles.verseText}>{verse || ref}</Text>
              {verse ? <Text style={styles.verseRef}>{ref} · RV1960</Text> : null}
            </View>
          );
        }
        const num = t.match(/^(\d+)\.\s+(.*)$/);
        if (num) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
              <Text style={[styles.p, { fontWeight: '800', color: colors.green, minWidth: 18 }]}>{num[1]}.</Text>
              <Text style={[styles.p, { flex: 1 }]}>{num[2]}</Text>
            </View>
          );
        }
        if (t.startsWith('¿') || t.startsWith('"') || t.startsWith('“')) {
          // Lo que se le dice a la persona: resaltado.
          return <Text key={i} style={styles.say}>{t}</Text>;
        }
        if (t.startsWith('## ')) return <Text key={i} style={styles.h2}>{t.slice(3)}</Text>;
        if (t.startsWith('# ')) return <Text key={i} style={styles.h1}>{t.slice(2)}</Text>;
        if (t.includes('**')) {
          const parts = t.split(/(\*\*[^*]+\*\*)/g);
          return <Text key={i} style={styles.p}>{parts.map((x, j) => (x.startsWith('**') && x.endsWith('**') ? <Text key={j} style={{ fontWeight: '800' }}>{x.slice(2, -2)}</Text> : x))}</Text>;
        }
        if (t.startsWith('- ') || t.startsWith('• ')) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
              <Text style={styles.p}>•</Text>
              <Text style={[styles.p, { flex: 1 }]}>{t.slice(2)}</Text>
            </View>
          );
        }
        return <Text key={i} style={styles.p}>{t}</Text>;
      })}
    </View>
  );
}

export default function CapacitacionDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<TrainingItem | null | undefined>(undefined);

  useEffect(() => {
    getTraining(id).then(setItem).catch(() => setItem(null));
  }, [id]);

  if (item === undefined) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={item?.title ?? 'Capacitación'} subtitle={item ? `${item.category}${item.minutes ? ` · ${item.minutes} min` : ''}` : undefined} back />
      <Screen>
        {!item ? (
          <Text style={{ color: colors.muted }}>No se encontró este material.</Text>
        ) : (
          <>
            {item.kind === 'video' && item.video_url ? (
              <Button title="Ver el video" icon="play" onPress={() => Linking.openURL(item.video_url as string)} />
            ) : null}
            {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
            {item.body ? <Body text={item.body} /> : null}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  summary: { fontSize: 15, fontWeight: '600', color: colors.greenText, backgroundColor: colors.greenSoft, padding: 12, borderRadius: 12, lineHeight: 21 },
  h1: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 6 },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  p: { fontSize: 15, lineHeight: 23, color: colors.text },
  verse: { padding: 14, borderRadius: 12, backgroundColor: colors.bgSoft, borderLeftWidth: 4, borderLeftColor: colors.green, gap: 6 },
  verseText: { fontSize: 15, lineHeight: 23, color: colors.text, fontStyle: 'italic' },
  verseRef: { fontSize: 12, fontWeight: '800', color: colors.green },
  say: { fontSize: 16, lineHeight: 24, color: colors.text, fontWeight: '700', paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.amber },
}));
