// Para los pastores: cuán fiel es cada persona y en qué parte del camino está.
// Sirve para ver quién se está alejando y a quién se puede promover.
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Header } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Choice, Empty, Loading, Segmented, Tag } from '@/components/ui';
import { listPeople, ministryMembers, peopleEngagement } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { FAITH_LABEL, fmtDateOnly } from '@/lib/format';
import { colors } from '@/theme';
import { CONTENT_MAX_WIDTH, useLayout } from '@/lib/layout';
import type { Contact, Engagement, FaithCategory } from '@/types';

type View_ = 'faith' | 'journey';
const ORDER: FaithCategory[] = ['fiel', 'constante', 'frecuente', 'ocasional', 'esporadico', 'inactivo', 'sin_asistencia', 'nuevo'];

const STAGES = [
  { key: 'contacto', label: 'Contactados', hint: 'marcados en la calle o cargados' },
  { key: 'vino', label: 'Vinieron a la iglesia', hint: 'al menos una vez' },
  { key: 'discipulado', label: 'En discipulado', hint: '' },
  { key: 'ambos', label: 'Vienen sábado y domingo', hint: 'constantes o fieles' },
  { key: 'bautismo', label: 'Bautizados', hint: '' },
  { key: 'miembro', label: 'Miembros', hint: '' },
  { key: 'evangelismo', label: 'Salen a evangelizar', hint: 'usan la app para salir' },
  { key: 'ministerio', label: 'Sirven en un ministerio', hint: '' },
] as const;

