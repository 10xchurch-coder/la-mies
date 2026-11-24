// Modo presentación: la pantalla del que maneja (operador). Arma la lista del culto y manda cada diapositiva al proyector.
// Para iglesias que no tienen otro programa: letras del Cancionero, pasajes de la Biblia, fotos, videos,
// cuenta regresiva y música. Se usa desde la computadora y también desde una tablet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Header } from '@/components/Screen';
import { PresentSlide } from '@/components/PresentSlide';
import { useChurchLogo } from '@/components/BrandFooter';
import { Button, Card, Empty, Field, Loading, Tag, Toggle } from '@/components/ui';
import { createPresentSet, deletePresentSet, getPresentSet, listPresentSets, listSongs, savePresentSet } from '@/lib/api';
import { VERSIONS, versionOf } from '@/lib/bible';
import { pickPresentMedia, presentUrl, removePresentFiles } from '@/lib/files';
import {
  BLACK, ITEM_TYPES, SECS_MAX, SECS_MIN, SPEEDS, autoMs, cleanItems, clock, itemSlides, itemTitle, newId, newItem, parsePassage, step, typeInfo,
  type LiveSlide, type LiveState, type MediaRef, type PresentItem, type PresentItemType, type RemoteCommand, type Slide, type SongItem,
} from '@/lib/present';
import { openPresentLink, type LinkStatus, type PresentLink } from '@/lib/presentSync';
import { searchKey } from '@/lib/songs';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Song } from '@/types';

type IconName = React.ComponentProps<typeof Feather>['name'];
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const LIVE_RED = '#D93025';

/** Abre la pantalla de salida: en la computadora, en otra ventana para llevar al proyector. */
function openOutput() {
  if (isWeb) {
    // La app en la web vive dentro de una carpeta (/la-mies): hay que sumarla a la dirección.
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const w = window.open(`${base}/presentar/salida`, 'lamies-salida', 'popup=yes,width=1280,height=720');
    if (!w) Alert.alert('El navegador no dejó abrir la ventana', 'Permití las ventanas emergentes para esta página y probá de nuevo.');
    return;
  }
  router.push('/presentar/salida' as Href);
}

export default function Presentar() {
  const { church, isLeader } = useAuth();
  const [setId, setSetId] = useState<string | null>(null);
  if (!church) return <Loading />;
  if (!isLeader) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Modo presentación" back />
        <Empty icon="lock" title="Solo para líderes" text="Si tenés que manejar la pantalla, pedile permiso al pastor." />
      </View>
    );
  }
  return setId
    ? <Operator key={setId} setId={setId} churchId={church.id} churchName={church.name} onClose={() => setSetId(null)} />
    : <Sets onOpen={setSetId} />;
}

