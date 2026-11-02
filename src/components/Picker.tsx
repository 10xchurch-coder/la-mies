// Ventana para elegir una opción de una lista larga (personas, material, etc.), con buscador.
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Face } from './Face';
import { colors } from '../theme';

export type PickItem = { id: string; title: string; subtitle?: string; photo?: string | null; face?: boolean };

export function PickerModal({
  visible, title, items, onPick, onClose, allowNone, noneLabel = 'Nadie / quitar',
}: {
  visible: boolean;
  title: string;
  items: PickItem[];
  onPick: (id: string | null) => void;
  onClose: () => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return t ? items.filter((i) => norm(`${i.title} ${i.subtitle ?? ''}`).includes(norm(t))) : items;
  }, [q, items]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: colors.text }}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ padding: 10 }}>
            <Feather name="x" size={24} color={colors.text} />
          </Pressable>
        </View>
        <View style={{ margin: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, backgroundColor: colors.bgSoft, paddingHorizontal: 12 }}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar" placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 16, color: colors.text }} autoCorrect={false} />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListHeaderComponent={allowNone ? (
            <Pressable onPress={() => onPick(null)} style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.red }}>{noneLabel}</Text>
            </Pressable>
          ) : undefined}
          ListEmptyComponent={<Text style={{ padding: 24, textAlign: 'center', color: colors.muted }}>No hay resultados</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item.id)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: pressed ? colors.bgSoft : colors.bg })}
            >
              {item.face !== false ? <Face name={item.title} path={item.photo} size={40} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{item.title}</Text>
                {item.subtitle ? <Text style={{ fontSize: 12, color: colors.muted }}>{item.subtitle}</Text> : null}
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

/** Fila de fechas para elegir (ej. los próximos sábados y domingos). */
export function DateChips({ dates, value, onChange, format }: { dates: string[]; value: string; onChange: (d: string) => void; format: (d: string) => string }) {
  return (
    <FlatList
      horizontal
      data={dates}
      keyExtractor={(d) => d}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
      renderItem={({ item }) => {
        const on = item === value;
        return (
          <Pressable
            onPress={() => onChange(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.greenSoft : colors.bg, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: on ? '800' : '600', color: on ? colors.greenText : colors.text }}>{format(item)}</Text>
          </Pressable>
        );
      }}
    />
  );
}