export default function Fidelidad() {
  const router = useRouter();
  const [mode, setMode] = useState<View_>('faith');
  const [weeks, setWeeks] = useState('12');
  const [rows, setRows] = useState<Engagement[] | null>(null);
  const [people, setPeople] = useState<Contact[]>([]);
  const [serving, setServing] = useState<Set<string>>(new Set());
  const [soulwinners, setSoulwinners] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState<FaithCategory | 'all'>('all');
  const [stage, setStage] = useState<string>('contacto');
  const { isWide } = useLayout();
  const cols = isWide ? 2 : 1;

  useFocusEffect(
    useCallback(() => {
      setRows(null);
      peopleEngagement(Number(weeks)).then(setRows).catch(() => setRows([]));
      listPeople().then(setPeople).catch(() => undefined);
      ministryMembers().then((mm) => setServing(new Set(mm.map((m) => m.profile_id)))).catch(() => undefined);
      supabase.from('sessions').select('user_id').eq('kind', 'soulwinning').limit(5000)
        .then(({ data }) => setSoulwinners(new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))));
    }, [weeks]),
  );

  const counts = useMemo(() => {
    const m = new Map<FaithCategory, number>();
    (rows ?? []).forEach((r) => m.set(r.category, (m.get(r.category) ?? 0) + 1));
    return m;
  }, [rows]);

  const eng = useMemo(() => new Map((rows ?? []).map((r) => [r.contact_id, r])), [rows]);
  const inStage = useCallback((c: Contact, key: string): boolean => {
    const e = eng.get(c.id);
    switch (key) {
      case 'contacto': return true;
      case 'vino': return !!e?.last_attended;
      case 'discipulado': return !!c.discipleship_since;
      case 'ambos': return !!e && (e.category === 'fiel' || e.category === 'constante');
      case 'bautismo': return !!c.baptized_on;
      case 'miembro': return c.status === 'member';
      case 'evangelismo': return !!c.profile_id && soulwinners.has(c.profile_id);
      case 'ministerio': return !!c.profile_id && serving.has(c.profile_id);
      default: return false;
    }
  }, [eng, serving, soulwinners]);

  const stageCounts = useMemo(() => STAGES.map((s) => people.filter((c) => inStage(c, s.key)).length), [people, inStage]);

  const listFaith = (rows ?? []).filter((r) => cat === 'all' || r.category === cat);
  const stageIdx = STAGES.findIndex((s) => s.key === stage);
  // En el camino: los que llegaron a esta etapa pero no a la siguiente (los que hay que empujar un paso).
  const listStage = people.filter((c) => inStage(c, stage) && (stageIdx === STAGES.length - 1 || !inStage(c, STAGES[stageIdx + 1].key)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Fidelidad y camino" subtitle="Quién se está alejando y a quién promover" back />
      <View style={{ paddingHorizontal: 16, gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}>
        <Segmented options={[{ value: 'faith', label: 'Fidelidad' }, { value: 'journey', label: 'Camino' }]} value={mode} onChange={setMode} />
        {mode === 'faith' ? (
          <>
            <Choice options={[{ value: '4', label: '1 mes' }, { value: '12', label: '3 meses' }, { value: '26', label: '6 meses' }]} value={weeks} onChange={setWeeks} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Pressable onPress={() => setCat('all')}><Tag text={`Todos ${rows?.length ?? ''}`} tone={cat === 'all' ? 'green' : 'gray'} /></Pressable>
              {ORDER.filter((k) => counts.get(k)).map((k) => (
                <Pressable key={k} onPress={() => setCat(k)} style={{ opacity: cat === 'all' || cat === k ? 1 : 0.5 }}>
                  <Tag text={`${FAITH_LABEL[k].label} ${counts.get(k)}`} tone={FAITH_LABEL[k].tone} />
                </Pressable>
              ))}
            </View>
            {cat !== 'all' ? <Text style={{ fontSize: 12, color: colors.muted }}>{FAITH_LABEL[cat].label}: {FAITH_LABEL[cat].hint} de los cultos principales.</Text> : null}
          </>
        ) : (
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Tocá una etapa para ver quiénes llegaron hasta ahí y todavía no dieron el paso siguiente.</Text>
        )}
      </View>

      {mode === 'faith' ? (
        rows === null ? <Loading /> : (
          <FlatList
            key={cols}
            data={listFaith}
            keyExtractor={(r) => r.contact_id}
            numColumns={cols}
            columnWrapperStyle={cols > 1 ? { gap: 8 } : undefined}
            contentContainerStyle={{ padding: 16, gap: 8, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}
            ListEmptyComponent={<Empty icon="users" title="Todavía no hay asistencias" text="Cuando se tome asistencia en los cultos, acá aparece la fidelidad de cada uno." />}
            renderItem={({ item: r }) => (
              <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id } })} style={{ flex: 1, maxWidth: cols > 1 ? '49.5%' : '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                <Face name={r.name} path={r.photo_path} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700' }}>{r.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {r.possible ? `${r.attended} de ${r.possible} cultos` : 'Recién agregado'}{r.last_attended ? ` · última vez ${fmtDateOnly(r.last_attended)}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{Math.round(r.pct * 100)}%</Text>
                  <Tag text={FAITH_LABEL[r.category].label} tone={FAITH_LABEL[r.category].tone} />
                </View>
              </Pressable>
            )}
          />
        )
      ) : (
        <FlatList
          data={listStage}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 8, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}
          ListHeaderComponent={
            <View style={{ gap: 6, marginBottom: 10 }}>
              {STAGES.map((s, i) => {
                const n = stageCounts[i];
                const max = Math.max(1, stageCounts[0]);
                const on = stage === s.key;
                return (
                  <Pressable key={s.key} onPress={() => setStage(s.key)} style={{ gap: 4, padding: 8, borderRadius: 10, backgroundColor: on ? colors.greenSoft : 'transparent' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, fontWeight: on ? '800' : '600', color: colors.text }}>{i + 1}. {s.label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>{n}</Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bgSoft }}>
                      <View style={{ width: `${(n / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.green }} />
                    </View>
                  </Pressable>
                );
              })}
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted, marginTop: 8 }}>
                {STAGES[stageIdx].label.toUpperCase()}{stageIdx < STAGES.length - 1 ? ` · TODAVÍA NO: ${STAGES[stageIdx + 1].label.toUpperCase()}` : ''} ({listStage.length})
              </Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: c.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Face name={c.name} path={c.photo_path} size={40} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>{c.name}</Text>
              {eng.get(c.id) ? <Tag text={FAITH_LABEL[eng.get(c.id)!.category].label} tone={FAITH_LABEL[eng.get(c.id)!.category].tone} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
