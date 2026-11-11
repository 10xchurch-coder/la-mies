// Crecimiento espiritual: para leer y crecer. Arriba "¿Cómo ser salvo?"; después carpetas:
// Lo que creemos, Preguntas y respuestas, Finanzas bíblicas. Se busca en todo.
// Con ?seccion=… se abre una carpeta.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading, SectionTitle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { listTraining } from '@/lib/api';
import type { TrainingItem } from '@/types';
import { colors } from '@/theme';

type Row = { id: string; slug: string; section: string; title: string; summary: string | null; sort_order: number; body?: string };
type IconName = React.ComponentProps<typeof Feather>['name'];

const EVANG = 'Evangelismo personal';
const FOLDERS: { section: string; icon: IconName; hint: string; bg: string; fg: string }[] = [
  { section: EVANG, icon: 'compass', hint: 'Todo para aprender a compartir a Cristo: cómo presentar el evangelio a cada persona y creencia, tu testimonio y qué responder', bg: 'amberSoft', fg: 'amberText' },
  { section: 'Lo que creemos', icon: 'book-open', hint: 'Las doctrinas de la iglesia, explicadas con la Biblia', bg: 'greenSoft', fg: 'greenText' },
  { section: 'Preguntas y respuestas', icon: 'help-circle', hint: 'Las preguntas más comunes sobre la fe', bg: 'blueSoft', fg: 'blueText' },
  { section: 'Finanzas bíblicas', icon: 'dollar-sign', hint: 'El dinero, el trabajo, las deudas y los negocios según Dios', bg: 'amberSoft', fg: 'amberText' },
];
const pal = colors as unknown as Record<string, string>;

function ArticleRow({ r, icon, onPress }: { r: Row; icon: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={19} color={colors.greenText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.title}</Text>
          {r.summary ? <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }} numberOfLines={2}>{r.summary}</Text> : null}
        </View>
        <Feather name="chevron-right" size={18} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

