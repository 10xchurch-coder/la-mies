// Un informe escrito. El texto viene con títulos (## …), viñetas (- …) y **negritas**.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Loading } from '@/components/ui';
import { shareText } from '@/lib/share';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

function Inline({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <Text style={style}>{parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <Text key={i} style={{ fontWeight: '800' }}>{p.slice(2, -2)}</Text> : p))}</Text>;
}

export default function Informe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [r, setR] = useState<{ title: string; body: string } | null | undefined>(undefined);
  useEffect(() => {
    supabase.from('pastor_reports').select('title, body').eq('id', id).maybeSingle().then(({ data }) => setR(data ?? null));
  }, [id]);
  if (r === undefined) return <Loading />;
  if (!r) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Informe" back /><Text style={{ padding: 24, color: colors.muted }}>No se encontró.</Text></View>;
  const base = { fontSize: 15, lineHeight: 23, color: colors.text };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={r.title} back />
      <Screen>
        <View style={{ gap: 8 }}>
          {r.body.split('\n').map((line, i) => {
            const t = line.trimEnd();
            if (!t.trim()) return <View key={i} style={{ height: 4 }} />;
            if (t.startsWith('## ')) return <Text key={i} style={{ fontSize: 18, fontWeight: '800', color: colors.green, marginTop: 10 }}>{t.slice(3)}</Text>;
            if (t.startsWith('# ')) return <Text key={i} style={{ fontSize: 21, fontWeight: '800', color: colors.text }}>{t.slice(2)}</Text>;
            if (/^\s*[-•] /.test(t)) return <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}><Text style={base}>•</Text><Inline text={t.replace(/^\s*[-•] /, '')} style={{ ...base, flex: 1 }} /></View>;
            return <Inline key={i} text={t} style={base} />;
          })}
        </View>
        <Button title="Compartir" icon="share-2" variant="outline" onPress={() => shareText(`${r.title}\n\n${r.body.replace(/\*\*/g, '')}`, r.title)} />
      </Screen>
    </View>
  );
}
