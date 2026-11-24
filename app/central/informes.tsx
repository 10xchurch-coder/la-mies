// La Mies Central · Informes: semanal, mensual y anual, de toda la red o de una iglesia. Se ve, se imprime y se baja como planilla.
// Solo cantidades, con el período anterior al lado.
import React, { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Chips, LoadError, tableStyles as T, useCentralLoad } from '@/components/central/CentralUI';
import { PeriodPicker } from '@/components/central/PeriodPicker';
import { ReportTable } from '@/components/central/ReportTable';
import { DeskButton, DeskPage, Panel } from '@/components/desk/DeskShell';
import { Loading } from '@/components/ui';
import { addDaysIso, buildReport, churchesCsv, METRICS, mondayIso, periodOf, reportCsv, reportHtml, sumByWeek, totalsOf, type MetricKey, type PeriodKind } from '@/lib/central';
import { centralOverview, centralWeeks } from '@/lib/centralData';
import { downloadText, fileSlug } from '@/lib/download';
import { fmtDayYear } from '@/lib/format';
import { printHtml } from '@/lib/givingData';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

const BY_CHURCH: MetricKey[] = ['accounts', 'people', 'attendance', 'first_time', 'baptisms', 'outings', 'gospel', 'active_users', 'help_requests'];
const label = (k: MetricKey) => METRICS.find((m) => m.key === k)?.label ?? k;

export default function CentralReports() {
  const params = useLocalSearchParams<{ iglesia?: string }>();
  const [scope, setScope] = useState<string>(typeof params.iglesia === 'string' && params.iglesia ? params.iglesia : 'all');
  const [kind, setKind] = useState<PeriodKind>('week');
  // Arranca en la última semana completa.
  const [anchor, setAnchor] = useState(() => addDaysIso(mondayIso(new Date()), -7));
  const { data, error, reload } = useCentralLoad(async () => {
    const [o, weeks] = await Promise.all([centralOverview(), centralWeeks()]);
    return { churches: o.churches, weeks, demo: o.demo };
  });

  const period = useMemo(() => periodOf(kind, anchor), [kind, anchor]);
  const view = useMemo(() => {
    if (!data) return null;
    const church = scope === 'all' ? null : data.churches.find((c) => c.id === scope) ?? null;
    const weeks = church ? data.weeks.filter((w) => w.church_id === church.id) : sumByWeek(data.weeks);
    const report = buildReport(weeks, period);
    const title = church ? church.name : 'Toda la red';
    const byChurch = church ? [] : data.churches.map((c) => {
      const t = totalsOf(data.weeks.filter((w) => w.church_id === c.id), period.from, period.to);
      return { id: c.id, name: c.name, values: BY_CHURCH.map((k) => t[k]) };
    });
    return { church, report, title, byChurch };
  }, [data, scope, period]);

  if (error && !data) return <DeskPage title="Informes"><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data || !view) return <DeskPage title="Informes"><Loading /></DeskPage>;

  const print = () => printHtml(`${view.title} - ${period.label}`, reportHtml({
    title: view.title, period, rows: view.report.rows, services: view.church ? view.report.cur.services : undefined,
    byChurch: view.byChurch, byChurchCols: BY_CHURCH.map(label), printedOn: fmtDayYear(new Date()),
  })).catch((e) => Alert.alert('No se pudo imprimir', errorMessage(e)));
  const csv = () => downloadText(`informe-${fileSlug(view.title)}-${period.from}.csv`, reportCsv(view.title, period, view.report.rows)).catch(() => undefined);
  const csvChurches = () => downloadText(`iglesias-${period.from}.csv`, churchesCsv(period, data.churches, data.weeks)).catch(() => undefined);

  return (
    <DeskPage title="Informes" subtitle="De toda la red o de una iglesia: por semana, por mes o por año."
      actions={<>
        <DeskButton label="Bajar planilla (CSV)" icon="download" onPress={csv} />
        {!view.church ? <DeskButton label="Planilla por iglesia" icon="grid" onPress={csvChurches} /> : null}
        <DeskButton label="Imprimir" icon="printer" primary onPress={print} />
      </>}>
      <View style={{ gap: 10 }}>
        <Chips value={scope} onChange={setScope} options={[{ value: 'all', label: 'Toda la red' }, ...data.churches.map((c) => ({ value: c.id, label: c.name }))]} />
        <PeriodPicker kind={kind} anchor={anchor} onChange={(k, a) => { setKind(k); setAnchor(a); }} />
      </View>

      {view.report.cur.weeks === 0 ? (
        <Text style={{ fontSize: 14, color: colors.muted }}>No hay semanas guardadas en este período.</Text>
      ) : (
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {`${view.report.cur.weeks} ${view.report.cur.weeks === 1 ? 'semana' : 'semanas'} en el período. La asistencia y los que usaron la app son el promedio por semana; cuentas y fichas, lo que había al final; lo demás se suma. Una semana cuenta para el mes en que cae su lunes.`}
        </Text>
      )}
      <ReportTable rows={view.report.rows} period={period} services={view.church ? view.report.cur.services : undefined} />

      {!view.church ? (
        <Panel title="Por iglesia" hint={period.label}>
          <View style={[T.table, { borderWidth: 0 }]}>
            <View style={T.thead}>
              <Text style={[T.th, { flex: 2.2 }]}>Iglesia</Text>
              {BY_CHURCH.map((k) => <Text key={k} style={[T.th, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>{label(k).replace(' (promedio por semana)', '').replace(' (por semana)', '')}</Text>)}
            </View>
            {view.byChurch.map((c) => (
              <View key={c.id} style={T.row}>
                <Text style={[T.td, { flex: 2.2, fontWeight: '700' }]} numberOfLines={1}>{c.name}</Text>
                {c.values.map((v, i) => <Text key={BY_CHURCH[i]} style={[T.num, { flex: 1 }]}>{v}</Text>)}
              </View>
            ))}
          </View>
        </Panel>
      ) : null}
      <Text style={{ fontSize: 12, color: colors.muted }}>
        {`Estos informes tienen solo cantidades: no incluyen datos de personas ni de dinero.${data.demo ? ` La iglesia de ejemplo "${data.demo.name}" no cuenta.` : ''} Además, todos los lunes a la mañana le llega al dueño de la red un aviso con el resumen de la semana.`}
      </Text>
    </DeskPage>
  );
}