export default function Crecimiento() {
  const router = useRouter();
  const { seccion, sub } = useLocalSearchParams<{ seccion?: string; sub?: string }>();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [train, setTrain] = useState<TrainingItem[]>([]);
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    listTraining().then(setTrain).catch(() => undefined);
    supabase.from('growth_articles').select('id, slug, section, title, summary, sort_order, body').order('sort_order').then(({ data }) => setRows((data as Row[]) ?? []));
  }, []);
  useFocusEffect(load);

  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const s = n(q.trim());
  const found = useMemo(() => (s ? (rows ?? []).filter((r) => (!seccion || r.section === seccion) && n(`${r.title} ${r.summary ?? ''} ${r.body ?? ''}`).includes(s)) : []), [rows, s, seccion]);
  const open = (r: Row) => router.push(`/crecimiento/${r.slug}` as Href);
  const trainRow = (t: TrainingItem): Row => ({ id: t.id, slug: t.id, section: t.category, title: t.title, summary: t.summary, sort_order: t.sort_order });
  const openTrain = (r: Row) => router.push(`/capacitacion/${r.id}` as Href);
  const art = (slug: string) => (rows ?? []).find((r) => r.slug === slug);
  const cat = (name: string) => train.filter((t) => t.category === name).map(trainRow);
  // La carpeta de evangelismo: un solo lugar, en el orden en que se aprende. Lo de capacitación se muestra desde acá sin copiarlo.
  type EvangBlock = { key: string; title: string; icon: IconName; hint: string; items: { r: Row; train?: boolean }[] };
  const evangBlocks: EvangBlock[] = (() => {
    const A = (slug: string) => { const r = art(slug); return r ? [{ r }] : []; };
    const T = (name: string) => cat(name).map((r) => ({ r, train: true }));
    const known = ['Tips para recordar', 'Presentaciones del evangelio', 'Respuestas bíblicas', 'Objeciones comunes'];
    const more = [...new Set(train.map((t) => t.category))].filter((c) => !known.includes(c)).flatMap((c) => T(c));
    const used = new Set<string>();
    const AA = (...slugs: string[]) => slugs.flatMap((x) => { used.add(x); return A(x); });
    const blocks: EvangBlock[] = [
      { key: 'empezar', title: '1. Para empezar', icon: 'flag', hint: 'Guía para principiantes, cómo empezar una conversación y tips para recordar', items: [...AA('guia-principiantes', 'por-que-compartir', 'empezar-conversacion', 'principios-conversacion'), ...T('Tips para recordar')] },
      { key: 'presentar', title: '2. Cómo presentar el evangelio', icon: 'message-circle', hint: 'El mensaje paso a paso y cómo guiar a alguien a confiar en Cristo', items: [...AA('salvacion'), ...T('Presentaciones del evangelio'), ...AA('guiar-a-confiar-en-cristo')] },
      { key: 'quien', title: '3. A quién se lo presentás', icon: 'users', hint: 'Niños, jóvenes, por WhatsApp y a quien está sufriendo', items: AA('evangelio-a-un-nino', 'evangelio-a-jovenes', 'evangelio-por-whatsapp', 'evangelio-a-quien-sufre') },
      { key: 'creencias', title: '4. Según lo que cree la persona', icon: 'globe', hint: 'Ateo, católico, testigo de Jehová, mormón, adventista, musulmán, budista y más', items: AA('creencia-ateismo', 'creencia-agnosticismo', 'creencia-indiferente', 'creencia-cristiano-de-nombre', 'creencia-catolico', 'creencia-religiosidad-popular', 'creencia-testigos-de-jehova', 'creencia-mormones', 'creencia-adventistas', 'creencia-islam', 'creencia-budismo', 'creencia-hinduismo', 'creencia-judaismo', 'creencia-nueva-era') },
      { key: 'testimonio', title: '5. Tu testimonio', icon: 'heart', hint: 'Cómo contar lo que Cristo hizo en vos', items: AA('tu-testimonio') },
      { key: 'responder', title: '6. Qué responder cuando preguntan o dudan', icon: 'help-circle', hint: 'Respuestas bíblicas y objeciones comunes', items: [...T('Respuestas bíblicas'), ...T('Objeciones comunes'), ...more] },
      { key: 'cree', title: '7. Cuando alguien cree', icon: 'check-circle', hint: 'Los primeros pasos de un nuevo creyente', items: AA('cuando-alguien-cree') },
    ];
    const rest = (rows ?? []).filter((r) => r.section === EVANG && !used.has(r.slug)).map((r) => ({ r }));
    if (rest.length) blocks.push({ key: 'mas', title: 'Más', icon: 'folder', hint: 'Otros temas', items: rest });
    return blocks.filter((b) => b.items.length);
  })();
  const evangCount = (rows ?? []).filter((r) => r.section === EVANG).length + train.length;
  const folder = FOLDERS.find((f) => f.section === seccion);
  const isEvang = seccion === EVANG;
  const subBlock = isEvang && sub ? evangBlocks.find((b) => b.key === sub) : undefined;
  const foundTrain = isEvang && s ? train.filter((t) => n(`${t.title} ${t.summary ?? ''} ${t.category} ${t.body ?? ''}`).includes(s)).map(trainRow) : [];
  const inFolder = (rows ?? []).filter((r) => r.section === seccion);
  const first = (rows ?? []).filter((r) => r.section === 'Lo primero');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={subBlock ? subBlock.title.replace(/^\d+\.\s*/, '') : seccion ?? 'Crecimiento'} subtitle={subBlock ? `${EVANG} · ${subBlock.items.length} temas` : folder ? `${isEvang ? evangCount : inFolder.length} temas` : 'Para leer, aprender y crecer en la fe'} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input }}>
          <Feather name="search" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={seccion ? `Buscar en ${seccion.toLowerCase()}` : 'Buscar: bautismo, deudas, oración…'} placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 15, color: colors.text }} accessibilityLabel="Buscar" />
        </View>
      </View>
      <Screen>
        {rows === null ? <Loading /> : s ? (
          found.length || foundTrain.length ? (
            <>
              {found.map((r) => <ArticleRow key={r.id} r={r} icon="search" onPress={() => open(r)} />)}
              {foundTrain.map((r) => <ArticleRow key={r.id} r={r} icon="search" onPress={() => openTrain(r)} />)}
            </>
          ) : <Empty icon="book-open" title="No encontramos ese tema" />
        ) : isEvang ? (
          <>
            {subBlock ? subBlock.items.map((it) => <ArticleRow key={it.r.id} r={it.r} icon={it.train ? 'compass' : 'book-open'} onPress={() => (it.train ? openTrain(it.r) : open(it.r))} />)
              : evangBlocks.map((b) => (
                <Pressable key={b.key} onPress={() => router.push({ pathname: '/crecimiento', params: { seccion: EVANG, sub: b.key } } as unknown as Href)} accessibilityRole="button">
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
                    <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={b.icon} size={24} color={colors.amberText} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{b.title}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{b.hint} · {b.items.length} temas</Text>
                    </View>
                    <Feather name="folder" size={18} color={colors.muted} />
                  </Card>
                </Pressable>
              ))}
            {subBlock ? null : <Pressable onPress={() => router.push('/(tabs)/mapa' as Href)} accessibilityRole="button">
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
                <Feather name="map" size={22} color={colors.greenText} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.greenText, lineHeight: 19 }}>Ya aprendiste lo básico: salí a evangelizar desde el Mapa</Text>
                <Feather name="chevron-right" size={18} color={colors.greenText} />
              </Card>
            </Pressable>}
          </>
        ) : seccion ? (
          inFolder.length ? inFolder.map((r) => <ArticleRow key={r.id} r={r} icon={folder?.icon ?? 'book-open'} onPress={() => open(r)} />) : <Empty icon="book-open" title="Todavía no hay material" />
        ) : (
          <>
            {first.map((r) => (
              <Pressable key={r.id} onPress={() => open(r)} accessibilityRole="button">
                <Card style={{ gap: 6, backgroundColor: colors.green, borderColor: colors.green, padding: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1, opacity: 0.9 }}>LO PRIMERO</Text>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFFFF' }}>{r.title}</Text>
                  {r.summary ? <Text style={{ fontSize: 13, color: '#FFFFFF', opacity: 0.92, lineHeight: 19 }}>{r.summary}</Text> : null}
                </Card>
              </Pressable>
            ))}
            <SectionTitle>Carpetas</SectionTitle>
            {FOLDERS.map((f) => {
              const count = f.section === EVANG ? evangCount : (rows ?? []).filter((r) => r.section === f.section).length;
              if (!count) return null;
              return (
                <Pressable key={f.section} onPress={() => router.push({ pathname: '/crecimiento', params: { seccion: f.section } } as unknown as Href)} accessibilityRole="button">
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
                    <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: pal[f.bg], alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={f.icon} size={24} color={pal[f.fg]} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{f.section}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{f.hint} · {count} temas</Text>
                    </View>
                    <Feather name="folder" size={18} color={colors.muted} />
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}
      </Screen>
    </View>
  );
}
