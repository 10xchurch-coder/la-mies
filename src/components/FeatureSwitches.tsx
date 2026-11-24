// La lista de funciones para prender y apagar, en grupos. La usan "Funciones de la iglesia" (en Ajustes) y los primeros pasos.
// Las partes de una función van abajo de ella, corridas a la derecha: si la función está apagada, sus partes no se ven.
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, SectionTitle, Toggle } from '@/components/ui';
import { FEATURE_GROUPS, childrenOf, featureOn, searchFeatures, topFeatures, type Feature, type FeatureKey } from '@/lib/features';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export function FeatureSwitches({ off, onChange, disabled, search, showHides, foldParts, after }: {
  /** Lo que está apagado ahora. */
  off: readonly FeatureKey[];
  onChange: (key: FeatureKey, enabled: boolean) => void;
  disabled?: boolean;
  /** Mostrar el buscador arriba. */
  search?: boolean;
  /** Mostrar "Si lo apagás se oculta…" en cada una. */
  showHides?: boolean;
  /** Las partes vienen cerradas, con un botón "Ver sus partes" (para que la lista quede corta). */
  foldParts?: boolean;
  /** Algo para dibujar debajo de una función (por ejemplo, las versiones de la Biblia). */
  after?: (key: FeatureKey) => React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<FeatureKey[]>([]);
  const hits = searchFeatures(q);
  const searching = q.trim().length > 0;
  const show = (f: Feature) => !searching || hits.has(f.key);

  const hides = (f: Feature) => (showHides ? (
    <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: -4, marginBottom: 6 }}>
      <Text style={{ fontWeight: '700' }}>{tx('Si lo apagás se oculta:')} </Text>{f.hides}
    </Text>
  ) : null);

  const groups = FEATURE_GROUPS.map((g) => ({ g, items: topFeatures(g).filter((f) => show(f) || childrenOf(f.key).some(show)) })).filter((x) => x.items.length);

  return (
    <View style={{ gap: 12 }}>
      {search ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input, backgroundColor: colors.bg }}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={tx('Buscar una función: ofrendas, chat, Biblia…')} placeholderTextColor={colors.muted}
            accessibilityLabel={tx('Buscar una función')} autoCorrect={false} style={{ flex: 1, fontSize: 15, color: colors.text }} />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel={tx('Borrar la búsqueda')}><Feather name="x" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      ) : null}
      {searching && !groups.length ? <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 8 }}>{tx('No encontré ninguna función con “{q}”.', { q: q.trim() })}</Text> : null}
      {groups.map(({ g, items }) => (
        <View key={g} style={{ gap: 8 }}>
          <SectionTitle>{tx(g)}</SectionTitle>
          {items.map((f) => {
            const on = featureOn(off, f.key);
            const parts = childrenOf(f.key);
            const shownParts = parts.filter((c) => !searching || hits.has(c.key));
            const partsOpen = searching || !foldParts || open.includes(f.key);
            const partsOn = parts.filter((c) => featureOn(off, c.key)).length;
            return (
              <Card key={f.key} style={{ padding: 12, gap: 0 }}>
                <Toggle label={f.label} hint={f.hint} value={on} onChange={(v) => onChange(f.key, v)} disabled={disabled} />
                {hides(f)}
                {parts.length && on && !partsOpen ? (
                  <Pressable onPress={() => setOpen([...open, f.key])} accessibilityRole="button" hitSlop={6} style={{ paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>{tx('Ver sus {n} partes ({v1}) ▾', { n: parts.length, v1: partsOn === 1 ? tx('1 prendida') : tx('{partsOn} prendidas', { partsOn }) })}</Text>
                  </Pressable>
                ) : null}
                {parts.length && on && partsOpen ? (
                  <View style={{ marginLeft: 6, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.border }}>
                    {shownParts.map((c) => (
                      <View key={c.key}>
                        <Toggle label={c.label} hint={c.hint} value={featureOn(off, c.key)} onChange={(v) => onChange(c.key, v)} disabled={disabled} />
                        {hides(c)}
                      </View>
                    ))}
                  </View>
                ) : null}
                {parts.length && !on ? (
                  <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17, paddingBottom: 4 }}>
                    {tx('Con esto apagado también quedan apagadas sus {n} partes ({map}).', { n: parts.length, map: parts.map((c) => c.label.toLowerCase()).join(', ') })}
                  </Text>
                ) : null}
                {on && after ? after(f.key) : null}
              </Card>
            );
          })}
        </View>
      ))}
    </View>
  );
}
