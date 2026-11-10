// Una sala de chat en vivo (la de la iglesia o la de la salida). Lo nuevo aparece solo, abajo.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Face } from '@/components/Face';
import { chatDelete, chatList, chatSend, chatTable, type ChatMessage, type ChatRoomKind } from '@/lib/chat';
import { moderate } from '@/lib/moderation';
import { errorMessage, supabase } from '@/lib/supabase';
import { fmtRelativeDay, fmtTime } from '@/lib/format';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';

export function ChatRoom({ room, empty, placeholder = 'Escribí un mensaje…', readOnly = false }: {
  room: ChatRoomKind; empty: { title: string; text: string }; placeholder?: string; readOnly?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { isStaff } = useAuth();
  const [rows, setRows] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(true);
  const loadingMore = useRef(false);

  const load = useCallback(() => {
    chatList(room).then((r) => {
      setRows((old) => {
        // Se mantienen los mensajes viejos que ya se habían cargado más arriba.
        if (!old?.length) return r;
        const ids = new Set(r.map((m) => m.id));
        const oldest = r[r.length - 1]?.created_at;
        return [...r, ...old.filter((m) => !ids.has(m.id) && oldest && m.created_at < oldest)];
      });
    }).catch(() => setRows((old) => old ?? []));
  }, [room]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`chat-${room}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: chatTable(room) }, () => load())
      .subscribe();
    // Por si se corta el tiempo real (señal mala en la calle), se revisa cada tanto.
    const id = setInterval(load, 20000);
    return () => {
      clearInterval(id);
      supabase.removeChannel(ch);
    };
  }, [room, load]);
  useRefreshOnResume(load);

  const loadOlder = () => {
    if (!rows?.length || !more || loadingMore.current) return;
    loadingMore.current = true;
    chatList(room, rows[rows.length - 1].created_at)
      .then((r) => { if (r.length < 60) setMore(false); setRows((old) => [...(old ?? []), ...r.filter((m) => !(old ?? []).some((o) => o.id === m.id))]); })
      .catch(() => undefined)
      .finally(() => { loadingMore.current = false; });
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await chatSend(room, body);
      setText('');
      load();
    } catch (e) {
      Alert.alert('No se envió', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const options = (m: ChatMessage) => {
    if (m.mine || isStaff) {
      Alert.alert('Borrar mensaje', '¿Borrar este mensaje para todos?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => chatDelete(room, m.id).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
      ]);
      return;
    }
    moderate({ kind: room === 'church' ? 'church_chat' : 'outing_chat', targetId: m.id, authorId: m.user_id, authorName: m.name, excerpt: m.body, onChange: load });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {rows === null ? (
        <ActivityIndicator style={{ marginTop: 40, flex: 1 }} color={colors.green} />
      ) : !rows.length ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
          <Feather name="message-circle" size={38} color={colors.muted} />
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{empty.title}</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>{empty.text}</Text>
        </View>
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(m) => m.id}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: m, index }) => {
            const older = rows[index + 1];
            const newDay = !older || new Date(older.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const sameAuthor = older && older.user_id === m.user_id && !newDay;
            return (
              <View>
                {newDay ? <Text style={styles.day}>{fmtRelativeDay(m.created_at)}</Text> : null}
                <Pressable onLongPress={() => options(m)} delayLongPress={350}
                  style={[styles.row, m.mine && { justifyContent: 'flex-end' }]} accessibilityHint="Mantené apretado para más opciones">
                  {!m.mine ? (sameAuthor ? <View style={{ width: 32 }} /> : <Face name={m.name} path={m.photo_path} size={32} />) : null}
                  <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
                    {!m.mine && !sameAuthor ? <Text style={styles.name}>{m.name}</Text> : null}
                    <Text style={[styles.body, m.mine && { color: '#FFFFFF' }]}>{m.body}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-end' }}>
                      <Text style={[styles.time, m.mine && { color: 'rgba(255,255,255,0.8)' }]}>{fmtTime(m.created_at)}</Text>
                      <Feather name="more-horizontal" size={14} color={m.mine ? 'rgba(255,255,255,0.8)' : colors.muted} onPress={() => options(m)} accessibilityLabel="Opciones del mensaje" />
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          }}
        />
      )}
      {readOnly ? null : (
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor="#8B918C" multiline maxLength={1000} style={styles.input} />
          <Pressable onPress={send} disabled={busy || !text.trim()} style={[styles.sendBtn, (!text.trim() || busy) && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Enviar">
            {busy ? <ActivityIndicator color="#FFF" /> : <Feather name="send" size={19} color="#FFF" />}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  day: { alignSelf: 'center', fontSize: 12, fontWeight: '700', color: colors.muted, marginVertical: 6, textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  mine: { backgroundColor: colors.green, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.bgSoft, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  name: { fontSize: 12, fontWeight: '800', color: colors.greenText },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  time: { fontSize: 11, color: colors.muted },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: colors.text, backgroundColor: colors.bg },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
}));