// ---------------------------------------------------------------------------------------------
// Elegir o crear la lista del culto
// ---------------------------------------------------------------------------------------------
function Sets({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<{ id: string; name: string; updated_at: string }[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { listPresentSets().then(setRows).catch(() => setRows((o) => o ?? [])); }, []);
  useEffect(load, [load]);

  const create = async () => {
    const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    setBusy(true);
    try { onOpen(await createPresentSet(name.trim() || `Culto del ${today}`)); }
    catch (e) { Alert.alert('No se pudo crear la lista', errorMessage(e)); }
    finally { setBusy(false); }
  };
  const remove = (id: string, label: string) => {
    Alert.alert('¿Borrar esta lista?', `"${label}" se borra con sus fotos, videos y audios. Las canciones del Cancionero no se tocan.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => {
        try {
          const full = await getPresentSet(id);
          const media = cleanItems(full?.items).flatMap(mediaOf);
          await deletePresentSet(id);
          removePresentFiles(media.map((m) => m.path));
          load();
        } catch (e) { Alert.alert('No se pudo borrar', errorMessage(e)); }
      } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Modo presentación" subtitle="Letras, Biblia, fotos y videos en el proyector" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Nueva lista del culto</Text>
          <Field label="Nombre" hint="(opcional)" value={name} onChangeText={setName} placeholder="Culto del domingo" />
          <Button title="Crear lista" icon="plus" onPress={create} loading={busy} />
        </Card>

        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="monitor" title="Todavía no hay listas" text="Creá una lista y sumale canciones, pasajes, fotos y videos. Después abrí la pantalla de salida y llevala al proyector." />
        ) : (
          <Card style={{ padding: 0 }}>
            {rows.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Pressable onPress={() => onOpen(r.id)} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="list" size={17} color={colors.green} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>Último cambio: {new Date(r.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => remove(r.id, r.name)} accessibilityRole="button" accessibilityLabel="Borrar lista" style={{ padding: 14 }}>
                  <Feather name="trash-2" size={18} color={colors.red} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Usar este aparato para otra cosa</Text>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
            Una persona maneja la lista desde un aparato. Otro aparato puede ser la pantalla (conectado al proyector o a la tele) o un control para pasar las diapositivas desde el teléfono.
          </Text>
          <Button title="Ser la pantalla de salida" icon="monitor" variant="outline" onPress={openOutput} />
          <Button title="Ser el control remoto" icon="smartphone" variant="outline" onPress={() => router.push('/presentar/control' as Href)} />
        </Card>
      </ScrollView>
    </View>
  );
}

const mediaOf = (i: PresentItem): MediaRef[] =>
  (i.type === 'image' || i.type === 'video' || i.type === 'music') ? (i.media ? [i.media] : []) : i.type === 'song' ? (i.audio ? [i.audio] : []) : [];

// ---------------------------------------------------------------------------------------------
// El operador
// ---------------------------------------------------------------------------------------------
function Operator({ setId, churchId, churchName, onClose }: { setId: string; churchId: string; churchName: string; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const logo = useChurchLogo();
  const [name, setName] = useState('');
  const [items, setItems] = useState<PresentItem[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [liveAt, setLiveAt] = useState<{ id: string; slide: number } | null>(null);
  const [live, setLive] = useState<LiveState>(BLACK);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<LinkStatus>('conectando');
  const [saving, setSaving] = useState<'ok' | 'saving' | 'error'>('ok');
  const [sound, setSound] = useState<{ id: string; name: string; playing: boolean } | null>(null);

  // --- Cargar ---
  useEffect(() => {
    getPresentSet(setId).then((s) => {
      if (!s) { setMissing(true); return; }
      const list = cleanItems(s.items);
      setName(s.name);
      setItems(list);
      setSel(list[0]?.id ?? null);
    }).catch(() => setMissing(true));
    listSongs().then(setSongs).catch(() => setSongs([]));
  }, [setId]);

  // --- Guardar solo, un momento después de cada cambio ---
  const pending = useRef<{ name: string; items: PresentItem[] } | null>(null);
  const touch = (n: string, list: PresentItem[]) => { pending.current = { name: n, items: list }; };
  useEffect(() => {
    if (!pending.current) return;
    setSaving('saving');
    const t = setTimeout(() => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      savePresentSet(setId, p.name, p.items).then(() => setSaving('ok')).catch(() => { pending.current = pending.current ?? p; setSaving('error'); });
    }, 1200);
    return () => clearTimeout(t);
  }, [items, name, setId]);
  // Al salir, lo que faltaba guardar se guarda igual.
  useEffect(() => () => { const p = pending.current; if (p) savePresentSet(setId, p.name, p.items).catch(() => undefined); }, [setId]);

  const change = (list: PresentItem[]) => { touch(name, list); setItems(list); };
  const patch = (id: string, part: Partial<PresentItem>) => change((items ?? []).map((i) => (i.id === id ? ({ ...i, ...part } as PresentItem) : i)));
  const rename = (n: string) => { touch(n, items ?? []); setName(n); };

  const slides = useMemo(() => new Map((items ?? []).map((i) => [i.id, itemSlides(i, versionOf(i.type === 'passage' ? i.version : undefined))])), [items]);

  // --- Hablar con la pantalla y con el control remoto ---
  const link = useRef<PresentLink | null>(null);
  const liveRef = useRef<LiveState>(BLACK);
  const lastSlide = useRef<LiveState | null>(null);
  const actions = useRef<Record<RemoteCommand, () => void>>({ next: () => undefined, prev: () => undefined, black: () => undefined, logo: () => undefined });
  useEffect(() => {
    const l = openPresentLink(churchId, { onStatus: setStatus, onCommand: (c) => actions.current[c]() });
    link.current = l;
    // Si se recargó la página en medio del culto, se sigue con lo que ya está en pantalla (no se pone en negro).
    const last = l.lastLocal();
    if (last && Date.now() - last.at < 6 * 3600 * 1000) { liveRef.current = last; setLive(last); if (last.mode === 'slide') lastSlide.current = last; }
    // Se repite cada 5 segundos por si un aparato se conectó tarde o se le cortó la señal.
    const beat = setInterval(() => { if (liveRef.current.at > 0) l.sendState({ ...liveRef.current, at: Date.now() }); }, 5000);
    return () => { clearInterval(beat); l.close(); link.current = null; };
  }, [churchId]);

  const push = useCallback((s: LiveState) => {
    liveRef.current = s;
    if (s.mode === 'slide') lastSlide.current = s;
    setLive(s);
    link.current?.sendState(s);
  }, []);

  const req = useRef(0);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const show = useCallback(async (id: string, index: number) => {
    const s: Slide | undefined = slidesRef.current.get(id)?.[index];
    if (!s) return;
    const mine = ++req.current;
    let out: LiveSlide;
    if (s.kind === 'image' || s.kind === 'video') {
      const url = await presentUrl(s.media.path).catch(() => null);
      if (mine !== req.current) return;
      if (!url) { Alert.alert('No se pudo abrir el archivo', 'Revisá la conexión y probá de nuevo.'); return; }
      out = s.kind === 'image' ? { kind: 'image', url } : { kind: 'video', url, playing: true, startedAt: Date.now() };
    } else if (s.kind === 'countdown') {
      out = { kind: 'countdown', endsAt: Date.now() + s.minutes * 60000, message: s.message };
    } else out = s;
    setLiveAt({ id, slide: index });
    setSel(id);
    setPaused(false);
    push({ v: 1, mode: 'slide', slide: out, stamp: newId(), at: Date.now() });
  }, [push]);

  const move = (dir: 1 | -1) => {
    const list = items ?? [];
    const counts = list.map((i) => slides.get(i.id)?.length ?? 0);
    const at = liveAt ? list.findIndex((i) => i.id === liveAt.id) : -1;
    let next = step(counts, at >= 0 && liveAt ? { item: at, slide: liveAt.slide } : null, dir);
    // Si todavía no hay nada en pantalla, arranca por la parte elegida.
    if (at < 0 && dir === 1) {
      const chosen = list.findIndex((i) => i.id === sel);
      if (chosen >= 0 && counts[chosen] > 0) next = { item: chosen, slide: 0 };
    }
    if (next) show(list[next.item].id, next.slide);
  };
  const toggleMode = (mode: 'black' | 'logo') => {
    if (live.mode === mode) {
      // Tocar de nuevo vuelve a lo que estaba.
      if (lastSlide.current) push({ ...lastSlide.current, stamp: newId(), at: Date.now() });
      return;
    }
    push({ v: 1, mode, slide: null, stamp: newId(), at: Date.now() });
  };
  actions.current = { next: () => move(1), prev: () => move(-1), black: () => toggleMode('black'), logo: () => toggleMode('logo') };

  // --- Teclado (en la computadora) ---
  useEffect(() => {
    if (!isWeb) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const c: RemoteCommand | null =
        k === 'arrowright' || k === 'arrowdown' || k === ' ' || k === 'pagedown' ? 'next'
        : k === 'arrowleft' || k === 'arrowup' || k === 'pageup' ? 'prev'
        : k === 'b' ? 'black' : k === 'l' ? 'logo' : null;
      if (!c) return;
      e.preventDefault();
      e.stopPropagation();
      actions.current[c]();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // --- Avance automático de la letra ---
  const liveItem = liveAt ? (items ?? []).find((i) => i.id === liveAt.id) ?? null : null;
  const autoSong: SongItem | null = liveItem?.type === 'song' && liveItem.auto && live.mode === 'slide' ? liveItem : null;
  const autoId = autoSong?.id;
  const autoWait = autoSong ? autoMs(autoSong.secs, autoSong.speed) : 0;
  const liveSlideIndex = liveAt?.slide ?? -1;
  useEffect(() => {
    if (!autoId || paused) return;
    const total = slidesRef.current.get(autoId)?.length ?? 0;
    if (liveSlideIndex + 1 >= total) return; // la última queda quieta
    const t = setTimeout(() => show(autoId, liveSlideIndex + 1), autoWait);
    return () => clearTimeout(t);
  }, [autoId, autoWait, liveSlideIndex, paused, live.stamp, show]);

  // --- Música y pistas (suenan en este aparato, el del operador) ---
  const player = useRef<AudioPlayer | null>(null);
  const stopSound = useCallback(() => {
    try { player.current?.pause(); player.current?.remove(); } catch { /* ya estaba cerrado */ }
    player.current = null;
    setSound(null);
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    return () => { try { player.current?.pause(); player.current?.remove(); } catch { /* nada */ } };
  }, []);
  const playSound = async (id: string, media: MediaRef) => {
    stopSound();
    const url = await presentUrl(media.path).catch(() => null);
    if (!url) { Alert.alert('No se pudo abrir el audio', 'Revisá la conexión y probá de nuevo.'); return; }
    try {
      const p = createAudioPlayer({ uri: url });
      player.current = p;
      p.play();
      setSound({ id, name: media.name, playing: true });
    } catch { Alert.alert('No se pudo reproducir el audio'); }
  };
  const toggleSound = () => {
    const p = player.current;
    if (!p || !sound) return;
    if (sound.playing) p.pause(); else p.play();
    setSound({ ...sound, playing: !sound.playing });
  };

  const setVideo = (part: { playing?: boolean; restart?: boolean }) => {
    const s = live.slide;
    if (live.mode !== 'slide' || !s || s.kind !== 'video') return;
    push({ ...live, slide: { ...s, playing: part.playing ?? true, startedAt: part.restart ? Date.now() : s.startedAt }, stamp: newId(), at: Date.now() });
  };

  // --- Cambios en la lista ---
  const add = (type: PresentItemType) => {
    const it = newItem(type);
    change([...(items ?? []), it]);
    setSel(it.id);
    setEdit(true);
    setAdding(false);
  };
  const removeItem = (it: PresentItem) => {
    Alert.alert('¿Quitar de la lista?', itemTitle(it), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => {
        const list = (items ?? []).filter((i) => i.id !== it.id);
        change(list);
        removePresentFiles(mediaOf(it).map((m) => m.path));
        if (sound?.id === it.id) stopSound();
        if (liveAt?.id === it.id) setLiveAt(null);
        setSel(list[0]?.id ?? null);
        setEdit(false);
      } },
    ]);
  };
  const shift = (id: string, dir: 1 | -1) => {
    const list = [...(items ?? [])];
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    change(list);
  };

  if (missing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Modo presentación" back />
        <Empty icon="alert-circle" title="No se pudo abrir la lista" text="Revisá la conexión y probá de nuevo." />
        <View style={{ padding: 16 }}><Button title="Volver a las listas" variant="outline" onPress={onClose} /></View>
      </View>
    );
  }
  if (!items) return <Loading />;

  const selected = items.find((i) => i.id === sel) ?? null;
  const previewW = wide ? 320 : Math.min(width - 32, 520);

  // ---------- Lo que está en pantalla y los botones grandes ----------
  const livePanel = (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LIVE_RED }} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>EN PANTALLA</Text>
        <Text style={{ fontSize: 12, color: status === 'conectado' ? colors.greenText : colors.muted }}>
          {status === 'conectado' ? 'Otros aparatos: conectado' : status === 'conectando' ? 'Conectando…' : 'Otros aparatos: sin conexión'}
        </Text>
      </View>
      <View style={{ alignSelf: 'center', borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: LIVE_RED }}>
        <PresentSlide live={live} width={previewW} height={Math.round((previewW * 9) / 16)} logoUrl={logo} churchName={churchName} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Anterior" icon="arrow-left" variant="outline" onPress={() => move(-1)} style={{ flex: 1 }} />
        <Button title="Siguiente" icon="arrow-right" onPress={() => move(1)} style={{ flex: 1.4 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Negro" icon="square" variant={live.mode === 'black' ? 'primary' : 'outline'} onPress={() => toggleMode('black')} style={{ flex: 1 }} />
        <Button title="Logo" icon="home" variant={live.mode === 'logo' ? 'primary' : 'outline'} onPress={() => toggleMode('logo')} style={{ flex: 1 }} />
      </View>
      {autoSong ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>{paused ? 'La letra está en pausa.' : `La letra pasa sola cada ${Math.round(autoWait / 100) / 10} segundos.`}</Text>
          <Button small title={paused ? 'Seguir' : 'Pausar'} icon={paused ? 'play' : 'pause'} variant="outline" onPress={() => setPaused((p) => !p)} />
        </View>
      ) : null}
      {live.mode === 'slide' && live.slide?.kind === 'video' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small title={live.slide.playing ? 'Pausar video' : 'Seguir video'} icon={live.slide.playing ? 'pause' : 'play'} variant="outline" onPress={() => setVideo({ playing: !(live.slide as { playing: boolean }).playing })} style={{ flex: 1 }} />
          <Button small title="Desde el principio" icon="rotate-ccw" variant="outline" onPress={() => setVideo({ playing: true, restart: true })} style={{ flex: 1 }} />
        </View>
      ) : null}
      {sound ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.greenSoft }}>
          <Feather name="volume-2" size={18} color={colors.greenText} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.greenText }} numberOfLines={1}>{sound.playing ? 'Sonando' : 'En pausa'}: {sound.name}</Text>
          <Button small title={sound.playing ? 'Pausar' : 'Seguir'} variant="outline" onPress={toggleSound} />
          <Button small title="Parar" variant="danger" onPress={stopSound} />
        </View>
      ) : null}
      <Button title="Abrir pantalla de salida" icon="monitor" variant="outline" onPress={openOutput} />
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
        {isWeb
          ? 'Se abre otra ventana: llevala al proyector y poné pantalla completa. Teclado: flechas o espacio para pasar, B para negro, L para el logo.'
          : 'En este aparato la pantalla ocupa todo. Para manejar desde acá y mostrar en otro, abrí la pantalla de salida en el otro aparato.'}
      </Text>
    </Card>
  );

  // ---------- La lista del culto ----------
  const playlist = (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Volver a las listas" style={{ padding: 4 }}>
          <Feather name="chevron-left" size={22} color={colors.green} />
        </Pressable>
        <TextInput value={name} onChangeText={rename} placeholder="Nombre de la lista" placeholderTextColor="#8B918C" accessibilityLabel="Nombre de la lista"
          style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text, paddingVertical: 6 }} />
        <Text style={{ fontSize: 11, color: saving === 'error' ? colors.red : colors.muted }}>{saving === 'ok' ? 'Guardado' : saving === 'saving' ? 'Guardando…' : 'No se guardó'}</Text>
      </View>
      {!items.length ? <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>La lista está vacía. Tocá "Agregar" y elegí qué querés mostrar.</Text> : null}
      {items.map((it, i) => {
        const on = it.id === sel;
        const isLive = liveAt?.id === it.id && live.mode === 'slide';
        return (
          <Pressable key={it.id} onPress={() => { setSel(it.id); setEdit(false); }} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: isLive ? LIVE_RED : on ? colors.green : colors.border, backgroundColor: on ? colors.greenSoft : colors.bg }}>
            <Text style={{ width: 18, fontSize: 12, fontWeight: '700', color: colors.muted, textAlign: 'center' }}>{i + 1}</Text>
            <Feather name={typeInfo(it.type).icon as IconName} size={18} color={on ? colors.greenText : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }} numberOfLines={1}>{itemTitle(it)}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{typeInfo(it.type).label}</Text>
            </View>
            {sound?.id === it.id ? <Feather name="volume-2" size={16} color={colors.green} /> : null}
            {isLive ? <Tag text="En pantalla" tone="red" /> : null}
          </Pressable>
        );
      })}
      {adding ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>¿Qué querés agregar?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ITEM_TYPES.map((t) => (
              <Pressable key={t.type} onPress={() => add(t.type)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bgSoft }}>
                <Feather name={t.icon as IconName} size={16} color={colors.green} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button small title="Cancelar" variant="ghost" onPress={() => setAdding(false)} />
        </View>
      ) : <Button title="Agregar" icon="plus" variant="outline" onPress={() => setAdding(true)} />}
    </Card>
  );

  // ---------- La parte elegida: sus diapositivas y cómo cambiarla ----------
  const list = selected ? slides.get(selected.id) ?? [] : [];
  const thumbW = wide ? 210 : Math.floor((Math.min(width, 720) - 32 - 32 - 10) / 2);
  const detail = !selected ? null : (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text }} numberOfLines={2}>{itemTitle(selected)}</Text>
        <Pressable onPress={() => shift(selected.id, -1)} accessibilityRole="button" accessibilityLabel="Subir en la lista" style={{ padding: 8 }}><Feather name="arrow-up" size={18} color={colors.muted} /></Pressable>
        <Pressable onPress={() => shift(selected.id, 1)} accessibilityRole="button" accessibilityLabel="Bajar en la lista" style={{ padding: 8 }}><Feather name="arrow-down" size={18} color={colors.muted} /></Pressable>
        <Pressable onPress={() => removeItem(selected)} accessibilityRole="button" accessibilityLabel="Quitar de la lista" style={{ padding: 8 }}><Feather name="trash-2" size={18} color={colors.red} /></Pressable>
        <Button small title={edit ? 'Listo' : 'Cambiar'} icon={edit ? 'check' : 'edit-2'} variant={edit ? 'primary' : 'outline'} onPress={() => setEdit((e) => !e)} />
      </View>

      {edit ? <Editor item={selected} songs={songs} churchId={churchId} patch={(p) => patch(selected.id, p)} slideCount={list.length} /> : null}

      {selected.type === 'song' && list.length ? (
        <View style={{ gap: 6 }}>
          <Button title={selected.audio ? 'Empezar la canción con la pista' : 'Empezar la canción'} icon="play"
            onPress={() => { show(selected.id, 0); if (selected.audio) playSound(selected.id, selected.audio); }} />
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {selected.auto ? `La letra pasa sola cada ${Math.round(autoMs(selected.secs, selected.speed) / 100) / 10} segundos. ` : 'Vos pasás la letra con "Siguiente". '}
            Para cambiar esto tocá "Cambiar".
          </Text>
        </View>
      ) : null}

      {selected.type === 'music' ? (
        selected.media ? (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 14, color: colors.text }}>{selected.media.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {sound?.id === selected.id ? (
                <>
                  <Button title={sound.playing ? 'Pausar' : 'Seguir'} icon={sound.playing ? 'pause' : 'play'} onPress={toggleSound} style={{ flex: 1 }} />
                  <Button title="Parar" icon="square" variant="danger" onPress={stopSound} style={{ flex: 1 }} />
                </>
              ) : <Button title="Reproducir" icon="play" onPress={() => playSound(selected.id, selected.media!)} style={{ flex: 1 }} />}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted }}>La música suena en este aparato. La pantalla queda como está.</Text>
          </View>
        ) : !edit ? <Text style={{ fontSize: 14, color: colors.muted }}>Todavía no subiste el audio. Tocá "Cambiar".</Text> : null
      ) : null}

      {selected.type !== 'music' ? (
        list.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {list.map((s, i) => {
              const isLive = liveAt?.id === selected.id && liveAt.slide === i && live.mode === 'slide';
              return (
                <Pressable key={i} onPress={() => show(selected.id, i)} accessibilityRole="button" accessibilityLabel={`Mostrar diapositiva ${i + 1}`} style={{ gap: 4 }}>
                  <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 3, borderColor: isLive ? LIVE_RED : colors.border }}>
                    <Thumb slide={s} width={thumbW} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isLive ? LIVE_RED : colors.muted, width: thumbW }} numberOfLines={1}>
                    {i + 1}{s.kind === 'text' && s.label ? ` · ${s.label}` : ''}{isLive ? ' · EN PANTALLA' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : !edit ? <Text style={{ fontSize: 14, color: colors.muted }}>Esta parte todavía no tiene nada para mostrar. Tocá "Cambiar".</Text> : null
      ) : null}
      {list.length ? <Text style={{ fontSize: 12, color: colors.muted }}>Tocá una diapositiva para mandarla a la pantalla.</Text> : null}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPage }}>
      <Header title="Modo presentación" subtitle={name || 'Lista del culto'} back />
      {wide ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingBottom: 14 }}>
          <ScrollView style={{ width: 300, flexGrow: 0 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">{playlist}</ScrollView>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            {detail ?? <Empty icon="monitor" title="Elegí una parte de la lista" text="A la izquierda está la lista del culto. Agregá una canción o un pasaje para empezar." />}
          </ScrollView>
          <ScrollView style={{ width: 360, flexGrow: 0 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">{livePanel}</ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {livePanel}
          {playlist}
          {detail}
        </ScrollView>
      )}
    </View>
  );
}

/** Una diapositiva en chiquito, tal como va a salir. */
function Thumb({ slide, width }: { slide: Slide; width: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const path = slide.kind === 'image' ? slide.media.path : null;
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    presentUrl(path).then((u) => { if (alive) setUrl(u); }).catch(() => undefined);
    return () => { alive = false; };
  }, [path]);
  const s: LiveSlide =
    slide.kind === 'countdown' ? { kind: 'text', text: clock(slide.minutes * 60), label: null, footer: slide.message || null }
    : slide.kind === 'image' ? (url ? { kind: 'image', url } : { kind: 'text', text: 'Foto', label: null, footer: slide.media.name })
    : slide.kind === 'video' ? { kind: 'text', text: 'Video', label: null, footer: slide.media.name }
    : slide;
  return <PresentSlide live={{ v: 1, mode: 'slide', slide: s, stamp: 'mini', at: 0 }} width={width} height={Math.round((width * 9) / 16)} />;
}

function Stepper({ label, value, text, onChange, min, max, by = 1 }: { label: string; value: number; text: string; onChange: (n: number) => void; min: number; max: number; by?: number }) {
  const btn = (icon: IconName, to: number, say: string) => (
    <Pressable onPress={() => onChange(Math.min(max, Math.max(min, to)))} accessibilityRole="button" accessibilityLabel={say}
      style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={icon} size={20} color={colors.green} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{label}</Text>
      {btn('minus', value - by, `Menos: ${label}`)}
      <Text style={{ minWidth: 76, fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{text}</Text>
      {btn('plus', value + by, `Más: ${label}`)}
    </View>
  );
}

function Chips<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.green : colors.border, backgroundColor: on ? colors.greenSoft : colors.bg }}>
            <Text style={{ fontSize: 14, fontWeight: on ? '800' : '600', color: on ? colors.greenText : colors.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Subir, cambiar o quitar un archivo (foto, video o audio). */
function MediaField({ kind, media, churchId, onChange }: { kind: 'image' | 'video' | 'audio'; media: MediaRef | null; churchId: string; onChange: (m: MediaRef | null) => void }) {
  const [busy, setBusy] = useState(false);
  const word = kind === 'image' ? 'foto' : kind === 'video' ? 'video' : 'audio';
  const pick = async () => {
    setBusy(true);
    try {
      const m = await pickPresentMedia(churchId, kind);
      if (m) { if (media) removePresentFiles([media.path]); onChange(m); }
    } catch (e) { Alert.alert('No se pudo subir', errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 8 }}>
      {media ? <Text style={{ fontSize: 14, color: colors.text }}>Archivo: <Text style={{ fontWeight: '700' }}>{media.name}</Text></Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={busy ? 'Subiendo…' : media ? `Cambiar ${word}` : `Subir ${word}`} icon="upload" variant={media ? 'outline' : 'primary'} onPress={pick} loading={busy} style={{ flex: 1 }} />
        {media ? <Button title="Quitar" variant="danger" onPress={() => { removePresentFiles([media.path]); onChange(null); }} /> : null}
      </View>
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
        Hasta 50 MB.{kind === 'video' ? ' Usá videos en MP4. El video se ve y se escucha en la pantalla de salida (en la computadora).' : kind === 'audio' ? ' Usá MP3. Subí solo música que tu iglesia puede usar.' : ''}
      </Text>
    </View>
  );
}

/** Elegir una canción del Cancionero de la iglesia. */
function SongPicker({ songs, onPick }: { songs: Song[] | null; onPick: (s: Song) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const k = searchKey(q);
    return (songs ?? []).filter((s) => !k || searchKey(`${s.title} ${s.author ?? ''} ${s.lyrics}`).includes(k)).slice(0, 40);
  }, [songs, q]);
  if (songs === null) return <Loading />;
  if (!songs.length) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>El Cancionero está vacío. Primero cargá ahí las canciones con su letra.</Text>
        <Button title="Ir al Cancionero" icon="music" variant="outline" onPress={() => router.push('/canciones' as Href)} />
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSoft }}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar en el Cancionero" placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} autoCorrect={false} />
      </View>
      {!shown.length ? <Text style={{ fontSize: 14, color: colors.muted }}>No encontré ninguna con eso.</Text> : null}
      {shown.map((s) => (
        <Pressable key={s.id} onPress={() => onPick(s)} accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
          <Feather name="music" size={16} color={colors.green} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{s.title}</Text>
            {s.author ? <Text style={{ fontSize: 12, color: colors.muted }}>{s.author}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function Editor({ item, songs, churchId, patch, slideCount }: { item: PresentItem; songs: Song[] | null; churchId: string; patch: (p: Partial<PresentItem>) => void; slideCount: number }) {
  const [choosing, setChoosing] = useState(false);
  const box = { gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.bgSoft } as const;
  switch (item.type) {
    case 'song': {
      if (!item.songId || choosing) {
        return (
          <View style={box}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Elegí la canción</Text>
            <SongPicker songs={songs} onPick={(s) => { patch({ songId: s.id, title: s.title, lyrics: s.lyrics } as Partial<PresentItem>); setChoosing(false); }} />
            {choosing ? <Button small title="Cancelar" variant="ghost" onPress={() => setChoosing(false)} /> : null}
          </View>
        );
      }
      return (
        <View style={box}>
          <Button small title="Elegir otra canción" icon="repeat" variant="outline" onPress={() => setChoosing(true)} />
          <Field label="Letra para la pantalla" value={item.lyrics} onChangeText={(lyrics) => patch({ lyrics } as Partial<PresentItem>)} multiline style={{ minHeight: 220 }} />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            Cada estrofa es una diapositiva: dejá una línea vacía entre una y otra. Lo que cambies acá es solo para esta lista; el Cancionero queda igual.
          </Text>
          <Toggle label="Avance automático" hint="La letra pasa sola, sin tocar nada." value={item.auto} onChange={(auto) => patch({ auto } as Partial<PresentItem>)} />
          {item.auto ? (
            <>
              <Stepper label="Tiempo por diapositiva" value={item.secs} text={`${item.secs} seg`} min={SECS_MIN} max={SECS_MAX} onChange={(secs) => patch({ secs } as Partial<PresentItem>)} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Velocidad</Text>
              <Chips options={SPEEDS.map((v) => ({ value: v, label: v === 1 ? 'Normal' : `${v}x` }))} value={item.speed} onChange={(speed) => patch({ speed } as Partial<PresentItem>)} />
              <Text style={{ fontSize: 12, color: colors.muted }}>Así, cada diapositiva queda {Math.round(autoMs(item.secs, item.speed) / 100) / 10} segundos.</Text>
            </>
          ) : null}
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Pista para cantar <Text style={{ color: colors.muted, fontWeight: '500' }}>(opcional)</Text></Text>
          <MediaField kind="audio" media={item.audio} churchId={churchId} onChange={(audio) => patch({ audio } as Partial<PresentItem>)} />
        </View>
      );
    }
    case 'passage': {
      const ok = !!parsePassage(item.ref) && slideCount > 0;
      return (
        <View style={box}>
          <Field label="Cita" value={item.ref} onChangeText={(ref) => patch({ ref } as Partial<PresentItem>)} placeholder="Juan 3:16-18" autoCorrect={false} />
          {item.ref.trim() && !ok ? <Text style={{ fontSize: 13, color: colors.red }}>No encontré ese pasaje. Escribilo así: Juan 3:16-18</Text> : null}
          {ok ? <Text style={{ fontSize: 13, color: colors.greenText }}>{slideCount} {slideCount === 1 ? 'diapositiva' : 'diapositivas'}</Text> : null}
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Versículos en cada diapositiva</Text>
          <Chips options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} value={item.perSlide} onChange={(perSlide) => patch({ perSlide } as Partial<PresentItem>)} />
          {VERSIONS.length > 1 ? (
            <Chips options={VERSIONS.map((v) => ({ value: v.id as string, label: v.short }))} value={item.version} onChange={(version) => patch({ version } as Partial<PresentItem>)} />
          ) : <Text style={{ fontSize: 12, color: colors.muted }}>Texto: {VERSIONS[0].name}, la Biblia que trae la app.</Text>}
        </View>
      );
    }
    case 'countdown':
      return (
        <View style={box}>
          <Stepper label="Minutos" value={item.minutes} text={`${item.minutes} min`} min={1} max={180} onChange={(minutes) => patch({ minutes } as Partial<PresentItem>)} />
          <Field label="Mensaje" hint="(se ve abajo del reloj y queda al llegar a cero)" value={item.message} onChangeText={(message) => patch({ message } as Partial<PresentItem>)} placeholder="Ya empezamos" />
          <Text style={{ fontSize: 12, color: colors.muted }}>El reloj arranca cuando mandás la diapositiva a la pantalla.</Text>
        </View>
      );
    case 'image':
    case 'video':
    case 'music':
      return (
        <View style={box}>
          <Field label="Nombre en la lista" value={item.title} onChangeText={(title) => patch({ title } as Partial<PresentItem>)} />
          <MediaField kind={item.type === 'music' ? 'audio' : item.type} media={item.media} churchId={churchId}
            onChange={(media) => patch({ media, ...(media && (!item.title.trim() || item.title === typeInfo(item.type).label) ? { title: media.name.replace(/\.[A-Za-z0-9]+$/, '') } : {}) } as Partial<PresentItem>)} />
        </View>
      );
    case 'text':
      return (
        <View style={box}>
          <Field label="Nombre en la lista" value={item.title} onChangeText={(title) => patch({ title } as Partial<PresentItem>)} />
          <Field label="Texto" value={item.body} onChangeText={(body) => patch({ body } as Partial<PresentItem>)} multiline style={{ minHeight: 180 }} />
          <Text style={{ fontSize: 12, color: colors.muted }}>Dejá una línea vacía para pasar a otra diapositiva.</Text>
        </View>
      );
    case 'notice':
      return (
        <View style={box}>
          <Field label="Título" value={item.title} onChangeText={(title) => patch({ title } as Partial<PresentItem>)} placeholder="Reunión de jóvenes" />
          <Field label="Detalle" value={item.body} onChangeText={(body) => patch({ body } as Partial<PresentItem>)} multiline placeholder="Sábado a las 19 en la iglesia" />
        </View>
      );
  }
}
