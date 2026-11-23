// Plan de lectura de la Biblia: la persona elige un plan (toda la Biblia, el Nuevo o el Antiguo Testamento en un año),
// cada día ve qué capítulos le tocan y los tilda cuando los leyó.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Loading, SectionTitle } from '@/components/ui';
import { myBiblePlan, saveBiblePlanDone, startBiblePlan, stopBiblePlan, type BiblePlanRow } from '@/lib/api';
import { parseReading } from '@/lib/bible';
import { PLANS, planDays, planReadings, planStatus, type PlanId } from '@/lib/biblePlan';
import { addDays, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

const dayText = (startedOn: string, d: number) =>
  addDays(new Date(`${startedOn}T12:00:00`), d).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

export default function PlanLectura() {
  const router = useRouter();
  const [row, setRow] = useState<BiblePlanRow | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const today = isoDate(new Date());

  useFocusEffect(useCallback(() => {
    myBiblePlan().then(setRow).catch(() => setRow(null));
  }, []));

  const status = useMemo(() => (row ? planStatus(row.plan, row.started_on, row.done, today) : null), [row, today]);
  const readings = row ? planReadings(row.plan) : [];

  const start = async (plan: PlanId) => {
    try {
      await startBiblePlan(plan, today);
      setRow({ plan, started_on: today, done: [] });
    } catch (e) {
      Alert.alert('No se pudo empezar', errorMessage(e));
    }
  };

  const toggle = (d: number) => {
    if (!row) return;
    const done = row.done.includes(d) ? row.done.filter((x) => x !== d) : [...row.done, d];
    const before = row;
    setRow({ ...row, done });
    saveBiblePlanDone(done).catch((e) => { setRow(before); Alert.alert('No se pudo guardar', errorMessage(e)); });
  };

  const change = () => {
    Alert.alert('Cambiar de plan', 'Se borra lo que llevás tildado y elegís un plan nuevo desde hoy. ¿Seguimos?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar de plan', style: 'destructive', onPress: () => { stopBiblePlan().then(() => setRow(null)).catch((e) => Alert.alert('No se pudo', errorMessage(e))); } },
    ]);
  };

  const line = (d: number, big?: boolean) => {
    const on = !!row && row.done.includes(d);
    return (
      <Pressable key={d} onPress={() => toggle(d)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${readings[d]}. ${on ? 'Leído' : 'Sin leer'}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: big ? 6 : 10 }}>
        <View style={{ width: big ? 34 : 26, height: big ? 34 : 26, borderRadius: 8, borderWidth: 2, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {on ? <Feather name="check" size={big ? 22 : 16} color="#FFFFFF" /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: big ? 22 : 15, fontWeight: big ? '800' : '700', color: colors.text, textDecorationLine: on && !big ? 'line-through' : 'none' }}>{readings[d]}</Text>
          {big ? null : <Text style={{ fontSize: 12, color: colors.muted }}>{row ? dayText(row.started_on, d) : ''}</Text>}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Plan de lectura" subtitle={row ? PLANS.find((p) => p.id === row.plan)?.title : 'Elegí cómo leer la Biblia'} back />
      <Screen>
        {row === undefined ? <Loading /> : row === null || !status ? (
          <>
            <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>Elegí un plan. Cada día la app te dice qué leer en tu Biblia, y lo tildás cuando lo leíste.</Text>
            {([['new', 'Para nuevos creyentes'], ['year', 'La Biblia en un año']] as const).map(([g, title]) => (
              <React.Fragment key={g}>
                <SectionTitle>{title}</SectionTitle>
                {PLANS.filter((p) => p.group === g).map((p) => (
                  <Pressable key={p.id} onPress={() => start(p.id)} accessibilityRole="button" accessibilityLabel={`Empezar: ${p.title}`}>
                    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={g === 'new' ? 'sunrise' : 'book-open'} size={20} color={colors.greenText} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{p.title}</Text>
                        <Text style={{ fontSize: 13, color: colors.muted }}>{p.hint}</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.gray} />
                    </Card>
                  </Pressable>
                ))}
              </React.Fragment>
            ))}
          </>
        ) : (
          <>
            <Card style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.muted }}>HOY · DÍA {status.day + 1} DE {planDays(row.plan)}</Text>
              {status.today ? line(status.day, true) : <Text style={{ fontSize: 16, color: colors.text, paddingVertical: 6 }}>Hoy no hay lectura nueva. {status.behind.length ? 'Aprovechá para ponerte al día.' : 'Vas al día.'}</Text>}
              {(() => {
                const at = status.today ? parseReading(status.today) : null;
                return at ? <Button title="Leerla en la Biblia" icon="book-open" variant="outline" small onPress={() => router.push({ pathname: '/biblia/leer', params: { libro: String(at.book), cap: String(at.chapter) } })} /> : null;
              })()}
            </Card>

            <Card style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Llevás {status.done} de {status.total} lecturas</Text>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bgSoft, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round((status.done / status.total) * 100)}%`, height: 8, backgroundColor: colors.green }} />
              </View>
            </Card>

            {status.done >= status.total ? (
              <Card style={{ gap: 8, backgroundColor: colors.greenSoft }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.greenText }}>¡Terminaste este plan!</Text>
                <Text style={{ fontSize: 14, color: colors.greenText }}>Elegí el próximo para seguir leyendo cada día.</Text>
                <Button title="Elegir otro plan" icon="arrow-right" onPress={() => { stopBiblePlan().then(() => setRow(null)).catch((e) => Alert.alert('No se pudo', errorMessage(e))); }} />
              </Card>
            ) : null}

            {status.behind.length ? (
              <>
                <SectionTitle>{`Para ponerte al día (${status.behind.length})`}</SectionTitle>
                <Card style={{ paddingVertical: 4 }}>
                  {(showAll ? status.behind : status.behind.slice(-5)).map((d) => line(d))}
                  {status.behind.length > 5 && !showAll ? <Button title={`Ver las ${status.behind.length}`} variant="ghost" small onPress={() => setShowAll(true)} /> : null}
                </Card>
              </>
            ) : null}

            {status.day + 1 < readings.length ? (
              <>
                <SectionTitle>Los próximos días</SectionTitle>
                <Card style={{ paddingVertical: 4 }}>
                  {Array.from({ length: 14 }, (_, i) => status.day + 1 + i).filter((d) => d < readings.length && readings[d]).slice(0, 7).map((d) => line(d))}
                </Card>
              </>
            ) : null}

            <Button title="Cambiar de plan" variant="ghost" small icon="refresh-cw" onPress={change} />
          </>
        )}
      </Screen>
    </View>
  );
}
