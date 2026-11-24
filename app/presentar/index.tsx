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
import { useBibleReady } from '@/lib/bibleReady';
import { pickPresentMedia, presentUrl, removePresentFiles } from '@/lib/files';
import {
  BLACK, ITEM_TYPES, SECS_MAX, SECS_MIN, SPEEDS, autoMs, autoNext, autoOf, cleanItems, clock, itemSlides, itemTitle, newId, newItem, parsePassage, stageOf, step, typeInfo,
  type AnnouncementsItem, type LiveSlide, type LiveState, type MediaRef, type PresentItem, type PresentItemType, type RemoteCommand, type Slide,
} from '@/lib/present';
import { getServicePlanEntries, listServicePlans, loadAnnouncementCards, type ServicePlanRow } from '@/lib/presentData';
import { planToItems } from '@/lib/presentExtras';
import { openPresentLink, type LinkStatus, type PresentLink } from '@/lib/presentSync';
import { canPresent } from '@/lib/perms';
import { searchKey } from '@/lib/songs';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Song } from '@/types';
import { tx, txLocale } from '@/lib/i18n';

type IconName = React.ComponentProps<typeof Feather>['name'];
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const LIVE_RED = '#D93025';

/** Abre la pantalla de salida: en la computadora, en otra ventana para llevar al proyector. */
function openOutput(which: 'salida' | 'escenario' = 'salida') {
  if (isWeb) {
    // La app en la web vive dentro de una carpeta (/la-mies): hay que sumarla a la dirección.
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const w = window.open(`${base}/presentar/${which}`, `lamies-${which}`, 'popup=yes,width=1280,height=720');
    if (!w) Alert.alert(tx('El navegador no dejó abrir la ventana'), tx('Permití las ventanas emergentes para esta página y probá de nuevo.'));
    return;
  }
  router.push(`/presentar/${which}` as Href);
}

