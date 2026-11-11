// El menú de "+" del chat, como en WhatsApp: círculos de colores con su nombre, en una grilla desde abajo.
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed } from '../theme';

export type AttachItem = { key: string; label: string; icon: React.ComponentProps<typeof Feather>['name']; color: string; onPress: () => void };

export function AttachSheet({ visible, items, onClose }: { visible: boolean; items: AttachItem[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.shade} onPress={onClose} accessibilityLabel="Cerrar">
        <Pressable onPress={() => undefined} style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.grab} />
          <View style={styles.grid}>
            {items.map((it) => (
              <Pressable key={it.key} accessibilityRole="button" accessibilityLabel={it.label} style={styles.cell}
                onPress={() => { onClose(); setTimeout(it.onPress, 120); }}>
                <View style={[styles.circle, { backgroundColor: it.color }]}><Feather name={it.icon} size={26} color="#FFF" /></View>
                <Text style={styles.label} numberOfLines={2}>{it.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  cell: { width: '33.33%', alignItems: 'center', gap: 8 },
  circle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center', paddingHorizontal: 4 },
}));
