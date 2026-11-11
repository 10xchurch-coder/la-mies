// Informe de finanzas de la iglesia para los miembros mayores de 18: cuánto entró y cuánto salió, por categoría.
// Es de toda la iglesia. No muestra quién dio ni cada movimiento.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Card, Choice, Empty, Loading, Toggle } from '@/components/ui';
import { closedPeriods } from '@/lib/quarters';
import { fmtMoney } from '@/lib/format';
import { supabase, errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

type Row = { direction: 'in' | 'out'; category: string; total: number };
type State = { enabled: boolean; eligible: boolean; can_switch: boolean };

export default function InformeIglesia() {
  const { desde } = useLocalSearchParams<{ desde?: string; hasta?: string }>();
  const periods = useMemo(() => closedPeriods(new Date(), 4), []);
  const [key, setKey] = useState(() => periods.find((p) => p.from === desde)?.key ?? periods[0].key);
  const [state, setState] = useState<State | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const period = periods.find((p) => p.key === key) ?? periods[0];

  const loadState = () => supabase.rpc('fin_member_report_state').then(({ data }) => setState((data as State | null) ?? { enabled: false, eligible: false, can_switch: false }));
  useEffect(() => { loadState(); }, []);
  useEffect(() => {
    if (!state?.enabled || !state.eligible) return;
    setRows(null); setError(null);
    supabase.rpc('fin_member_report', { p_from: period.from, p_to: period.to }).then(({ data, error: e }) => {
      if (e) { setError(errorMessage(e)); setRows([]); } else setRows(((data ?? []) as Row[]).map((r) => ({ ...r, total: Number(r.total) })));
    });
  }, [state, period.from, period.to]);

  if (!state) return <Loading />;
  const ins = (rows ?? []).filter((r) => r.direction === 'in');
  const outs = (rows ?? []).filter((r) => r.direction === 'out');
  const sum = (l: Row[]) => l.reduce((n, r) => n + r.total, 0);
  const result = sum(ins) - sum(outs);

  const block = (title: string, list: Row[], tone: string) => (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: tone }}>{fmtMoney(sum(list))}</Text>
      </View>
      {list.map((r) => (
        <View key={r.category} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{r.category}</Text>
          <Text style={{ fontSize: 14, color: colors.muted }}>{fmtMoney(r.total)}</Text>
        </View>
      ))}
      {!list.length ? <Text style={{ fontSize: 13, color: colors.muted }}>Nada en este período.</Text> : null}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Finanzas de la iglesia" subtitle="Informe para los miembros" back />
      <Screen style={{ gap: 12 }}>
        {state.can_switch ? (
          <Card>
            <Toggle label="Compartir este informe con los miembros" hint="Lo ven los miembros mayores de 18 años (según la fecha de nacimiento de su ficha). Cada trimestre y cada año les llega el aviso solo. Ven totales por categoría; nunca quién dio ni cada movimiento."
              value={state.enabled} onChange={(v) => { supabase.rpc('set_fin_member_report', { p_on: v }).then(({ error: e }) => { if (e) Alert.alert('No se pudo', errorMessage(e)); loadState(); }); }} />
          </Card>
        ) : null}
        {!state.enabled ? <Empty icon="bar-chart-2" title="La iglesia todavía no comparte este informe" /> : !state.eligible ? (
          <Empty icon="lock" title="Este informe es para los miembros mayores de 18 años" text="Si sos miembro y no lo ves, pedile a la secretaría que revise tu fecha de nacimiento en tu ficha." />
        ) : (
          <>
            <Choice columns={2} options={periods.map((p) => ({ value: p.key, label: p.label }))} value={key} onChange={setKey} />
            {error ? <Text style={{ color: colors.amberText, backgroundColor: colors.amberSoft, padding: 10, borderRadius: 10, fontSize: 13 }}>{error}</Text> : null}
            {rows === null ? <Loading /> : (
              <>
                {block('Entró', ins, colors.greenText)}
                {block('Salió', outs, colors.text)}
                <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{result >= 0 ? 'Quedó a favor' : 'Faltó'}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: result >= 0 ? colors.greenText : colors.amberText }}>{fmtMoney(Math.abs(result))}</Text>
                </Card>
                <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Es el informe de toda la iglesia, del {period.label.toLowerCase()}. Si tenés una pregunta, hablá con el pastor o con el tesorero.</Text>
              </>
            )}
          </>
        )}
      </Screen>
    </View>
  );
}
