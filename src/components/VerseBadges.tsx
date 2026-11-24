// Los versículos de memoria que aprendió un chico y los premios que ganó. Si no aprendió ninguno, no se muestra nada.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { childVerses } from '@/lib/culto';
import { badgesEarned, progressText, versesLabel } from '@/lib/verses';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export function BadgeRow({ count, size = 22 }: { count: number; size?: number }) {
  const earned = badgesEarned(count);
  if (!earned.length) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={tx('Premios: {map}', { map: earned.map((b) => b.name).join(', ') })}>
      {earned.map((b) => <Text key={b.at} style={{ fontSize: size }}>{b.emoji}</Text>)}
    </View>
  );
}

export function VerseBadges({ contactId }: { contactId: string }) {
  const [rows, setRows] = useState<{ reference: string; learned_on: string }[]>([]);
  useEffect(() => {
    let alive = true;
    childVerses(contactId).then((r) => { if (alive) setRows(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [contactId]);
  if (!rows.length) return null;
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('Versículos de memoria · {versesLabel}', { versesLabel: versesLabel(rows.length) })}</Text>
        <BadgeRow count={rows.length} />
      </View>
      <Text style={{ fontSize: 13, color: colors.muted }}>{progressText(rows.length)}</Text>
      <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{rows.map((r) => r.reference).join(' · ')}</Text>
    </Card>
  );
}
