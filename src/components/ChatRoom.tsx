// Una sala de chat en vivo (la de la iglesia, la de la salida o la de un ministerio). Lo nuevo aparece solo, abajo.
// Como WhatsApp: fotos, documentos, ubicación (y en tiempo real), encuestas, tildes de enviado / entregado / visto,
// "en línea" y "escribiendo…". Cada uno puede apagar el "en línea" y las confirmaciones de lectura en Ajustes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Face } from '@/components/Face';
import { showActions } from '@/components/ActionSheet';
import { AttachSheet, type AttachItem } from '@/components/AttachSheet';
import { LocationBubble } from '@/components/LocationBubble';
import { PollCard, PollComposer } from '@/components/ChatPoll';
import { Ticks } from '@/components/Ticks';
import {
  chatDelete, chatList, chatMarkRead, chatMyPrivacy, chatReceipts, chatSend, chatSendAttachment, chatSendLocation, chatTable, pollResults, roomKey, ticksFor, votePoll,
  type ChatMessage, type ChatPrivacy, type ChatRoomKind, type PollOption, type Receipt, type RoomRef,
} from '@/lib/chat';
import { currentPlace, startLiveShare, stopLiveShare } from '@/lib/chatLive';
import { downloadUrl, pickChatDocument, pickChatImage, signedUrl, type ChatAttachment } from '@/lib/files';
import { moderate } from '@/lib/moderation';
import { errorMessage, supabase } from '@/lib/supabase';
import { fmtRelativeDay, fmtTime } from '@/lib/format';
import { useRefreshOnResume } from '@/lib/useRefreshOnResume';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';

type Features = { photo?: boolean; doc?: boolean; poll?: boolean; location?: boolean };

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

const SEND_LIVE = [15, 30, 60] as const;

