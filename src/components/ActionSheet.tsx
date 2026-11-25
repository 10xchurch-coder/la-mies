// Lista de opciones desde abajo (Android muestra como mucho 3 botones en Alert.alert; esto no tiene límite).
// Uso: showActions('Título', 'texto', [{ text: 'Opción', onPress }]). El <ActionSheetHost/> va una sola vez en la raíz.
import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { tx } from '@/lib/i18n';
import { EMOJI_GROUPS, FIRST_EMOJIS, recentEmojis, useEmoji as rememberEmoji } from '@/lib/emojis';

export type SheetAction = { text: string; onPress?: () => void; icon?: React.ComponentProps<typeof Feather>['name']; destructive?: boolean; hint?: string };
/** Fila de reacciones arriba de las opciones (para los mensajes de los chats). */
export type SheetReactions = { options: readonly string[]; current: string | null; onPick: (emoji: string) => void };
type Req = { title: string; message?: string; actions: SheetAction[]; reactions?: SheetReactions };

let push: ((r: Req | null) => void) | null = null;

export function showActions(title: string, message: string | undefined, actions: SheetAction[], reactions?: SheetReactions): void {
  // Con reacciones se usa siempre la hoja propia (la nativa de iPhone no puede mostrar la fila de caritas).
  if (Platform.OS === 'ios' && !reactions) {
    // En iPhone, un Modal no se puede abrir encima de otro Modal (por ejemplo, los comentarios del devocional):
    // quedaba invisible y bloqueaba la pantalla. La hoja nativa de iOS siempre aparece arriba de todo.
    const list = actions.filter((a) => a.text !== 'Cancelar' && a.text !== tx('Cancelar'));
    const destructive = list.map((a, i) => (a.destructive ? i : -1)).filter((i) => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: [...list.map((a) => a.text), tx('Cancelar')], cancelButtonIndex: list.length, destructiveButtonIndex: destructive },
      (i) => { if (i < list.length) setTimeout(() => list[i].onPress?.(), 300); },
    );
    return;
  }
  push?.({ title, message, actions, reactions });
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
  // Para los mensajes de los chats: las caritas usadas hace poco y, con el +, todas.
  const [recent, setRecent] = useState<string[]>(FIRST_EMOJIS);
  const [allOpen, setAllOpen] = useState(false);
  useEffect(() => { if (req?.reactions) { setAllOpen(false); recentEmojis().then(setRecent).catch(() => undefined); } }, [req]);
  const close = () => setReq(null);
  const pickEmoji = (e: string) => { const pick = req?.reactions?.onPick; rememberEmoji(e); close(); setTimeout(() => pick?.(e), 50); };
  if (req?.reactions) {
    const r = req.reactions;
    const actions = req.actions.filter((a) => a.text !== 'Cancelar' && a.text !== tx('Cancelar'));
    const row = [...new Set([...(r.current ? [r.current] : []), ...recent])];
    return (
      <Modal visible transparent animationType="fade" onRequestClose={close}>
        <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 18, paddingBottom: insets.bottom + 18 }}>
          <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 420, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 30, paddingLeft: 6, paddingRight: 6, height: 58, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center' }}>
                {row.map((e) => (
                  <Pressable key={e} onPress={() => pickEmoji(e)} accessibilityRole="button" accessibilityLabel={tx('Reaccionar con {e}', { e })} accessibilityState={{ selected: r.current === e }}
                    style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: r.current === e ? colors.greenSoft : 'transparent' }}>
                    <Text style={{ fontSize: 29 }}>{e}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable onPress={() => setAllOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={tx('Ver todas las caritas')}
                style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                <Feather name={allOpen ? 'x' : 'plus'} size={22} color={colors.text} />
              </Pressable>
            </View>
            {allOpen ? (
              <View style={{ backgroundColor: colors.bg, borderRadius: 22, maxHeight: 360, overflow: 'hidden' }}>
                <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
                  {EMOJI_GROUPS.map((gr) => (
                    <View key={gr.title} style={{ gap: 2 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted, marginTop: 4 }}>{gr.title.toUpperCase()}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        {gr.list.map((e, i) => (
                          <Pressable key={`${e}${i}`} onPress={() => pickEmoji(e)} accessibilityRole="button" accessibilityLabel={tx('Reaccionar con {e}', { e })} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 27 }}>{e}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : actions.length ? (
              <View style={{ backgroundColor: colors.bg, borderRadius: 22, overflow: 'hidden', alignSelf: 'flex-end', minWidth: 250, maxWidth: '100%' }}>
                {actions.map((a, i) => (
                  <Pressable key={i} accessibilityRole="button" onPress={() => { close(); setTimeout(() => a.onPress?.(), 50); }}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: pressed ? colors.bgSoft : 'transparent', borderTopWidth: a.destructive && i ? 1 : 0, borderTopColor: colors.border })}>
                    {a.icon ? <Feather name={a.icon} size={21} color={a.destructive ? '#C62828' : colors.text} /> : null}
                    <Text style={{ flex: 1, fontSize: 17, color: a.destructive ? '#C62828' : colors.text }}>{a.text}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }
  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingBottom: insets.bottom + 12, maxHeight: '80%', width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <View style={{ paddingHorizontal: 18, gap: 4, paddingBottom: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{req?.title}</Text>
            {req?.message ? <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{req.message}</Text> : null}
          </View>
          {req?.reactions ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 10 }}>
              {req.reactions.options.map((e) => {
                const on = req.reactions?.current === e;
                return (
                  <Pressable key={e} accessibilityRole="button" accessibilityLabel={tx('Reaccionar con {e}', { e })} accessibilityState={{ selected: on }}
                    onPress={() => { const pick = req.reactions?.onPick; close(); setTimeout(() => pick?.(e), 50); }}
                    style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.greenSoft : pressed ? colors.bgSoft : 'transparent', borderWidth: on ? 1.5 : 0, borderColor: colors.green })}>
                    <Text style={{ fontSize: 27 }}>{e}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <ScrollView>
            {req?.actions.filter((a) => !(req.reactions && (a.text === 'Cancelar' || a.text === tx('Cancelar')))).map((a, i) => (
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
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.muted }}>{tx('Cancelar')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
