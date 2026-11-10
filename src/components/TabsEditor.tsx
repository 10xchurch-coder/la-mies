// Ajustes → Barra de abajo: elegir qué 5 pestañas se ven y en qué orden.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PickerModal } from './Picker';
import { Button } from './ui';
import { DEFAULT_TABS, TAB_OPTIONS, setTabs, tabInfo, useTabs, type TabKey } from '../lib/tabsPref';
import { colors, themed } from '../theme';

export function TabsEditor() {
  const tabs = useTabs();
  const [sel, setSel] = useState(2);
  const [picking, setPicking] = useState(false);
  const key = tabs[sel];
  const fixed = !!tabInfo(key)?.fixed;

  const move = (dir: -1 | 1) => {
    const to = sel + dir;
    if (to < 0 || to >= tabs.length) return;
    const next = [...tabs];
    [next[sel], next[to]] = [next[to], next[sel]];
    setTabs(next);
    setSel(to);
  };

  const same = tabs.join() === DEFAULT_TABS.join();
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>Tocá una pestaña y después movela o cambiala por otra. Iglesia y Yo no se pueden sacar, pero sí cambiar de lugar.</Text>
      <View style={styles.bar}>
        {tabs.map((k, i) => {
          const t = tabInfo(k);
          const on = i === sel;
          return (
            <Pressable key={k} onPress={() => setSel(i)} accessibilityRole="button" accessibilityLabel={`Pestaña ${t.title}`} accessibilityState={{ selected: on }}
              style={[styles.slot, on && styles.slotOn]}>
              <Feather name={t.icon} size={22} color={on ? '#FFF' : k === 'iglesia' ? colors.green : colors.muted} />
              <Text style={[styles.label, on && { color: '#FFF' }]} numberOfLines={1}>{t.title}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Izquierda" icon="chevron-left" variant="ghost" small onPress={() => move(-1)} disabled={sel === 0} style={{ flex: 1 }} />
        <Button title="Derecha" icon="chevron-right" variant="ghost" small onPress={() => move(1)} disabled={sel === tabs.length - 1} style={{ flex: 1 }} />
      </View>
      <Button title={fixed ? `${tabInfo(key).title} queda siempre` : `Cambiar ${tabInfo(key).title} por otra`} icon="repeat" small onPress={() => setPicking(true)} disabled={fixed} />
      {!same ? <Text onPress={() => { setTabs(DEFAULT_TABS); setSel(2); }} style={{ fontSize: 14, fontWeight: '700', color: colors.green, textAlign: 'center' }}>Volver a la barra de siempre</Text> : null}
      <PickerModal visible={picking} title={`¿Qué querés en lugar de ${tabInfo(key).title}?`}
        items={TAB_OPTIONS.filter((t) => !tabs.includes(t.key)).map((t) => ({ id: t.key, title: t.title }))}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          setPicking(false);
          if (!id) return;
          const next = [...tabs];
          next[sel] = id as TabKey;
          setTabs(next);
        }} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  slot: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 8, borderRadius: 10 },
  slotOn: { backgroundColor: colors.green },
  label: { fontSize: 11, fontWeight: '700', color: colors.text },
}));
