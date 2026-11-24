// Las reacciones que tiene un mensaje, debajo del globo: "❤️ 3  🙏 1". Tocar una la pone o la saca; mantener apretado dice quiénes.
import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { Reaction } from '@/lib/reactions';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export function ReactionChips({ list, mine, indent = 0, onToggle }: { list: Reaction[] | undefined; mine: boolean; indent?: number; onToggle?: (emoji: string) => void }) {
  if (!list?.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -3, marginBottom: 2, alignSelf: mine ? 'flex-end' : 'flex-start', marginLeft: mine ? 0 : indent, marginRight: mine ? 6 : 0 }}>
      {list.map((r) => (
        <Pressable key={r.emoji} onPress={onToggle ? () => onToggle(r.emoji) : undefined} delayLongPress={300}
          onLongPress={() => Alert.alert(r.emoji, r.names.join(', ') + (r.total > r.names.length ? tx(' y {n} más', { n: r.total - r.names.length }) : ''))}
          accessibilityRole="button" accessibilityLabel={tx('Reacción {emoji}, {n}', { emoji: r.emoji, n: r.total })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, height: 24, borderRadius: 12, backgroundColor: r.mine ? colors.greenSoft : colors.bg, borderWidth: 1, borderColor: r.mine ? colors.green : colors.border }}>
          <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
          {r.total > 1 ? <Text style={{ fontSize: 12, fontWeight: '800', color: r.mine ? colors.greenText : colors.muted }}>{r.total}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}
