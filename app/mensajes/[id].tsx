// Una conversación privada con otro hermano: texto, fotos, documentos y mensajes de voz.
// Mantener apretado un mensaje: copiar, borrar el propio o denunciar el del otro. Arriba a la derecha: bloquear.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/Screen';
import { showActions } from '@/components/ActionSheet';
import { AttachSheet, type AttachItem } from '@/components/AttachSheet';
import { ReactionChips } from '@/components/ReactionChips';
import { REACTIONS, myReaction, useReactions } from '@/lib/reactions';
import { VoiceBubble, VoiceRecorder, isVoice, voiceAvailable } from '@/components/ChatVoice';
import { dmBlock, dmDelete, dmPeople, dmRead, dmReport, dmSend, dmSendAttachment, dmThread, type DmMessage } from '@/lib/dm';
import { downloadUrl, pickChatDocument, pickChatImage, signedUrl, uploadChatVoice, type ChatAttachment } from '@/lib/files';
import { fmtRelativeDay, fmtTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import { tx } from '@/lib/i18n';

const REASONS = ['Es ofensivo o me falta el respeto', 'Me incomoda o me asusta', 'Pide plata o es un engaño', 'Otra cosa'];

function DmImage({ path, onOpen }: { path: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { signedUrl('chat', path).then(setUrl).catch(() => setUrl(null)); }, [path]);
  if (!url) return <View style={styles.imgBox}><ActivityIndicator color={colors.violet} /></View>;
  return (
    <Pressable onPress={() => onOpen(url)} accessibilityRole="imagebutton" accessibilityLabel={tx('Ver la foto')}>
      <Image source={{ uri: url }} style={styles.img} contentFit="cover" />
    </Pressable>
  );
}

export default function Conversacion() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { church, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<DmMessage[] | null>(null);
  const [other, setOther] = useState<{ name: string; blocked: boolean } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [attach, setAttach] = useState(false);
  const [recording, setRecording] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ids = useMemo(() => (rows ?? []).map((m) => m.id).reverse(), [rows]);
  const reactErr = useCallback((e: unknown) => Alert.alert(tx('No se pudo reaccionar'), errorMessage(e)), []);
  const rx = useReactions('dm', ids, profile?.display_name ?? tx('Vos'), reactErr);
  const rxReload = useRef(rx.reload);
  rxReload.current = rx.reload;

  const load = useCallback(() => {
    if (!id) return;
    dmThread(id).then((r) => {
      setRows(r);
      rxReload.current();
      if (r.some((m) => !m.mine && !m.read_at)) dmRead(id).catch(() => undefined);
    }).catch(() => setRows((old) => old ?? []));
  }, [id]);

  // Se abre al entrar y se actualiza sola cada 6 segundos mientras está a la vista.
  useFocusEffect(useCallback(() => {
    load();
    timer.current = setInterval(load, 6000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]));
  useEffect(() => {
    dmPeople().then((p) => { const o = p.find((x) => x.id === id); if (o) setOther({ name: o.name, blocked: o.i_blocked }); }).catch(() => undefined);
  }, [id]);

  const title = other?.name ?? name ?? tx('Mensajes');
  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); load(); } catch (e) { Alert.alert(tx('No se envió'), errorMessage(e)); } finally { setBusy(false); }
  };
  const send = () => {
    const t = text.trim();
    if (!t || !id) return;
    guard(async () => { await dmSend(id, t); setText(''); });
  };
  const sendFile = (pick: () => Promise<ChatAttachment | null>) => {
    if (!church?.id || !id) return;
    guard(async () => { const a = await pick(); if (a) { await dmSendAttachment(id, a, text); setText(''); } });
  };
  const sendVoice = async (uri: string) => {
    if (!church?.id || !id) return;
    await dmSendAttachment(id, await uploadChatVoice(church.id, uri));
    load();
  };
  const attachItems = (): AttachItem[] => {
    const cid = church?.id ?? '';
    return [
      { key: 'cam', label: tx('Cámara'), icon: 'camera', color: '#E0457B', onPress: () => sendFile(() => pickChatImage(cid, 'camera')) },
      { key: 'photo', label: tx('Foto'), icon: 'image', color: '#8E5BD9', onPress: () => sendFile(() => pickChatImage(cid, 'library')) },
      { key: 'doc', label: tx('Documento'), icon: 'file-text', color: '#3F6FD8', onPress: () => sendFile(() => pickChatDocument(cid)) },
    ];
  };

  const openFile = async (m: DmMessage) => {
    const url = await downloadUrl('chat', m.attachment_path as string, m.attachment_name).catch(() => null);
    if (!url) return Alert.alert(tx('No se pudo abrir'), tx('Probá de nuevo cuando tengas señal.'));
    Linking.openURL(url).catch(() => Alert.alert(tx('No se pudo abrir'), tx('No hay una aplicación para abrir este archivo.')));
  };

  const setBlocked = (on: boolean) => {
    if (!id) return;
    dmBlock(id, on).then(() => setOther((o) => (o ? { ...o, blocked: on } : o))).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
  };
  const blockMenu = () => showActions(title, undefined, [
    other?.blocked
      ? { text: tx('Desbloquear'), icon: 'unlock' as const, onPress: () => setBlocked(false) }
      : { text: tx('Bloquear'), icon: 'slash' as const, destructive: true, onPress: () => Alert.alert(tx('¿Bloquear a {title}?', { title }), tx('Ninguno de los dos va a poder escribirle al otro. Lo podés desbloquear cuando quieras.'), [
        { text: tx('Cancelar'), style: 'cancel' }, { text: tx('Bloquear'), style: 'destructive', onPress: () => setBlocked(true) },
      ]) },
    { text: tx('Cancelar'), icon: 'x' as const },
  ]);
  const report = (m: DmMessage) => showActions(tx('¿Por qué lo denunciás?'), tx('Le llega al pastor con una copia del mensaje.'), [
    ...REASONS.map((r) => ({ text: tx(r), icon: 'flag' as const, onPress: () => dmReport(m.id, r)
      .then(() => Alert.alert(tx('Denuncia enviada'), tx('El pastor la va a revisar. Si no querés que te escriba más, también lo podés bloquear.')))
      .catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) })),
    { text: tx('Cancelar'), icon: 'x' as const },
  ]);
  const onLong = (m: DmMessage) => showActions(tx('Mensaje'), undefined, [
    ...(m.body ? [{ text: tx('Copiar'), icon: 'copy' as const, onPress: () => { Clipboard.setStringAsync(m.body).catch(() => undefined); } }] : []),
    ...(m.mine
      ? [{ text: tx('Borrar para los dos'), icon: 'trash-2' as const, destructive: true, onPress: () => dmDelete(m.id).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) }]
      : [{ text: tx('Denunciar'), icon: 'flag' as const, destructive: true, onPress: () => report(m) }]),
    { text: tx('Cancelar'), icon: 'x' as const },
  ], other?.blocked ? undefined : { options: REACTIONS, current: myReaction(rx.map[m.id]), onPick: (e) => { rx.toggle(m.id, e); } });

  const data = rows ? [...rows].reverse() : [];
  const renderItem = ({ item: m, index }: { item: DmMessage; index: number }) => {
    const older = data[index + 1];
    const day = fmtRelativeDay(m.created_at);
    const showDay = !older || fmtRelativeDay(older.created_at) !== day;
    return (
      <View style={{ gap: 4, marginBottom: 6 }}>
        {showDay ? <Text style={styles.day}>{day}</Text> : null}
        <View style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
          <Pressable onLongPress={() => onLong(m)} delayLongPress={300} accessibilityHint={tx('Mantené apretado para más opciones')} style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
            {m.kind === 'image' && m.attachment_path ? <DmImage path={m.attachment_path} onOpen={setViewer} /> : null}
            {m.kind === 'file' && m.attachment_path && isVoice(m.attachment_name) ? <VoiceBubble path={m.attachment_path} /> : m.kind === 'file' ? (
              <Pressable onPress={() => openFile(m)} onLongPress={() => onLong(m)} style={styles.file} accessibilityRole="button" accessibilityLabel={tx('Abrir {attachment_name}', { attachment_name: m.attachment_name ?? tx('el documento') })}>
                <Feather name="file-text" size={24} color={colors.violet} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={2}>{m.attachment_name ?? tx('Documento')}</Text>
              </Pressable>
            ) : null}
            {m.body ? <Text selectable={Platform.OS === 'web'} style={styles.body}>{m.body}</Text> : null}
            <View style={styles.meta}>
              <Text style={styles.time}>{fmtTime(m.created_at)}</Text>
              {m.mine ? <Feather name={m.read_at ? 'check-circle' : 'check'} size={12} color={m.read_at ? '#2E9BD6' : colors.muted} /> : null}
            </View>
          </Pressable>
          <ReactionChips list={rx.map[m.id]} mine={m.mine} onToggle={other?.blocked ? undefined : (e) => { rx.toggle(m.id, e); }} />
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={title} subtitle={tx('Conversación privada · solo la ven ustedes dos')} back
        right={<Pressable onPress={blockMenu} hitSlop={10} accessibilityRole="button" accessibilityLabel={tx('Más opciones')} style={{ padding: 8 }}><Feather name="more-vertical" size={22} color={colors.text} /></Pressable>} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgSoft }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {rows === null ? <ActivityIndicator style={{ marginTop: 40, flex: 1 }} color={colors.violet} /> : !rows.length ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
            <Feather name="message-circle" size={38} color={colors.muted} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{tx('Todavía no se escribieron')}</Text>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>{tx('Mandale un saludo a {title}.', { title })}</Text>
          </View>
        ) : (
          <FlatList inverted data={data} extraData={rx.map} keyExtractor={(m) => m.id} renderItem={renderItem} contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled" />
        )}
        {other?.blocked ? (
          <View style={{ padding: 14, paddingBottom: 14 + insets.bottom, gap: 8, alignItems: 'center', backgroundColor: colors.bg }}>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>{tx('Bloqueaste a {title}. No se pueden escribir.', { title })}</Text>
            <Text onPress={() => setBlocked(false)} style={{ fontSize: 14, fontWeight: '800', color: colors.violet }}>{tx('Desbloquear')}</Text>
          </View>
        ) : (
          <View style={[styles.inputRow, { paddingBottom: 8 + insets.bottom }]}>
            {recording ? <View style={styles.inputLine}><VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} /></View> : (
              <View style={styles.inputLine}>
                <View style={styles.pill}>
                  <Pressable onPress={() => setAttach(true)} style={styles.plus} accessibilityRole="button" accessibilityLabel={tx('Adjuntar una foto o un documento')}>
                    <Feather name="plus" size={24} color={colors.muted} />
                  </Pressable>
                  <TextInput value={text} onChangeText={setText} placeholder={tx('Escribí un mensaje…')} placeholderTextColor={colors.muted} multiline maxLength={4000}
                    accessibilityLabel={tx('Mensaje')} style={styles.input} />
                </View>
                {voiceAvailable && !text.trim() && !busy ? (
                  <Pressable onPress={() => setRecording(true)} style={styles.sendBtn} accessibilityRole="button" accessibilityLabel={tx('Grabar un mensaje de voz')}>
                    <Feather name="mic" size={20} color="#FFF" />
                  </Pressable>
                ) : (
                  <Pressable onPress={send} disabled={busy || !text.trim()} style={[styles.sendBtn, (busy || !text.trim()) && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={tx('Enviar')}>
                    {busy ? <ActivityIndicator color="#FFF" /> : <Feather name="send" size={19} color="#FFF" />}
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
      <AttachSheet visible={attach} items={attachItems().map((i) => ({ ...i, onPress: () => { setAttach(false); i.onPress(); } }))} onClose={() => setAttach(false)} />
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)} accessibilityLabel={tx('Cerrar la foto')}>
          {viewer ? <Image source={{ uri: viewer }} style={{ flex: 1 }} contentFit="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  day: { alignSelf: 'center', fontSize: 12, fontWeight: '700', color: colors.muted, backgroundColor: colors.bg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, overflow: 'hidden', marginVertical: 8, textTransform: 'capitalize' },
  bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4, gap: 2 },
  mine: { backgroundColor: colors.violetSoft, borderTopRightRadius: 4 },
  theirs: { backgroundColor: colors.bg, borderTopLeftRadius: 4 },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  time: { fontSize: 11, color: colors.muted },
  img: { width: 220, height: 220, borderRadius: 10 },
  imgBox: { width: 220, height: 220, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetSoft },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, minWidth: 220, backgroundColor: colors.bgSoft },
  inputRow: { paddingHorizontal: 8, paddingTop: 8, backgroundColor: colors.bgSoft },
  inputLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.bg, borderRadius: 24, minHeight: 48, borderWidth: 1, borderColor: colors.border },
  plus: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 120, paddingRight: 14, paddingTop: 13, paddingBottom: 12, fontSize: 16, color: colors.text },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', paddingVertical: 60 },
}));