export function ChatRoom({ room, ministryId = null, canAnnounce = false, empty, placeholder = 'Escribí un mensaje…', readOnly = false, features = {} }: {
  room: ChatRoomKind; ministryId?: string | null; canAnnounce?: boolean; empty: { title: string; text: string }; placeholder?: string; readOnly?: boolean; features?: Features;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isStaff, church, profile } = useAuth();
  const ref: RoomRef = useMemo(() => ({ room, ministryId }), [room, ministryId]);
  const key = roomKey(ref);
  const [rows, setRows] = useState<ChatMessage[] | null>(null);
  const [polls, setPolls] = useState<Record<string, PollOption[]>>({});
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [privacy, setPrivacy] = useState<ChatPrivacy>({ show_online: true, read_receipts: true });
  const [online, setOnline] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [more, setMore] = useState(true);
  const [composing, setComposing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const loadingMore = useRef(false);
  const rowsRef = useRef<ChatMessage[] | null>(null);
  rowsRef.current = rows;
  const lastRead = useRef(0);
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTyping = useRef(0);
  const myId = profile?.id ?? '';
  const [, force] = useState(0);

  const loadPolls = useCallback(() => {
    const ids = (rowsRef.current ?? []).filter((m) => m.kind === 'poll').map((m) => m.id).slice(0, 40);
    if (!ids.length) return;
    pollResults(ids).then((r) => setPolls((old) => ({ ...old, ...r }))).catch(() => undefined);
  }, []);

  const loadReceipts = useCallback(() => { chatReceipts(ref).then(setReceipts).catch(() => undefined); }, [ref]);

  // Abrí el chat y estás mirando: todo lo que hay queda visto.
  const markRead = useCallback(() => {
    if (readOnly || Date.now() - lastRead.current < 2500) return;
    lastRead.current = Date.now();
    chatMarkRead(ref).catch(() => undefined);
  }, [ref, readOnly]);

  const load = useCallback(() => {
    chatList(ref).then((r) => {
      setRows((old) => {
        // Se mantienen los mensajes viejos que ya se habían cargado más arriba.
        if (!old?.length) return r;
        const ids = new Set(r.map((m) => m.id));
        const oldest = r[r.length - 1]?.created_at;
        return [...r, ...old.filter((m) => !ids.has(m.id) && oldest && m.created_at < oldest)];
      });
      setTimeout(loadPolls, 0);
      markRead();
    }).catch(() => setRows((old) => old ?? []));
  }, [ref, loadPolls, markRead]);

  useEffect(() => { chatMyPrivacy().then(setPrivacy).catch(() => undefined); }, []);

  useEffect(() => {
    load();
    loadReceipts();
    const filter = room === 'ministry' ? { filter: `ministry_id=eq.${ministryId}` } : {};
    const ch = supabase
      .channel(`chat-${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: chatTable(room), ...filter }, () => load())
      .subscribe();
    // Por si se corta el tiempo real (señal mala en la calle), se revisa cada tanto. Los votos y las tildes se ven por acá.
    const id = setInterval(load, room === 'church' ? 12000 : 20000);
    const rid = setInterval(loadReceipts, 9000);
    return () => {
      clearInterval(id);
      clearInterval(rid);
      supabase.removeChannel(ch);
    };
  }, [room, ministryId, key, load, loadReceipts]);
  useRefreshOnResume(() => { load(); loadReceipts(); });

  // Quién está en línea y quién está escribiendo (si apagaste el "en línea", no aparecés pero sí ves a los demás).
  useEffect(() => {
    if (readOnly || !myId) return;
    const ch = supabase.channel(`presence-${key}`, { config: { presence: { key: myId } } });
    presenceRef.current = ch;
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState() as Record<string, { name?: string }[]>;
      const next: Record<string, string> = {};
      for (const [uid, metas] of Object.entries(st)) if (uid !== myId && metas[0]) next[uid] = metas[0].name ?? 'Alguien';
      setOnline(next);
    }).on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as { id?: string; name?: string };
      if (p?.id && p.id !== myId) setTyping((t) => ({ ...t, [p.id as string]: { name: p.name ?? 'Alguien', at: Date.now() } }));
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED' && privacy.show_online) ch.track({ name: profile?.display_name ?? 'Alguien' }).catch(() => undefined);
    });
    const t = setInterval(() => { setTyping((x) => { const n = Object.fromEntries(Object.entries(x).filter(([, v]) => Date.now() - v.at < 4500)); return Object.keys(n).length === Object.keys(x).length ? x : n; }); force((v) => v + 1); }, 2000);
    return () => { clearInterval(t); presenceRef.current = null; supabase.removeChannel(ch); };
  }, [key, myId, readOnly, privacy.show_online, profile?.display_name]);

  const onType = (v: string) => {
    setText(v);
    if (v && Date.now() - lastTyping.current > 2500) {
      lastTyping.current = Date.now();
      presenceRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: myId, name: profile?.display_name ?? 'Alguien' } }).catch(() => undefined);
    }
  };

  const loadOlder = () => {
    if (!rows?.length || !more || loadingMore.current) return;
    loadingMore.current = true;
    chatList(ref, rows[rows.length - 1].created_at)
      .then((r) => { if (r.length < 60) setMore(false); setRows((old) => [...(old ?? []), ...r.filter((m) => !(old ?? []).some((o) => o.id === m.id))]); setTimeout(loadPolls, 0); })
      .catch(() => undefined)
      .finally(() => { loadingMore.current = false; });
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await chatSend(ref, body, announce && canAnnounce);
      setText('');
      setAnnounce(false);
      load();
    } catch (e) {
      Alert.alert('No se envió', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const guard = async (fn: () => Promise<unknown>) => {
    setSending(true);
    try { await fn(); load(); } catch (e) { Alert.alert('No se envió', errorMessage(e)); } finally { setSending(false); }
  };
  const sendFile = (pick: () => Promise<ChatAttachment | null>) => {
    if (!church?.id) return;
    guard(async () => { const a = await pick(); if (a) { await chatSendAttachment(ref, a, text); setText(''); } });
  };

  const liveChoice = () => showActions('Ubicación en tiempo real', 'Los del chat ven cómo te movés en el mapa. Podés dejar de compartir cuando quieras.', [
    ...SEND_LIVE.map((m) => ({ text: m === 60 ? '1 hora' : `${m} minutos`, icon: 'radio' as const, onPress: () => guard(() => startLiveShare(ref, m)) })),
    { text: 'Cancelar', icon: 'x' as const },
  ]);

  const attachItems = (): AttachItem[] => {
    const cid = church?.id ?? '';
    return [
      ...(features.photo ? [
        { key: 'cam', label: 'Cámara', icon: 'camera' as const, color: '#E0457B', onPress: () => sendFile(() => pickChatImage(cid, 'camera')) },
        { key: 'photo', label: 'Foto', icon: 'image' as const, color: '#8E5BD9', onPress: () => sendFile(() => pickChatImage(cid, 'library')) },
      ] : []),
      ...(features.doc ? [{ key: 'doc', label: 'Documento', icon: 'file-text' as const, color: '#3F6FD8', onPress: () => sendFile(() => pickChatDocument(cid)) }] : []),
      ...(features.location ? [
        { key: 'here', label: 'Mi ubicación', icon: 'map-pin' as const, color: '#1FA463', onPress: () => guard(async () => { const p = await currentPlace(); await chatSendLocation(ref, p.lat, p.lng); }) },
        { key: 'pin', label: 'Elegir lugar en el mapa', icon: 'crosshair' as const, color: '#2A9D8F', onPress: () => router.push({ pathname: '/ubicacion', params: { room, ...(ministryId ? { ministry: ministryId } : {}) } } as unknown as Href) },
        { key: 'live', label: 'Ubicación en tiempo real', icon: 'radio' as const, color: '#E8743B', onPress: liveChoice },
      ] : []),
      ...(features.poll ? [{ key: 'poll', label: 'Encuesta', icon: 'bar-chart-2' as const, color: '#E0A100', onPress: () => setComposing(true) }] : []),
    ];
  };
  const canAttach = !readOnly && (features.photo || features.doc || features.poll || features.location);

  const vote = (optionId: string) => { votePoll(optionId).then(loadPolls).catch((e) => Alert.alert('No se pudo votar', errorMessage(e))); };

  const openFile = async (m: ChatMessage) => {
    const url = await downloadUrl('chat', m.attachment_path as string, m.attachment_name).catch(() => null);
    if (!url) return Alert.alert('No se pudo abrir', 'Probá de nuevo cuando tengas señal.');
    Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir', 'No hay una aplicación para abrir este archivo.'));
  };

  const excerpt = (m: ChatMessage) => (m.kind === 'image' ? `[Foto] ${m.body}`.trim() : m.kind === 'file' ? `[Documento] ${m.attachment_name ?? ''} ${m.body}`.trim() : m.kind === 'poll' ? `[Encuesta] ${m.body}` : m.kind === 'location' || m.kind === 'live' ? `[Ubicación] ${m.body}`.trim() : m.body);
  const modKind = room === 'church' ? 'church_chat' : room === 'outing' ? 'outing_chat' : 'ministry_message';

  const options = (m: ChatMessage) => {
    const acts = [
      ...(m.body && m.kind !== 'poll' ? [{ text: 'Copiar', icon: 'copy' as const, onPress: () => { Clipboard.setStringAsync(m.body).catch(() => undefined); } }] : []),
      ...(m.mine && !readOnly ? [{ text: 'Info (quién lo vio)', icon: 'info' as const, onPress: () => { loadReceipts(); setInfo(m); } }] : []),
      ...(m.mine || isStaff ? [{
        text: 'Borrar para todos', icon: 'trash-2' as const, destructive: true,
        onPress: () => Alert.alert('Borrar mensaje', '¿Borrar este mensaje para todos?', [
          { text: 'Cancelar', style: 'cancel' as const },
          { text: 'Borrar', style: 'destructive' as const, onPress: () => chatDelete(ref, m.id).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
        ]),
      }] : []),
      ...(!m.mine ? [{ text: 'Denunciar o bloquear', icon: 'flag' as const, onPress: () => moderate({ kind: modKind, targetId: m.id, authorId: m.user_id, authorName: m.name, excerpt: excerpt(m), onChange: load }) }] : []),
      { text: 'Cancelar', icon: 'x' as const },
    ];
    showActions('Mensaje', undefined, acts);
  };

  const content = (m: ChatMessage) => {
    if (m.kind === 'poll') return <PollCard question={m.body} rows={polls[m.id]} mine={false} onVote={vote} onLong={() => options(m)} />;
    if (m.kind === 'location' || m.kind === 'live') return <LocationBubble m={m} onStop={() => stopLiveShare(room, m.id).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e)))} />;
    return (
      <>
        {m.kind === 'announcement' ? <Text style={styles.annTag}>📢 ANUNCIO</Text> : null}
        {m.kind === 'image' && m.attachment_path ? <ChatImage path={m.attachment_path} onOpen={setViewer} /> : null}
        {m.kind === 'file' ? (
          <Pressable onPress={() => openFile(m)} accessibilityRole="button" accessibilityLabel={`Abrir ${m.attachment_name ?? 'documento'}`} style={styles.file}>
            <Feather name="file-text" size={26} color={colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }} numberOfLines={2}>{m.attachment_name ?? 'Documento'}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{sizeText(m.attachment_size)}{m.attachment_size ? ' · ' : ''}tocá para abrir</Text>
            </View>
          </Pressable>
        ) : null}
        {m.body ? <Text style={styles.body}>{m.body}</Text> : null}
      </>
    );
  };

  // Arriba del chat: quién está escribiendo, o quién está en línea.
  const typers = Object.values(typing).map((t) => t.name);
  const onlineNames = Object.values(online);
  const status = typers.length ? `${typers.slice(0, 2).join(' y ')} ${typers.length > 1 ? 'están escribiendo…' : 'está escribiendo…'}`
    : onlineNames.length ? `En línea: ${onlineNames.slice(0, 3).join(', ')}${onlineNames.length > 3 ? ` y ${onlineNames.length - 3} más` : ''}` : null;

  const infoReceipts = (m: ChatMessage) => {
    const t = new Date(m.created_at).getTime();
    const at = (v: string | null) => (v ? new Date(v).getTime() >= t : false);
    return {
      read: receipts.filter((r) => at(r.read_at)),
      delivered: receipts.filter((r) => !at(r.read_at) && at(r.delivered_at)),
      waiting: receipts.filter((r) => !at(r.read_at) && !at(r.delivered_at)),
    };
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgSoft }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {status ? <Text style={styles.status} numberOfLines={1}>{status}</Text> : null}
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
          extraData={[polls, receipts]}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ padding: 10, gap: 3 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: m, index }) => {
            const older = rows[index + 1];
            const newDay = !older || new Date(older.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const sameAuthor = !!older && older.user_id === m.user_id && !newDay;
            const ticks = m.mine ? ticksFor(m.created_at, receipts) : null;
            return (
              <View style={{ marginTop: sameAuthor ? 0 : 6 }}>
                {newDay ? <Text style={styles.day}>{fmtRelativeDay(m.created_at)}</Text> : null}
                <Pressable onLongPress={() => options(m)} delayLongPress={300}
                  style={[styles.row, m.mine && { justifyContent: 'flex-end' }]} accessibilityHint="Mantené apretado para más opciones">
                  {!m.mine ? (sameAuthor ? <View style={{ width: 32 }} /> : <Face name={m.name} path={m.photo_path} size={32} />) : null}
                  <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs, m.kind === 'announcement' && styles.announce, (m.kind === 'poll' || m.kind === 'location' || m.kind === 'live') && { maxWidth: '88%' }]}>
                    {!m.mine && !sameAuthor ? <Text style={styles.name}>{m.name}</Text> : null}
                    {content(m)}
                    <View style={styles.meta}>
                      <Text style={styles.time}>{fmtTime(m.created_at)}</Text>
                      {ticks ? <Ticks state={ticks} /> : null}
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
          {canAnnounce ? (
            <Pressable onPress={() => setAnnounce(!announce)} style={styles.annRow} accessibilityRole="checkbox" accessibilityState={{ checked: announce }}>
              <Feather name={announce ? 'check-square' : 'square'} size={18} color={colors.amberText} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.amberText, flex: 1 }}>Mandar como anuncio (les llega aviso al teléfono a todos)</Text>
            </Pressable>
          ) : null}
          <View style={styles.inputLine}>
            <View style={styles.pill}>
              {canAttach ? (
                <Pressable onPress={() => setMenu(true)} disabled={sending} hitSlop={8} style={[styles.plus, sending && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Adjuntar">
                  {sending ? <ActivityIndicator color={colors.green} /> : <Feather name="plus" size={24} color={colors.muted} />}
                </Pressable>
              ) : <View style={{ width: 8 }} />}
              <TextInput value={text} onChangeText={onType} placeholder={placeholder} placeholderTextColor="#8B918C" multiline maxLength={room === 'ministry' ? 4000 : 1000} style={styles.input} />
            </View>
            <Pressable onPress={send} disabled={busy || !text.trim()} style={[styles.sendBtn, announce && { backgroundColor: colors.amber }, (!text.trim() || busy) && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Enviar">
              {busy ? <ActivityIndicator color="#FFF" /> : <Feather name="send" size={19} color="#FFF" />}
            </Pressable>
          </View>
        </View>
      )}
      <AttachSheet visible={menu} items={attachItems()} onClose={() => setMenu(false)} />
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)} accessibilityLabel="Cerrar la foto">
          {viewer ? <Image source={{ uri: viewer }} style={{ flex: 1 }} contentFit="contain" /> : null}
          <View style={[styles.close, { top: insets.top + 12 }]}><Feather name="x" size={24} color="#FFF" /></View>
        </Pressable>
      </Modal>
      <Modal visible={!!info} transparent animationType="slide" onRequestClose={() => setInfo(null)}>
        <Pressable style={styles.shade} onPress={() => setInfo(null)}>
          <Pressable onPress={() => undefined} style={[styles.infoSheet, { paddingBottom: insets.bottom + 14 }]}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>Info del mensaje</Text>
            {!privacy.read_receipts ? <Text style={styles.hint}>Tenés apagadas las confirmaciones de lectura: no ves quién lo leyó (ni los demás ven si leíste). Se cambia en Ajustes → Chats.</Text> : null}
            <ScrollView style={{ maxHeight: 380 }}>
              {info ? ([['Visto por', infoReceipts(info).read, true], ['Entregado a', infoReceipts(info).delivered, false], ['Todavía no le llegó', infoReceipts(info).waiting, false]] as const).map(([title, list, blue]) => (
                list.length ? (
                  <View key={title} style={{ gap: 6, marginTop: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: blue ? '#2E9BD6' : colors.muted, letterSpacing: 0.4 }}>{title.toUpperCase()}</Text>
                    {list.map((r) => (
                      <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Face name={r.name} path={r.photo_path} size={34} />
                        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.text }}>{r.name}</Text>
                        <Text style={{ fontSize: 12, color: colors.muted }}>{title === 'Visto por' && r.read_at ? `${fmtRelativeDay(r.read_at)} ${fmtTime(r.read_at)}` : title === 'Entregado a' && r.delivered_at ? fmtTime(r.delivered_at) : ''}</Text>
                      </View>
                    ))}
                  </View>
                ) : null
              )) : null}
              {!receipts.length ? <Text style={styles.hint}>Todavía no hay nadie más en este chat.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {features.poll ? <PollComposer visible={composing} onClose={() => setComposing(false)} onDone={() => { setComposing(false); load(); }} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  status: { fontSize: 12, fontWeight: '700', color: colors.greenText, backgroundColor: colors.greenSoft, paddingHorizontal: 14, paddingVertical: 5 },
  day: { alignSelf: 'center', fontSize: 12, fontWeight: '700', color: colors.muted, backgroundColor: colors.bg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, overflow: 'hidden', marginVertical: 8, textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bubble: { maxWidth: '80%', borderRadius: 12, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4, gap: 2 },
  mine: { backgroundColor: colors.greenSoft, borderTopRightRadius: 4 },
  theirs: { backgroundColor: colors.bg, borderTopLeftRadius: 4 },
  announce: { backgroundColor: colors.amberSoft },
  annTag: { fontSize: 11, fontWeight: '900', color: colors.amberText, letterSpacing: 0.4 },
  name: { fontSize: 12, fontWeight: '800', color: colors.greenText },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  time: { fontSize: 11, color: colors.muted },
  img: { width: 220, height: 220, borderRadius: 10 },
  imgBox: { width: 220, height: 220, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenSoft },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, minWidth: 220, backgroundColor: colors.bgSoft },
  inputRow: { paddingHorizontal: 8, paddingTop: 8, gap: 6, backgroundColor: colors.bgSoft },
  annRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  inputLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.bg, borderRadius: 24, minHeight: 48, borderWidth: 1, borderColor: colors.border },
  plus: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 120, paddingRight: 14, paddingTop: 13, paddingBottom: 12, fontSize: 16, color: colors.text },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', paddingVertical: 60 },
  close: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  infoSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 4, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18, marginTop: 8 },
}));
