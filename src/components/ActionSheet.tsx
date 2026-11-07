// Lista de opciones desde abajo (Android muestra como mucho 3 botones en Alert.alert; esto no tiene límite).
// Uso: showActions('Título', 'texto', [{ text: 'Opción', onPress }]). El <ActionSheetHost/> va una sola vez en la raíz.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

export type SheetAction = { text: string; onPress?: () => void; icon?: React.ComponentProps<typeof Feather>['name']; destructive?: boolean; hint?: string };
type Req = { title: string; message?: string; actions: SheetAction[] };

let push: ((r: Req | null) => void) | null = null;

export function showActions(title: string, message: string | undefined, actions: SheetAction[]): void {
  push?.({ title, message, actions });
}

export function ActionSheetHost() {
  const insets = useSafeAreaInsets();
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => {
    push = setReq;
    return () => {
      push = null;
    };
  }, []);
  const close = () => setReq(null);
  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingBottom: insets.bottom + 12, maxHeight: '80%', width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <View style={{ paddingHorizontal: 18, gap: 4, paddingBottom: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{req?.title}</Text>
            {req?.message ? <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{req.message}</Text> : null}
          </View>
          <ScrollView>
            {req?.actions.map((a, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                onPress={() => {
                  close();
                  setTimeout(() => a.onPress?.(), 50);
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: pressed ? colors.bgSoft : 'transparent', borderTopWidth: 1, borderTopColor: colors.border })}
              >
                {a.icon ? <Feather name={a.icon} size={20} color={a.destructive ? '#C62828' : colors.green} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: a.destructive ? '#C62828' : colors.text }}>{a.text}</Text>
                  {a.hint ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={2}>{a.hint}</Text> : null}
                </View>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={close} style={{ paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.muted }}>Cancelar</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
