// La Mies Central · Resumen: todas las iglesias de un vistazo. Totales, iglesias nuevas, las que necesitan atención y cómo crece la red.
// Solo cantidades y datos de cada iglesia: nunca personas ni plata.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Bars, Kpi, LoadError, PrivacyBox, StateChip, useCentralLoad } from '@/components/central/CentralUI';
import { DeskButton, DeskPage, Panel } from '@/components/desk/DeskShell';
import { Loading, Tag } from '@/components/ui';
import { addDaysIso, attentionOf, change, daysAgo, mondayIso, series, sumByWeek, type CentralChurch } from '@/lib/central';
import { centralOverview, centralRefresh } from '@/lib/centralData';
import { fmtDayYear } from '@/lib/format';
import { useLayout } from '@/lib/layout';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

export default function CentralHome() {
  const router = useRouter();
  const { width } = useLayout();
  const { data, error, reload } = useCentralLoad(centralOverview);
  const [refreshing, setRefreshing] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const net = sumByWeek(data.weeks);
    const closed = addDaysIso(mondayIso(new Date()), -7); // la última semana completa
    const cur = net.find((w) => w.week_start === closed);
    const prev = net.find((w) => w.week_start === addDaysIso(closed, -7));
    const attention = data.churches.map((c) => ({ c, why: attentionOf(c) })).filter((x) => x.why.length).sort((a, b) => b.why.length - a.why.length);
    const fresh = data.churches.filter((c) => (daysAgo(c.created_at) ?? 999) <= 30);
    // Cuántas iglesias había cada semana (por la fecha en que entró cada una).
    const weeksAxis = net.slice(-16).map((w) => w.week_start);
    const growth = weeksAxis.map((w) => ({ week: w, value: data.churches.filter((c) => c.created_at.slice(0, 10) <= addDaysIso(w, 6)).length }));
    return { net, closed, cur, prev, attention, fresh, growth };
  }, [data]);

  const refresh = async () => {
    setRefreshing(true);
    try { await centralRefresh(4); reload(); } catch (e) { Alert.alert('No se pudo actualizar', errorMessage(e)); } finally { setRefreshing(false); }
  };

  if (error && !data) return <DeskPage title="La Mies Central" subtitle="Todas las iglesias de la red"><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data || !view) return <DeskPage title="La Mies Central" subtitle="Todas las iglesias de la red"><Loading /></DeskPage>;

  const n = data.churches.length;
  const sum = (f: (c: CentralChurch) => number) => data.churches.reduce((a, c) => a + f(c), 0);
  const errors7 = sum((c) => c.errors_7);
  const basis = width >= 1100 ? '23%' : width >= 700 ? '30%' : '46%';
  const go = (to: string) => router.push(to as Href);

  return (
    <DeskPage
      title="La Mies Central"
      subtitle={`${n} ${n === 1 ? 'iglesia' : 'iglesias'} en la red${data.computed_at ? ` · números actualizados el ${fmtDayYear(data.computed_at)}` : ''}`}
      actions={<>
        <DeskButton label={refreshing ? 'Actualizando…' : 'Actualizar ahora'} icon="refresh-cw" onPress={refresh} disabled={refreshing} />
        <DeskButton label="Informes" icon="bar-chart" primary onPress={() => go('/central/informes')} />
      </>}
    >
      <PrivacyBox />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Kpi basis={basis} icon="home" tone="pink" label="Iglesias" value={n} hint={view.fresh.length ? `${view.fresh.length} ${view.fresh.length === 1 ? 'nueva' : 'nuevas'} en 30 días` : 'Ninguna nueva en 30 días'} onPress={() => go('/central/iglesias')} />
        <Kpi basis={basis} icon="alert-circle" tone="amber" label="Necesitan atención" value={view.attention.length} hint="Sin movimiento, trabadas, con pedidos o con errores" />
        <Kpi basis={basis} icon="life-buoy" tone="red" label="Pedidos de ayuda sin resolver" value={data.help_open} onPress={() => go('/central/ayuda')} />
        <Kpi basis={basis} icon="zap" tone="violet" label="Ideas nuevas" value={data.ideas_new} onPress={() => go('/central/ideas')} />
        <Kpi basis={basis} icon="users" tone="green" label="Asistencia de la semana pasada" value={view.cur?.attendance ?? 0} change={change(view.cur?.attendance ?? 0, view.prev?.attendance, !!view.prev)} good={view.cur && view.prev ? view.cur.attendance >= view.prev.attendance : null} hint="Todas las iglesias sumadas" />
        <Kpi basis={basis} icon="key" tone="blue" label="Cuentas" value={sum((c) => c.facts.accounts)} hint={`${sum((c) => c.facts.people)} fichas de personas`} />
        <Kpi basis={basis} icon="smartphone" tone="teal" label="Usaron la app en 7 días" value={sum((c) => c.active_7)} hint={`${sum((c) => c.active_30)} en 30 días`} />
        <Kpi basis={basis} icon="alert-triangle" tone={errors7 ? 'red' : 'green'} label="Errores de la app en 7 días" value={errors7} onPress={() => go('/central/errores')} />
      </View>

      <Panel title={`Necesitan atención · ${view.attention.length}`} hint="Tocá una iglesia para abrir su ficha." action="Ver todas las iglesias" onAction={() => go('/central/iglesias')}>
        {view.attention.length ? view.attention.map(({ c, why }) => (
          <Pressable key={c.id} accessibilityRole="link" onPress={() => go(`/central/iglesia/${c.id}`)}
            style={(s) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.bgSoft }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{c.name}</Text>
                <StateChip church={c} />
                {c.city ? <Text style={{ fontSize: 13, color: colors.muted }}>{c.city}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {why.map((w) => <Tag key={w.key} text={w.text} tone={w.tone} />)}
              </View>
            </View>
            <Feather name="chevron-right" size={18} color={colors.gray} />
          </Pressable>
        )) : <Text style={{ fontSize: 14, color: colors.muted }}>Ninguna. Todas las iglesias vienen bien.</Text>}
      </Panel>

      <Panel title="Cómo crece la red" hint="Semana por semana. La barra oscura es la última semana.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
          <Bars title="Iglesias en la red" tone="pink" data={view.growth} />
          <Bars title="Asistencia (todas las iglesias)" tone="green" data={series(view.net, 'attendance', 16, view.closed)} />
          <Bars title="Cuentas" tone="blue" data={series(view.net, 'accounts', 16)} />
          <Bars title="Usaron la app" tone="teal" data={series(view.net, 'active_users', 16)} />
        </View>
      </Panel>

      <Panel title="Iglesias nuevas" hint="Las que entraron en los últimos 30 días.">
        {view.fresh.length ? view.fresh.map((c) => (
          <Pressable key={c.id} accessibilityRole="link" onPress={() => go(`/central/iglesia/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>{c.name}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{[c.city, `entró el ${fmtDayYear(c.created_at)}`].filter(Boolean).join(' · ')}</Text>
            <StateChip church={c} />
          </Pressable>
        )) : <Text style={{ fontSize: 14, color: colors.muted }}>No entró ninguna iglesia en estos 30 días.</Text>}
      </Panel>

      {data.demo ? (
        <Text style={{ fontSize: 12, color: colors.muted }}>{`Aparte: la iglesia de ejemplo "${data.demo.name}" (demostración) no figura en las listas ni cuenta en ningún total.`}</Text>
      ) : null}
    </DeskPage>
  );
}
