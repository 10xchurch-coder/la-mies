// Texto con formato simple: "# título", "## subtítulo", "- viñeta", "> versículo" y **negrita**.
import React from 'react';
import { Text, View } from 'react-native';
import { colors } from '@/theme';

function Inline({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <Text style={style}>{parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <Text key={i} style={{ fontWeight: '800' }}>{p.slice(2, -2)}</Text> : p))}</Text>;
}

export function Article({ body }: { body: string }) {
  const base = { fontSize: 16, lineHeight: 25, color: colors.text };
  return (
    <View style={{ gap: 10 }}>
      {body.split('\n').map((line, i) => {
        const t = line.trimEnd();
        if (!t.trim()) return <View key={i} style={{ height: 2 }} />;
        if (t.startsWith('## ')) return <Text key={i} style={{ fontSize: 19, fontWeight: '800', color: colors.green, marginTop: 12 }}>{t.slice(3)}</Text>;
        if (t.startsWith('# ')) return <Text key={i} style={{ fontSize: 23, fontWeight: '800', color: colors.text }}>{t.slice(2)}</Text>;
        if (t.startsWith('> ')) {
          return (
            <View key={i} style={{ borderLeftWidth: 4, borderLeftColor: colors.green, backgroundColor: colors.greenSoft, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Inline text={t.slice(2)} style={{ ...base, fontStyle: 'italic' }} />
            </View>
          );
        }
        if (/^\s*[-•] /.test(t)) return <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}><Text style={base}>•</Text><Inline text={t.replace(/^\s*[-•] /, '')} style={{ ...base, flex: 1 }} /></View>;
        return <Inline key={i} text={t} style={base} />;
      })}
    </View>
  );
}