export default function Presentar() {
  const { church, perms, profile } = useAuth();
  const [setId, setSetId] = useState<string | null>(null);
  if (!church) return <Loading />;
  if (!canPresent(perms, profile)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Modo presentación')} back />
        <Empty icon="lock" title={tx('Necesitás permiso')} text={tx('El pastor te puede dar el permiso para manejar la pantalla. Pedíselo: lo activa desde Roles y permisos.')} />
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
    const today = new Date().toLocaleDateString(txLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    setBusy(true);
    try { onOpen(await createPresentSet(name.trim() || tx('Culto del {today}', { today }))); }
    catch (e) { Alert.alert(tx('No se pudo crear la lista'), errorMessage(e)); }
    finally { setBusy(false); }
  };
  const remove = (id: string, label: string) => {
    Alert.alert(tx('¿Borrar esta lista?'), tx('"{label}" se borra con sus fotos, videos y audios. Las canciones del Cancionero no se tocan.', { label }), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Borrar'), style: 'destructive', onPress: async () => {
        try {
          const full = await getPresentSet(id);
          const media = cleanItems(full?.items).flatMap(mediaOf);
          await deletePresentSet(id);
          removePresentFiles(media.map((m) => m.path));
          load();
        } catch (e) { Alert.alert(tx('No se pudo borrar'), errorMessage(e)); }
      } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Modo presentación')} subtitle={tx('Letras, Biblia, fotos y videos en el proyector')} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{tx('Nueva lista del culto')}</Text>
          <Field label={tx('Nombre')} hint={tx('(opcional)')} value={name} onChangeText={setName} placeholder={tx('Culto del domingo')} />
          <Button title={tx('Crear lista')} icon="plus" onPress={create} loading={busy} />
        </Card>

        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="monitor" title={tx('Todavía no hay listas')} text={tx('Creá una lista y sumale canciones, pasajes, fotos y videos. Después abrí la pantalla de salida y llevala al proyector.')} />
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
                    <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Último cambio: {toLocaleDateString}', { toLocaleDateString: new Date(r.updated_at).toLocaleDateString(txLocale(), { day: 'numeric', month: 'long' }) })}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => remove(r.id, r.name)} accessibilityRole="button" accessibilityLabel={tx('Borrar lista')} style={{ padding: 14 }}>
                  <Feather name="trash-2" size={18} color={colors.red} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{tx('Usar este aparato para otra cosa')}</Text>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
            {tx('Una persona maneja la lista desde un aparato. Otro aparato puede ser la pantalla (conectado al proyector o a la tele), la vista de escenario (para los que cantan y el que predica: muestra lo que sigue y la hora) o un control para pasar las diapositivas desde el teléfono.')}
          </Text>
          <Button title={tx('Ser la pantalla de salida')} icon="monitor" variant="outline" onPress={() => openOutput('salida')} />
          <Button title={tx('Ser la vista de escenario')} icon="eye" variant="outline" onPress={() => openOutput('escenario')} />
          <Button title={tx('Ser el control remoto')} icon="smartphone" variant="outline" onPress={() => router.push('/presentar/control' as Href)} />
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
  const [liveAt, setLiveAtState] = useState<{ id: string; slide: number } | null>(null);
  // También en una referencia: si llegan dos "siguiente" seguidos (tecla rápida, control remoto), el segundo
  // tiene que partir de donde dejó el primero y no de lo que todavía muestra la pantalla.
  const liveAtRef = useRef<{ id: string; slide: number } | null>(null);
  const setLiveAt = (p: { id: string; slide: number } | null) => { liveAtRef.current = p; setLiveAtState(p); };
  const [live, setLive] = useState<LiveState>(BLACK);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<LinkStatus>('conectando');
  const [saving, setSaving] = useState<'ok' | 'saving' | 'error'>('ok');
  const [sound, setSound] = useState<{ id: string; name: string; playing: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [plans, setPlans] = useState<ServicePlanRow[] | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  // Lo último de la lista y del nombre, para los cambios que terminan más tarde (subir un archivo, traer los anuncios):
  // así no pisan lo que se cambió mientras tanto.
  const itemsRef = useRef<PresentItem[]>([]);
  const nameRef = useRef('');
  const alive = useRef(true);
  const cardsReq = useRef<Record<string, number>>({});
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // --- Cargar ---
  useEffect(() => {
    getPresentSet(setId).then((s) => {
      if (!s) { setMissing(true); return; }
      const list = cleanItems(s.items);
      itemsRef.current = list;
      nameRef.current = s.name;
      setName(s.name);
      setItems(list);
      setSel(list[0]?.id ?? null);
      // Los anuncios se traen de nuevo cada vez que se abre la lista (si no hay conexión, quedan los guardados).
      list.filter((i) => i.type === 'announcements').forEach((i) => refreshCards(i.id, true));
    }).catch(() => setMissing(true));
    listSongs().then(setSongs).catch(() => setSongs([]));
    // El orden del culto es otra parte de la app: si todavía no está, el botón no aparece.
    listServicePlans(churchId).then((p) => { if (alive.current) setPlans(p); }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, churchId]);

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
      savePresentSet(setId, p.name, p.items)
        .then(() => { if (alive.current && !pending.current) setSaving('ok'); })
        .catch(() => {
          pending.current = pending.current ?? p;
          if (!alive.current) return;
          setSaving('error');
          // Se prueba de nuevo solo en unos segundos (por ejemplo, si se cortó el wifi un momento).
          setTimeout(() => { if (alive.current) setRetry((n) => n + 1); }, 6000);
        });
    }, 1200);
    return () => clearTimeout(t);
  }, [items, name, setId, retry]);
  // Si cierran la pestaña con algo sin guardar, se manda igual.
  useEffect(() => {
    if (!isWeb) return;
    const flush = () => { const p = pending.current; if (p) { pending.current = null; savePresentSet(setId, p.name, p.items).catch(() => undefined); } };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [setId]);
  // Al salir, lo que faltaba guardar se guarda igual.
  useEffect(() => () => { const p = pending.current; if (p) savePresentSet(setId, p.name, p.items).catch(() => undefined); }, [setId]);

  const change = (list: PresentItem[]) => { itemsRef.current = list; touch(nameRef.current, list); setItems(list); };
  const patch = (id: string, part: Partial<PresentItem>) => change(itemsRef.current.map((i) => (i.id === id ? ({ ...i, ...part } as PresentItem) : i)));
  const rename = (n: string) => { nameRef.current = n; touch(n, itemsRef.current); setName(n); };

  /** Trae de la app los anuncios y los eventos de una parte "Anuncios de la app". `quiet`: sin avisar si falla. */
  const refreshCards = async (id: string, quiet = false) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it || it.type !== 'announcements') return;
    if (!quiet) setRefreshing(id);
    const mine = (cardsReq.current[id] = (cardsReq.current[id] ?? 0) + 1);
    try {
      const cards = await loadAnnouncementCards(it);
      // Si mientras tanto se pidió otra vez (cambiaron los días), vale el último pedido.
      if (!alive.current || cardsReq.current[id] !== mine) return;
      const now = itemsRef.current.find((i) => i.id === id);
      if (!now || now.type !== 'announcements') return;
      const same = JSON.stringify(now.cards) === JSON.stringify(cards);
      // Si no cambió nada no se vuelve a guardar la lista.
      if (same && quiet) return;
      patch(id, { cards, loadedAt: Date.now() } as Partial<PresentItem>);
    } catch (e) {
      if (!quiet && alive.current) Alert.alert(tx('No se pudieron traer los anuncios'), errorMessage(e));
    } finally { if (alive.current && !quiet && cardsReq.current[id] === mine) setRefreshing(null); }
  };

  // Los pasajes en una versión que se baja de a un libro (King James) se arman de nuevo cuando el libro llega.
  const bibleReady = useBibleReady((items ?? []).flatMap((i) => { const r = i.type === 'passage' ? parsePassage(i.ref) : null; return r && i.type === 'passage' ? [[i.version, r.book] as [string, number]] : []; }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slides = useMemo(() => new Map((items ?? []).map((i) => [i.id, itemSlides(i, versionOf(i.type === 'passage' ? i.version : undefined))])), [items, bibleReady]);

  // --- Hablar con la pantalla y con el control remoto ---
  const link = useRef<PresentLink | null>(null);
  const liveRef = useRef<LiveState>(BLACK);
  const lastSlide = useRef<LiveState | null>(null);
  const actions = useRef<Record<RemoteCommand, () => void>>({ next: () => undefined, prev: () => undefined, black: () => undefined, logo: () => undefined });
  useEffect(() => {
    const l: PresentLink = openPresentLink(churchId, {
      onStatus: (st) => {
        setStatus(st);
        // Apenas vuelve la conexión, los otros aparatos reciben lo que está en pantalla (sin esperar el próximo aviso).
        if (st === 'conectado' && liveRef.current.at > 0) setTimeout(() => link.current?.sendState({ ...liveRef.current, at: Date.now() }), 0);
      },
      onCommand: (c) => actions.current[c](),
    });
    link.current = l;
    // Si se recargó la página en medio del culto, se sigue con lo que ya está en pantalla (no se pone en negro).
    const last = l.lastLocal();
    if (last && Date.now() - last.at < 6 * 3600 * 1000) {
      liveRef.current = last; setLive(last); if (last.mode === 'slide') lastSlide.current = last;
      // Y se recuerda en qué diapositiva de esta lista se estaba, para que "Siguiente" siga desde ahí.
      const at = readPos(setId);
      if (at && at.stamp === last.stamp) setLiveAt({ id: at.id, slide: at.slide });
    }
    // Se repite cada 5 segundos por si un aparato se conectó tarde o se le cortó la señal.
    const beat = setInterval(() => { if (liveRef.current.at > 0) l.sendState({ ...liveRef.current, at: Date.now() }); }, 5000);
    return () => { clearInterval(beat); l.close(); link.current = null; };
  }, [churchId, setId]);

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
      if (!url) { Alert.alert(tx('No se pudo abrir el archivo'), tx('Revisá la conexión y probá de nuevo.')); return; }
      out = s.kind === 'image' ? { kind: 'image', url } : { kind: 'video', url, playing: true, startedAt: Date.now() };
    } else if (s.kind === 'countdown') {
      out = { kind: 'countdown', endsAt: Date.now() + s.minutes * 60000, message: s.message };
    } else out = s;
    setLiveAt({ id, slide: index });
    setSel(id);
    setPaused(false);
    // Para la vista de escenario: qué parte es y qué diapositiva sigue.
    const list = itemsRef.current;
    const stage = stageOf(
      list.map((i) => ({ title: itemTitle(i), slides: slidesRef.current.get(i.id) ?? [], loop: !!autoOf(i)?.loop })),
      { item: list.findIndex((i) => i.id === id), slide: index },
    );
    const stamp = newId();
    writePos(setId, { id, slide: index, stamp });
    push({ v: 1, mode: 'slide', slide: out, stamp, at: Date.now(), ...(stage ? { stage } : {}) });
  }, [push, setId]);

  const move = (dir: 1 | -1) => {
    const list = items ?? [];
    const counts = list.map((i) => slides.get(i.id)?.length ?? 0);
    const cur = liveAtRef.current;
    const at = cur ? list.findIndex((i) => i.id === cur.id) : -1;
    let next = step(counts, at >= 0 && cur ? { item: at, slide: cur.slide } : null, dir);
    // Si todavía no hay nada en pantalla, arranca por la parte elegida.
    if (at < 0 && dir === 1) {
      const chosen = list.findIndex((i) => i.id === sel);
      if (chosen >= 0 && counts[chosen] > 0) next = { item: chosen, slide: 0 };
    }
    if (next) show(list[next.item].id, next.slide);
  };
  const toggleMode = (mode: 'black' | 'logo') => {
    if (liveRef.current.mode === mode) {
      // Tocar de nuevo vuelve a lo que estaba.
      if (lastSlide.current) {
        const stamp = newId();
        if (liveAtRef.current) writePos(setId, { ...liveAtRef.current, stamp });
        push({ ...lastSlide.current, stamp, at: Date.now() });
      }
      return;
    }
    // En negro o con el logo, la vista de escenario sigue mostrando lo que viene.
    const stage = lastSlide.current?.stage;
    push({ v: 1, mode, slide: null, stamp: newId(), at: Date.now(), ...(stage ? { stage } : {}) });
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
      // Con la tecla apretada, Negro y Logo no parpadean (se toma una sola vez).
      if (e.repeat && (c === 'black' || c === 'logo')) return;
      actions.current[c]();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // --- Avance automático de la letra ---
  const liveItem = liveAt ? (items ?? []).find((i) => i.id === liveAt.id) ?? null : null;
  const auto = live.mode === 'slide' ? autoOf(liveItem) : null;
  const autoId = auto ? liveItem?.id : undefined;
  const autoWait = auto?.ms ?? 0;
  const autoLoop = !!auto?.loop;
  const liveSlideIndex = liveAt?.slide ?? -1;
  const autoTotal = autoId ? slides.get(autoId)?.length ?? 0 : 0;
  useEffect(() => {
    if (!autoId || paused) return;
    // La última de una canción queda quieta; los anuncios vuelven a empezar.
    const next = autoNext(autoTotal, liveSlideIndex, autoLoop);
    if (next === null) return;
    const t = setTimeout(() => show(autoId, next), autoWait);
    return () => clearTimeout(t);
  }, [autoId, autoWait, autoLoop, autoTotal, liveSlideIndex, paused, live.stamp, show]);

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
    if (!url) { Alert.alert(tx('No se pudo abrir el audio'), tx('Revisá la conexión y probá de nuevo.')); return; }
    try {
      const p = createAudioPlayer({ uri: url });
      player.current = p;
      p.play();
      setSound({ id, name: media.name, playing: true });
    } catch { Alert.alert(tx('No se pudo reproducir el audio')); }
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
    change([...itemsRef.current, it]);
    setSel(it.id);
    setEdit(true);
    setAdding(false);
    if (type === 'announcements') refreshCards(it.id);
  };
  /** Trae un orden del culto y suma sus partes al final de la lista. */
  const importPlan = async (plan: ServicePlanRow) => {
    setPlanBusy(true);
    try {
      const entries = await getServicePlanEntries(plan.id);
      if (!alive.current) return;
      const fresh = entries ? planToItems(entries, songs ?? []) : [];
      if (!fresh.length) { Alert.alert(tx('Ese orden del culto está vacío'), tx('Cargale las partes y probá de nuevo.')); return; }
      change([...itemsRef.current, ...fresh]);
      setSel(fresh[0].id);
      setEdit(false);
      setPlanOpen(false);
      fresh.filter((i) => i.type === 'announcements').forEach((i) => refreshCards(i.id, true));
      const noLyrics = fresh.filter((i) => i.type === 'song' && !i.songId).length;
      Alert.alert(
        fresh.length === 1 ? tx('Se sumó 1 parte') : tx('Se sumaron {n} partes', { n: fresh.length }),
        noLyrics ? tx('{v1} en el Cancionero. Tocala y elegila a mano.', { v1: noLyrics === 1 ? tx('Hay 1 canción que no encontré') : tx('Hay {noLyrics} canciones que no encontré', { noLyrics }) }) : tx('Revisá la lista antes de empezar.'),
      );
    } finally { if (alive.current) setPlanBusy(false); }
  };
  const removeItem = (it: PresentItem) => {
    Alert.alert(tx('¿Quitar de la lista?'), itemTitle(it), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Quitar'), style: 'destructive', onPress: () => {
        const list = itemsRef.current.filter((i) => i.id !== it.id);
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
    const list = [...itemsRef.current];
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    change(list);
  };

  if (missing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Modo presentación')} back />
        <Empty icon="alert-circle" title={tx('No se pudo abrir la lista')} text={tx('Revisá la conexión y probá de nuevo.')} />
        <View style={{ padding: 16 }}><Button title={tx('Volver a las listas')} variant="outline" onPress={onClose} /></View>
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
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>{tx('EN PANTALLA')}</Text>
        <Text style={{ fontSize: 12, color: status === 'conectado' ? colors.greenText : colors.muted }}>
          {status === 'conectado' ? tx('Otros aparatos: conectado') : status === 'conectando' ? tx('Conectando…') : tx('Otros aparatos: sin conexión')}
        </Text>
      </View>
      <View style={{ alignSelf: 'center', borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: LIVE_RED }}>
        <PresentSlide live={live} width={previewW} height={Math.round((previewW * 9) / 16)} logoUrl={logo} churchName={churchName} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={tx('Anterior')} icon="arrow-left" variant="outline" onPress={() => move(-1)} style={{ flex: 1 }} />
        <Button title={tx('Siguiente')} icon="arrow-right" onPress={() => move(1)} style={{ flex: 1.4 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={tx('Negro')} icon="square" variant={live.mode === 'black' ? 'primary' : 'outline'} onPress={() => toggleMode('black')} style={{ flex: 1 }} />
        <Button title={tx('Logo')} icon="home" variant={live.mode === 'logo' ? 'primary' : 'outline'} onPress={() => toggleMode('logo')} style={{ flex: 1 }} />
      </View>
      {auto ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>
            {paused ? (autoLoop ? tx('Los anuncios están en pausa.') : tx('La letra está en pausa.'))
              : tx('{pl} cada {v1} segundos.', { pl: autoLoop ? tx('Los anuncios pasan solos') : tx('La letra pasa sola'), v1: Math.round(autoWait / 100) / 10 })}
          </Text>
          <Button small title={paused ? tx('Seguir##reproducir') : tx('Pausar')} icon={paused ? 'play' : 'pause'} variant="outline" onPress={() => setPaused((p) => !p)} />
        </View>
      ) : null}
      {live.mode === 'slide' && live.slide?.kind === 'video' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small title={live.slide.playing ? tx('Pausar video') : tx('Seguir video')} icon={live.slide.playing ? 'pause' : 'play'} variant="outline" onPress={() => setVideo({ playing: !(live.slide as { playing: boolean }).playing })} style={{ flex: 1 }} />
          <Button small title={tx('Desde el principio')} icon="rotate-ccw" variant="outline" onPress={() => setVideo({ playing: true, restart: true })} style={{ flex: 1 }} />
        </View>
      ) : null}
      {sound ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.greenSoft }}>
          <Feather name="volume-2" size={18} color={colors.greenText} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.greenText }} numberOfLines={1}>{sound.playing ? tx('Sonando') : tx('En pausa')}: {sound.name}</Text>
          <Button small title={sound.playing ? tx('Pausar') : tx('Seguir##reproducir')} variant="outline" onPress={toggleSound} />
          <Button small title={tx('Parar')} variant="danger" onPress={stopSound} />
        </View>
      ) : null}
      <Button title={tx('Abrir pantalla de salida')} icon="monitor" variant="outline" onPress={() => openOutput('salida')} />
      <Button title={tx('Abrir vista de escenario')} icon="eye" variant="outline" onPress={() => openOutput('escenario')} />
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
        {isWeb
          ? tx('Se abre otra ventana: llevala al proyector y poné pantalla completa. Teclado: flechas o espacio para pasar, B para negro, L para el logo. La vista de escenario es para los que cantan: muestra lo que sigue y la hora.')
          : tx('En este aparato la pantalla ocupa todo: tocá la derecha para pasar y la izquierda para volver. Para manejar desde acá y mostrar en otro aparato, abrí la pantalla de salida en el otro. La vista de escenario es para los que cantan: muestra lo que sigue y la hora.')}
      </Text>
    </Card>
  );

  // ---------- La lista del culto ----------
  const playlist = (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tx('Volver a las listas')} style={{ padding: 4 }}>
          <Feather name="chevron-left" size={22} color={colors.green} />
        </Pressable>
        <TextInput value={name} onChangeText={rename} placeholder={tx('Nombre de la lista')} placeholderTextColor="#8B918C" accessibilityLabel={tx('Nombre de la lista')}
          style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text, paddingVertical: 6 }} />
        <Text style={{ fontSize: 11, color: saving === 'error' ? colors.red : colors.muted }}>{saving === 'ok' ? tx('Guardado') : saving === 'saving' ? tx('Guardando…') : tx('No se guardó')}</Text>
      </View>
      {!items.length ? <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>{tx('La lista está vacía. Tocá "Agregar" y elegí qué querés mostrar.')}</Text> : null}
      {items.map((it, i) => {
        const on = it.id === sel;
        const isLive = liveAt?.id === it.id && live.mode === 'slide';
        return (
          <Pressable key={it.id} testID="presentar-parte" onPress={() => { setSel(it.id); setEdit(false); }} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: isLive ? LIVE_RED : on ? colors.green : colors.border, backgroundColor: on ? colors.greenSoft : colors.bg }}>
            <Text style={{ width: 18, fontSize: 12, fontWeight: '700', color: colors.muted, textAlign: 'center' }}>{i + 1}</Text>
            <Feather name={typeInfo(it.type).icon as IconName} size={18} color={on ? colors.greenText : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }} numberOfLines={1}>{itemTitle(it)}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{typeInfo(it.type).label}</Text>
            </View>
            {sound?.id === it.id ? <Feather name="volume-2" size={16} color={colors.green} /> : null}
            {isLive ? <Tag text={tx('En pantalla')} tone="red" /> : null}
          </Pressable>
        );
      })}
      {adding ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{tx('¿Qué querés agregar?')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ITEM_TYPES.map((t) => (
              <Pressable key={t.type} onPress={() => add(t.type)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bgSoft }}>
                <Feather name={t.icon as IconName} size={16} color={colors.green} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button small title={tx('Cancelar')} variant="ghost" onPress={() => setAdding(false)} />
        </View>
      ) : <Button title={tx('Agregar')} icon="plus" variant="outline" onPress={() => setAdding(true)} />}
      {plans !== null && !adding ? (
        planOpen ? (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{tx('¿De qué día?')}</Text>
            {!plans.length ? <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>{tx('Todavía no hay un orden del culto cargado para estos días.')}</Text> : null}
            {plans.map((p) => (
              <Pressable key={p.id} onPress={() => { if (!planBusy) importPlan(p); }} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bgSoft, opacity: planBusy ? 0.5 : 1 }}>
                <Feather name="calendar" size={16} color={colors.green} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={2}>{planDay(p.service_date)}{p.title ? ` · ${p.title}` : ''}</Text>
              </Pressable>
            ))}
            <Button small title={tx('Cancelar')} variant="ghost" onPress={() => setPlanOpen(false)} />
          </View>
        ) : (
          <Button title={tx('Traer el orden del culto')} icon="download" variant="outline"
            onPress={() => { setPlanOpen(true); listServicePlans(churchId).then((p) => { if (alive.current && p) setPlans(p); }).catch(() => undefined); }} />
        )
      ) : null}
    </Card>
  );

  // ---------- La parte elegida: sus diapositivas y cómo cambiarla ----------
  const list = selected ? slides.get(selected.id) ?? [] : [];
  const thumbW = wide ? 210 : Math.floor((Math.min(width, 720) - 32 - 32 - 10) / 2);
  const detail = !selected ? null : (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text }} numberOfLines={2}>{itemTitle(selected)}</Text>
        <Pressable onPress={() => shift(selected.id, -1)} accessibilityRole="button" accessibilityLabel={tx('Subir en la lista')} style={{ padding: 8 }}><Feather name="arrow-up" size={18} color={colors.muted} /></Pressable>
        <Pressable onPress={() => shift(selected.id, 1)} accessibilityRole="button" accessibilityLabel={tx('Bajar en la lista')} style={{ padding: 8 }}><Feather name="arrow-down" size={18} color={colors.muted} /></Pressable>
        <Pressable onPress={() => removeItem(selected)} accessibilityRole="button" accessibilityLabel={tx('Quitar de la lista')} style={{ padding: 8 }}><Feather name="trash-2" size={18} color={colors.red} /></Pressable>
        <Button small title={edit ? tx('Listo') : tx('Cambiar')} icon={edit ? 'check' : 'edit-2'} variant={edit ? 'primary' : 'outline'} onPress={() => setEdit((e) => !e)} />
      </View>

      {edit ? <Editor item={selected} songs={songs} churchId={churchId} patch={(p) => patch(selected.id, p)} slideCount={list.length}
        refresh={() => refreshCards(selected.id)} refreshing={refreshing === selected.id} /> : null}

      {selected.type === 'announcements' ? (
        <View style={{ gap: 6 }}>
          {list.length ? <Button title={tx('Empezar los anuncios')} icon="play" onPress={() => show(selected.id, 0)} /> : null}
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            {list.length
              ? tx('Pasan solos cada {secs} segundos y dan vueltas hasta que pasás a otra parte de la lista. {cardsWhen}', { secs: selected.secs, cardsWhen: cardsWhen(selected) })
              : refreshing === selected.id ? tx('Buscando los anuncios…') : tx('No hay anuncios para toda la iglesia ni eventos en estos días. Tocá "Cambiar" para elegir más días.')}
          </Text>
        </View>
      ) : null}
      {selected.type === 'video' && selected.media && !isWeb ? (
        <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19, padding: 10, borderRadius: 10, backgroundColor: colors.bgSoft }}>
          {tx('Los videos se ven solo cuando la pantalla de salida está abierta en una computadora (en el navegador). En una tablet o un teléfono todavía no se pueden mostrar. Lo demás (letras, Biblia, fotos, cuenta regresiva y música) anda en todos los aparatos.')}
        </Text>
      ) : null}

      {selected.type === 'song' && list.length ? (
        <View style={{ gap: 6 }}>
          <Button title={selected.audio ? tx('Empezar la canción con la pista') : tx('Empezar la canción')} icon="play"
            onPress={() => { show(selected.id, 0); if (selected.audio) playSound(selected.id, selected.audio); }} />
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {tx('{v1}Para cambiar esto tocá "Cambiar".', { v1: selected.auto ? tx('La letra pasa sola cada {v1} segundos. ', { v1: Math.round(autoMs(selected.secs, selected.speed) / 100) / 10 }) : tx('Vos pasás la letra con "Siguiente". ') })}
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
                  <Button title={sound.playing ? tx('Pausar') : tx('Seguir##reproducir')} icon={sound.playing ? 'pause' : 'play'} onPress={toggleSound} style={{ flex: 1 }} />
                  <Button title={tx('Parar')} icon="square" variant="danger" onPress={stopSound} style={{ flex: 1 }} />
                </>
              ) : <Button title={tx('Reproducir')} icon="play" onPress={() => playSound(selected.id, selected.media!)} style={{ flex: 1 }} />}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted }}>{tx('La música suena en este aparato. La pantalla queda como está.')}</Text>
          </View>
        ) : !edit ? <Text style={{ fontSize: 14, color: colors.muted }}>{tx('Todavía no subiste el audio. Tocá "Cambiar".')}</Text> : null
      ) : null}

      {selected.type !== 'music' ? (
        list.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {list.map((s, i) => {
              const isLive = liveAt?.id === selected.id && liveAt.slide === i && live.mode === 'slide';
              return (
                <Pressable key={i} onPress={() => show(selected.id, i)} accessibilityRole="button" accessibilityLabel={tx('Mostrar diapositiva {v1}', { v1: i + 1 })} style={{ gap: 4 }}>
                  <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 3, borderColor: isLive ? LIVE_RED : colors.border }}>
                    <Thumb slide={s} width={thumbW} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isLive ? LIVE_RED : colors.muted, width: thumbW }} numberOfLines={1}>
                    {i + 1}{s.kind === 'text' && s.label ? ` · ${s.label}` : ''}{isLive ? tx(' · EN PANTALLA') : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : !edit && selected.type !== 'announcements' ? <Text style={{ fontSize: 14, color: colors.muted }}>{tx('Esta parte todavía no tiene nada para mostrar. Tocá "Cambiar".')}</Text> : null
      ) : null}
      {list.length ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Tocá una diapositiva para mandarla a la pantalla.')}</Text> : null}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPage }}>
      <Header title={tx('Modo presentación')} subtitle={name || tx('Lista del culto')} back />
      {wide ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingBottom: 14 }}>
          <ScrollView style={{ width: 300, flexGrow: 0 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">{playlist}</ScrollView>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            {detail ?? <Empty icon="monitor" title={tx('Elegí una parte de la lista')} text={tx('A la izquierda está la lista del culto. Agregá una canción o un pasaje para empezar.')} />}
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

/** "dom 29/11" */
function planDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const day = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(y, m - 1, d).getDay()];
  return `${day} ${d}/${m}`;
}

/** "Actualizado hoy a las 10:32." */
function cardsWhen(item: AnnouncementsItem): string {
  if (!item.loadedAt) return '';
  const d = new Date(item.loadedAt);
  const today = new Date().toDateString() === d.toDateString();
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return tx('Actualizado {v1} a las {time}.', { v1: today ? 'hoy' : `el ${d.getDate()}/${d.getMonth() + 1}`, time });
}

// En la computadora se recuerda en qué diapositiva de la lista se estaba, por si se recarga la página en medio del culto.
type SavedPos = { id: string; slide: number; stamp: string };
const posKey = (setId: string) => `lamies-presentar-pos-${setId}`;
function writePos(setId: string, p: SavedPos) {
  if (!isWeb) return;
  try { window.sessionStorage.setItem(posKey(setId), JSON.stringify(p)); } catch { /* modo privado */ }
}
function readPos(setId: string): SavedPos | null {
  if (!isWeb) return null;
  try {
    const p = JSON.parse(window.sessionStorage.getItem(posKey(setId)) ?? 'null') as Partial<SavedPos> | null;
    return p && typeof p.id === 'string' && typeof p.slide === 'number' && typeof p.stamp === 'string' ? (p as SavedPos) : null;
  } catch { return null; }
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
    : slide.kind === 'image' ? (url ? { kind: 'image', url } : { kind: 'text', text: tx('Foto'), label: null, footer: slide.media.name })
    : slide.kind === 'video' ? { kind: 'text', text: tx('Video'), label: null, footer: slide.media.name }
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
      {btn('minus', value - by, tx('Menos: {label}', { label }))}
      <Text style={{ minWidth: 76, fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{text}</Text>
      {btn('plus', value + by, tx('Más: {label}', { label }))}
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
    } catch (e) { Alert.alert(tx('No se pudo subir'), errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 8 }}>
      {media ? <Text style={{ fontSize: 14, color: colors.text }}>{tx('Archivo:')} <Text style={{ fontWeight: '700' }}>{media.name}</Text></Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={busy ? tx('Subiendo…') : media ? tx('Cambiar {word}', { word }) : tx('Subir {word}', { word })} icon="upload" variant={media ? 'outline' : 'primary'} onPress={pick} loading={busy} style={{ flex: 1 }} />
        {media ? <Button title={tx('Quitar')} variant="danger" onPress={() => { removePresentFiles([media.path]); onChange(null); }} /> : null}
      </View>
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
        {tx('Hasta 50 MB.{v1}', { v1: kind === 'video' ? tx(' Usá videos en MP4. El video se ve y se escucha solo cuando la pantalla de salida está abierta en una computadora (en el navegador); en una tablet o un teléfono todavía no.') : kind === 'audio' ? tx(' Usá MP3. Subí solo música que tu iglesia puede usar.') : '' })}
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
        <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>{tx('El Cancionero está vacío. Primero cargá ahí las canciones con su letra.')}</Text>
        <Button title={tx('Ir al Cancionero')} icon="music" variant="outline" onPress={() => router.push('/canciones' as Href)} />
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSoft }}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder={tx('Buscar en el Cancionero')} placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} autoCorrect={false} />
      </View>
      {!shown.length ? <Text style={{ fontSize: 14, color: colors.muted }}>{tx('No encontré ninguna con eso.')}</Text> : null}
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

function Editor({ item, songs, churchId, patch, slideCount, refresh, refreshing }: {
  item: PresentItem; songs: Song[] | null; churchId: string; patch: (p: Partial<PresentItem>) => void; slideCount: number;
  /** Solo para "Anuncios de la app": traerlos de nuevo. */
  refresh: () => void; refreshing: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const box = { gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.bgSoft } as const;
  switch (item.type) {
    case 'song': {
      if (!item.songId || choosing) {
        return (
          <View style={box}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{tx('Elegí la canción')}</Text>
            <SongPicker songs={songs} onPick={(s) => { patch({ songId: s.id, title: s.title, lyrics: s.lyrics } as Partial<PresentItem>); setChoosing(false); }} />
            {choosing ? <Button small title={tx('Cancelar')} variant="ghost" onPress={() => setChoosing(false)} /> : null}
          </View>
        );
      }
      return (
        <View style={box}>
          <Button small title={tx('Elegir otra canción')} icon="repeat" variant="outline" onPress={() => setChoosing(true)} />
          <Field label={tx('Letra para la pantalla')} value={item.lyrics} onChangeText={(lyrics) => patch({ lyrics } as Partial<PresentItem>)} multiline style={{ minHeight: 220 }} />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            {tx('Cada estrofa es una diapositiva: dejá una línea vacía entre una y otra. Lo que cambies acá es solo para esta lista; el Cancionero queda igual.')}
          </Text>
          <Toggle label={tx('Avance automático')} hint={tx('La letra pasa sola, sin tocar nada.')} value={item.auto} onChange={(auto) => patch({ auto } as Partial<PresentItem>)} />
          {item.auto ? (
            <>
              <Stepper label={tx('Tiempo por diapositiva')} value={item.secs} text={tx('{secs} seg', { secs: item.secs })} min={SECS_MIN} max={SECS_MAX} onChange={(secs) => patch({ secs } as Partial<PresentItem>)} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{tx('Velocidad')}</Text>
              <Chips options={SPEEDS.map((v) => ({ value: v, label: v === 1 ? tx('Normal') : `${v}x` }))} value={item.speed} onChange={(speed) => patch({ speed } as Partial<PresentItem>)} />
              <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Así, cada diapositiva queda {v1} segundos.', { v1: Math.round(autoMs(item.secs, item.speed) / 100) / 10 })}</Text>
            </>
          ) : null}
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{tx('Pista para cantar')} <Text style={{ color: colors.muted, fontWeight: '500' }}>{tx('(opcional)')}</Text></Text>
          <MediaField kind="audio" media={item.audio} churchId={churchId} onChange={(audio) => patch({ audio } as Partial<PresentItem>)} />
        </View>
      );
    }
    case 'passage': {
      const ok = !!parsePassage(item.ref) && slideCount > 0;
      return (
        <View style={box}>
          <Field label={tx('Cita')} value={item.ref} onChangeText={(ref) => patch({ ref } as Partial<PresentItem>)} placeholder={tx('Juan 3:16-18')} autoCorrect={false} />
          {item.ref.trim() && !ok ? <Text style={{ fontSize: 13, color: colors.red }}>{tx('No encontré ese pasaje. Escribilo así: Juan 3:16-18')}</Text> : null}
          {ok ? <Text style={{ fontSize: 13, color: colors.greenText }}>{slideCount} {slideCount === 1 ? tx('diapositiva') : tx('diapositivas')}</Text> : null}
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{tx('Versículos en cada diapositiva')}</Text>
          <Chips options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} value={item.perSlide} onChange={(perSlide) => patch({ perSlide } as Partial<PresentItem>)} />
          {VERSIONS.length > 1 ? (
            <Chips options={VERSIONS.map((v) => ({ value: v.id as string, label: v.short }))} value={item.version} onChange={(version) => patch({ version } as Partial<PresentItem>)} />
          ) : <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Texto: {name}, la Biblia que trae la app.', { name: VERSIONS[0].name })}</Text>}
        </View>
      );
    }
    case 'countdown':
      return (
        <View style={box}>
          <Stepper label={tx('Minutos')} value={item.minutes} text={tx('{minutes} min', { minutes: item.minutes })} min={1} max={180} onChange={(minutes) => patch({ minutes } as Partial<PresentItem>)} />
          <Field label={tx('Mensaje')} hint={tx('(se ve abajo del reloj y queda al llegar a cero)')} value={item.message} onChangeText={(message) => patch({ message } as Partial<PresentItem>)} placeholder={tx('Ya empezamos')} />
          <Text style={{ fontSize: 12, color: colors.muted }}>{tx('El reloj arranca cuando mandás la diapositiva a la pantalla.')}</Text>
        </View>
      );
    case 'image':
    case 'video':
    case 'music':
      return (
        <View style={box}>
          <Field label={tx('Nombre en la lista')} value={item.title} onChangeText={(title) => patch({ title } as Partial<PresentItem>)} />
          <MediaField kind={item.type === 'music' ? 'audio' : item.type} media={item.media} churchId={churchId}
            onChange={(media) => patch({ media, ...(media && (!item.title.trim() || item.title === typeInfo(item.type).label) ? { title: media.name.replace(/\.[A-Za-z0-9]+$/, '') } : {}) } as Partial<PresentItem>)} />
        </View>
      );
    case 'text':
      return (
        <View style={box}>
          <Field label={tx('Nombre en la lista')} value={item.title} onChangeText={(title) => patch({ title } as Partial<PresentItem>)} />
          <Field label={tx('Texto')} value={item.body} onChangeText={(body) => patch({ body } as Partial<PresentItem>)} multiline style={{ minHeight: 180 }} />
          <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Dejá una línea vacía para pasar a otra diapositiva.')}</Text>
        </View>
      );
    case 'notice':
      return (
        <View style={box}>
          <Field label={tx('Título')} value={item.title} onChangeText={(title) => patch({ title } as Partial<PresentItem>)} placeholder={tx('Reunión de jóvenes')} />
          <Field label={tx('Detalle')} value={item.body} onChangeText={(body) => patch({ body } as Partial<PresentItem>)} multiline placeholder={tx('Sábado a las 19 en la iglesia')} />
        </View>
      );
    case 'announcements': {
      // Al cambiar qué se muestra, se traen de nuevo.
      const set = (p: Partial<AnnouncementsItem>) => { patch(p as Partial<PresentItem>); refresh(); };
      return (
        <View style={box}>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
            {tx('La app arma sola una diapositiva por cada anuncio y por cada evento del calendario. Sirve para dejar pasando antes del culto.')}
          </Text>
          <Toggle label={tx('Anuncios')} hint={tx('Solo los que se mandaron a toda la iglesia.')} value={item.anns} onChange={(anns) => set({ anns })} />
          {item.anns ? <Stepper label={tx('De los últimos')} value={item.days} text={item.days === 1 ? tx('1 día') : tx('{days} días', { days: item.days })} min={1} max={60} onChange={(days) => set({ days })} /> : null}
          <Toggle label={tx('Eventos del calendario')} hint={tx('Los que vienen.')} value={item.events} onChange={(events) => set({ events })} />
          {item.events ? (
            <>
              <Stepper label={tx('De los próximos')} value={item.ahead} text={item.ahead === 1 ? tx('1 día') : tx('{ahead} días', { ahead: item.ahead })} min={1} max={90} onChange={(ahead) => set({ ahead })} />
              <Toggle label={tx('Reuniones de todas las semanas')} hint={tx('Las que cargaste como reunión semanal en el calendario.')} value={item.weekly} onChange={(weekly) => set({ weekly })} />
            </>
          ) : null}
          <Stepper label={tx('Tiempo por diapositiva')} value={item.secs} text={tx('{secs} seg', { secs: item.secs })} min={SECS_MIN} max={SECS_MAX} onChange={(secs) => patch({ secs } as Partial<PresentItem>)} />
          <Button small title={refreshing ? tx('Buscando…') : tx('Actualizar ahora')} icon="refresh-cw" variant="outline" onPress={refresh} loading={refreshing} />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            {tx('{slideCount} {pl}. {cardsWhen} Se actualizan solas cada vez que abrís esta lista.', { slideCount, pl: slideCount === 1 ? tx('diapositiva') : tx('diapositivas'), cardsWhen: cardsWhen(item) })}
          </Text>
        </View>
      );
    }
    case 'sermon':
      return (
        <View style={box}>
          <Field label={tx('Bosquejo')} value={item.outline} onChangeText={(outline) => patch({ outline } as Partial<PresentItem>)} multiline style={{ minHeight: 260 }} autoCorrect={false}
            placeholder={tx('El amor de Dios\n1. Dios ama a todos (Juan 3:16)\n- Nadie queda afuera\n2. Dios lo demostró (Romanos 5:8)\n1 Juan 4:9-10')} />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            {tx('Pegá el bosquejo. La primera línea es el título. Cada línea es una diapositiva; las que empiezan con guion (-) llevan arriba el punto al que pertenecen. Las citas (Juan 3:16-18, Ro 5:8; 1 Jn 1:9) se abren solas con el texto de la Biblia de la app. Dejá solo lo que querés que se vea.')}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{tx('Versículos en cada diapositiva')}</Text>
          <Chips options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} value={item.perSlide} onChange={(perSlide) => patch({ perSlide } as Partial<PresentItem>)} />
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {tx('{slideCount} {pl} · Texto: {name}, la Biblia que trae la app.', { slideCount, pl: slideCount === 1 ? tx('diapositiva') : tx('diapositivas'), name: versionOf(item.version).name })}
          </Text>
        </View>
      );
  }
}
