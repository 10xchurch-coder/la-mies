// Una sala de chat en vivo (la de la iglesia o la de la salida). Lo nuevo aparece solo, abajo.
// Se pueden mandar fotos y GIF, documentos y (en el chat de la iglesia) encuestas.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Face } from '@/components/Face';
import { showActions } from '@/components/ActionSheet';
import { PollCard, PollComposer } from '@/components/ChatPoll';
import {
  chatDelete, chatList, chatSend, chatSendAttachment, chatTable, pollResults, votePoll,
  type ChatMessage, type ChatRoomKind, type PollOption,
} from '@/lib/chat';
import { downloadUrl, pickChatDocument, pickChatImage, signedUrl, type ChatAttachment } from '@/lib/files';
import { moderate } from '@/lib/moderation';
import { errorMessage, supabase } from '@/lib/supabase';
import { fmtRelativeDay, fmtTime } from '@/lib/format';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';

type Features = { photo?: boolean; doc?: boolean; poll?: boolean };

function sizeText(n: number | null): string {
  if (!n) return '';
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function ChatImage({ path, onOpen }: { path: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { signedUrl('chat', path).then(setUrl).catch(() => setUrl(null)); }, [path]);
  if (!url) return <View style={styles.imgBox}><ActivityIndicator color={colors.green} /></View>;
  return (
    <Pressable onPress={() => onOpen(url)} accessibilityRole="imagebutton" accessibilityLabel="Ver la foto grande">
      <Image source={{ uri: url }} style={styles.img} contentFit="cover" transition={150} />
    </Pressable>
  );
}

export function ChatRoom({ room, empty, placeholder = 'Escribí un mensaje…', readOnly = false, features = {} }: {
  room: ChatRoomKind; empty: { title: string; text: string }; placeholder?: string; readOnly?: boolean; features?: Features;
}) {
  const insets = useSafeAreaInsets();
  const { isStaff, church } = useAuth();
  const [rows, setRows] = useState<ChatMessage[] | null>(null);
  const [polls, setPolls] = useState<Record<string, PollOption[]>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [more, setMore] = useState(true);
  const [composing, setComposing] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const loadingMore = useRef(false);
  const rowsRef = useRef<ChatMessage[] | null>(null);
  rowsRef.current = rows;
  const canAttach = !readOnly && (features.photo || features.doc || features.poll);

  const loadPolls = useCallback(() => {
    const ids = (rowsRef.current ?? []).filter((m) => m.kind === 'poll').map((m) => m.id).slice(0, 40);
    if (!ids.length) return;
    pollResults(ids).then((r) => setPolls((old) => ({ ...old, ...r }))).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    chatList(room).then((r) => {
      setRows((old) => {
        // Se mantienen los mensajes viejos que ya se habían cargado más arriba.
        if (!old?.length) return r;
        const ids = new Set(r.map((m) => m.id));
        const oldest = r[r.length - 1]?.created_at;
        return [...r, ...old.filter((m) => !ids.has(m.id) && oldest && m.created_at < oldest)];
      });
      setTimeout(loadPolls, 0);
    }).catch(() => setRows((old) => old ?? []));
  }, [room, loadPolls]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`chat-${room}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: chatTable(room) }, () => load())
      .subscribe();
    // Por si se corta el tiempo real (señal mala en la calle), se revisa cada tanto. Los votos se ven por acá.
    const id = setInterval(load, room === 'church' ? 12000 : 20000);
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
      .then((r) => { if (r.length < 60) setMore(false); setRows((old) => [...(old ?? []), ...r.filter((m) => !(old ?? []).some((o) => o.id === m.id))]); setTimeout(loadPolls, 0); })
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

  const sendFile = async (pick: () => Promise<ChatAttachment | null>) => {
    if (!church?.id) return;
    setSending(true);
    try {
      const a = await pick();
      if (a) {
        await chatSendAttachment(room, a, text);
        setText('');
        load();
      }
    } catch (e) {
      Alert.alert('No se envió', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const attach = () => {
    const cid = church?.id ?? '';
    showActions('Mandar al chat', undefined, [
      ...(features.photo ? [
        { text: 'Sacar una foto', icon: 'camera' as const, onPress: () => sendFile(() => pickChatImage(cid, 'camera')) },
        { text: 'Foto o GIF de la galería', icon: 'image' as const, onPress: () => sendFile(() => pickChatImage(cid, 'library')) },
      ] : []),
      ...(features.doc ? [{ text: 'Documento (PDF, Word, Excel…)', icon: 'file-text' as const, onPress: () => sendFile(() => pickChatDocument(cid)) }] : []),
      ...(features.poll ? [{ text: 'Encuesta', icon: 'bar-chart-2' as const, onPress: () => setComposing(true) }] : []),
      { text: 'Cancelar', icon: 'x' as const },
    ]);
  };

  const vote = (optionId: string) => {
    votePoll(optionId).then(loadPolls).catch((e) => Alert.alert('No se pudo votar', errorMessage(e)));
  };

  const openFile = async (m: ChatMessage) => {
    const url = await downloadUrl('chat', m.attachment_path as string, m.attachment_name).catch(() => null);
    if (!url) return Alert.alert('No se pudo abrir', 'Probá de nuevo cuando tengas señal.');
    Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir', 'No hay una aplicación para abrir este archivo.'));
  };

  const excerpt = (m: ChatMessage) => (m.kind === 'image' ? `[Foto] ${m.body}`.trim() : m.kind === 'file' ? `[Documento] ${m.attachment_name ?? ''} ${m.body}`.trim() : m.kind === 'poll' ? `[Encuesta] ${m.body}` : m.body);

  const options = (m: ChatMessage) => {
    if (m.mine || isStaff) {
      Alert.alert('Borrar mensaje', '¿Borrar este mensaje para todos?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => chatDelete(room, m.id).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
      ]);
      return;
    }
    moderate({ kind: room === 'church' ? 'church_chat' : 'outing_chat', targetId: m.id, authorId: m.user_id, authorName: m.name, excerpt: excerpt(m), onChange: load });
  };

  const content = (m: ChatMessage) => {
    const ink = m.mine ? '#FFFFFF' : colors.text;
    if (m.kind === 'poll') return <PollCard question={m.body} rows={polls[m.id]} mine={m.mine} onVote={vote} onLong={() => options(m)} />;
    return (
      <>
        {m.kind === 'image' && m.attachment_path ? <ChatImage path={m.attachment_path} onOpen={setViewer} /> : null}
        {m.kind === 'file' ? (
          <Pressable onPress={() => openFile(m)} accessibilityRole="button" accessibilityLabel={`Abrir ${m.attachment_name ?? 'documento'}`}
            style={[styles.file, m.mine ? { backgroundColor: 'rgba(255,255,255,0.18)' } : { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1 }]}>
            <Feather name="file-text" size={26} color={m.mine ? '#FFF' : colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: ink }} numberOfLines={2}>{m.attachment_name ?? 'Documento'}</Text>
              <Text style={{ fontSize: 12, color: m.mine ? 'rgba(255,255,255,0.85)' : colors.muted }}>{sizeText(m.attachment_size)}{m.attachment_size ? ' · ' : ''}tocá para abrir</Text>
            </View>
          </Pressable>
        ) : null}
        {m.body ? <Text style={[styles.body, m.mine && { color: '#FFFFFF' }]}>{m.body}</Text> : null}
      </>
    );
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
          extraData={polls}
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
                  <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs, m.kind === 'poll' && { maxWidth: '88%' }]}>
                    {!m.mine && !sameAuthor ? <Text style={styles.name}>{m.name}</Text> : null}
                    {content(m)}
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
          {canAttach ? (
            <Pressable onPress={attach} disabled={sending} style={[styles.attachBtn, sending && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Adjuntar foto, documento o encuesta">
              {sending ? <ActivityIndicator color={colors.green} /> : <Feather name="plus" size={24} color={colors.green} />}
            </Pressable>
          ) : null}
          <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor="#8B918C" multiline maxLength={1000} style={styles.input} />
          <Pressable onPress={send} disabled={busy || !text.trim()} style={[styles.sendBtn, (!text.trim() || busy) && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Enviar">
            {busy ? <ActivityIndicator color="#FFF" /> : <Feather name="send" size={19} color="#FFF" />}
          </Pressable>
        </View>
      )}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)} accessibilityLabel="Cerrar la foto">
          {viewer ? <Image source={{ uri: viewer }} style={{ flex: 1 }} contentFit="contain" /> : null}
          <View style={[styles.close, { top: insets.top + 12 }]}><Feather name="x" size={24} color="#FFF" /></View>
        </Pressable>
      </Modal>
      {features.poll ? <PollComposer visible={composing} onClose={() => setComposing(false)} onDone={() => { setComposing(false); load(); }} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  day: { alignSelf: 'center', fontSize: 12, fontWeight: '700', color: colors.muted, marginVertical: 6, textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  mine: { backgroundColor: colors.green, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.bgSoft, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  name: { fontSize: 12, fontWeight: '800', color: colors.greenText },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  time: { fontSize: 11, color: colors.muted },
  img: { width: 220, height: 220, borderRadius: 12 },
  imgBox: { width: 220, height: 220, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenSoft },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, minWidth: 220 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: colors.text, backgroundColor: colors.bg },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  attachBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', paddingVertical: 60 },
  close: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
}));
