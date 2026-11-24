// La Biblia de la iglesia: qué versiones puede usar la gente y cuál se abre primero.
// Hoy la app trae dos (Reina-Valera 1909 y King James). Cuando se sume otra, aparece sola en esta lista.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Toggle } from '@/components/ui';
import { VERSIONS } from '@/lib/bible';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export function BibleChurchSettings({ versions, def, onChange, disabled }: {
  /** Las versiones permitidas (ids). */
  versions: readonly string[];
  /** La que se abre para quien nunca eligió. */
  def: string;
  onChange: (versions: string[], def: string) => void;
  disabled?: boolean;
}) {
  const allowed = VERSIONS.filter((v) => versions.includes(v.id));
  const toggle = (id: string, on: boolean) => {
    const next = VERSIONS.map((v) => v.id as string).filter((x) => (x === id ? on : versions.includes(x)));
    if (!next.length) return; // siempre queda al menos una
    onChange(next, next.includes(def) ? def : next[0]);
  };
  return (
    <View style={{ gap: 4, marginTop: 4, padding: 12, borderRadius: 12, backgroundColor: colors.blueSoft }}>
      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.blueText }}>{tx('Versiones de la Biblia para tu gente')}</Text>
      <Text style={{ fontSize: 12, color: colors.text, lineHeight: 17 }}>
        {tx('Los hermanos solo ven las que dejes prendidas. Si dejás una sola, no aparece el botón para cambiar de versión ni el de comparar.')}
      </Text>
      {VERSIONS.map((v) => (
        <Toggle key={v.id} label={v.name} hint={v.lang === 'en' ? tx('En inglés') : tx('En español')} value={versions.includes(v.id)}
          onChange={(on) => toggle(v.id, on)} disabled={disabled || (allowed.length === 1 && versions.includes(v.id))} />
      ))}
      {allowed.length > 1 ? (
        <>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{tx('¿Cuál se abre primero?')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {allowed.map((v) => {
              const on = v.id === def;
              return (
                <Pressable key={v.id} onPress={() => onChange([...versions], v.id)} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={tx('Abrir primero {name}', { name: v.name })}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: colors.bg }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: on ? colors.blueText : colors.text }}>{on ? '✓ ' : ''}{v.short}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Es para quien todavía no eligió. Con la app en inglés se abre primero la versión en inglés, si la dejaste prendida.')}</Text>
        </>
      ) : null}
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Cuando la app sume otra versión, va a aparecer acá para que decidas si la usan.')}</Text>
    </View>
  );
}
