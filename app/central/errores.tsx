// La Mies Central · Errores de la app: agrupados por mensaje, pantalla y versión, en todas las iglesias.
// Se muestra cuántas veces pasó y a cuántas iglesias y personas les pasó; nunca a quién. La base saca del texto correos, números e identificadores.
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Chips, Kpi, LoadError, tableStyles as T, useCentralLoad } from '@/components/central/CentralUI';
import { DeskPage } from '@/components/desk/DeskShell';
import { Loading, Tag } from '@/components/ui';
import { activityLabel } from '@/lib/alta';
import { centralErrors } from '@/lib/centralData';
import { fmtDayYear } from '@/lib/format';
import { useLayout } from '@/lib/layout';
import { colors } from '@/theme';

const PLATFORM: Record<string, string> = { web: 'Web', ios: 'iPhone', android: 'Android' };

export default function CentralErrors() {
  const { width } = useLayout();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data, error, reload } = useCentralLoad(() => centralErrors(Number(days)), [days]);
  const totals = useMemo(() => ({
    count: (data ?? []).reduce((a, g) => a + g.count, 0),
    last7: (data ?? []).reduce((a, g) => a + g.last_7, 0),
    kinds: (data ?? []).length,
    churches: Math.max(0, ...(data ?? []).map((g) => g.churches)),
  }), [data]);

  if (error && !data) return <DeskPage title="Errores de la app"><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data) return <DeskPage title="Errores de la app"><Loading /></DeskPage>;
  const wide = width >= 1100;

  return (
    <DeskPage title="Errores de la app" subtitle="Cuando la app falla feo, avisa sola. Acá están juntos los avisos de todas las iglesias.">
      <Chips<'7' | '30' | '90'> value={days} onChange={setDays} options={[{ value: '7', label: 'Últimos 7 días' }, { value: '30', label: 'Últimos 30 días' }, { value: '90', label: 'Últimos 90 días' }]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Kpi icon="alert-triangle" tone={totals.count ? 'red' : 'green'} label="Errores en el período" value={totals.count} />
        <Kpi icon="clock" tone="amber" label="En los últimos 7 días" value={totals.last7} />
        <Kpi icon="layers" tone="violet" label="Errores distintos" value={totals.kinds} />
        <Kpi icon="home" tone="pink" label="Iglesias con el mismo error (máximo)" value={totals.churches} />
      </View>
      {!data.length ? <Text style={{ fontSize: 14, color: colors.muted, paddingVertical: 20 }}>No hubo errores en este período.</Text> : (
        <View style={T.table}>
          {wide ? (
            <View style={T.thead}>
              <Text style={[T.th, { flex: 4 }]}>Qué pasó</Text>
              <Text style={[T.th, { flex: 1.6 }]}>Pantalla</Text>
              <Text style={[T.th, { flex: 1.3 }]}>Versión</Text>
              <Text style={[T.th, { flex: 0.8, textAlign: 'right' }]}>Veces</Text>
              <Text style={[T.th, { flex: 0.8, textAlign: 'right' }]}>Iglesias</Text>
              <Text style={[T.th, { flex: 0.8, textAlign: 'right' }]}>Personas</Text>
              <Text style={[T.th, { flex: 1.3 }]}>Última vez</Text>
            </View>
          ) : null}
          {data.map((g, i) => wide ? (
            <View key={`${g.message}-${g.screen}-${g.version}-${g.platform}-${i}`} style={[T.row, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 4, gap: 4 }}>
                <Text selectable style={[T.td, { lineHeight: 18 }]} numberOfLines={4}>{g.message || 'Sin mensaje'}</Text>
                {g.last_7 >= 5 ? <View style={{ alignItems: 'flex-start' }}><Tag text={`${g.last_7} veces en 7 días`} tone="red" /></View> : null}
              </View>
              <Text style={[T.td, { flex: 1.6, color: g.screen ? colors.text : colors.muted }]} numberOfLines={2}>{g.screen ?? 'No se sabe'}</Text>
              <Text style={[T.td, { flex: 1.3 }]} numberOfLines={2}>{`${PLATFORM[g.platform] ?? g.platform} · ${g.version}`}</Text>
              <Text style={[T.num, { flex: 0.8, fontWeight: '800' }]}>{g.count}</Text>
              <Text style={[T.num, { flex: 0.8 }]}>{g.churches}</Text>
              <Text style={[T.num, { flex: 0.8 }]}>{g.people}</Text>
              <Text style={[T.td, { flex: 1.3 }]} numberOfLines={2}>{`${activityLabel(g.last_at)} (${fmtDayYear(g.last_at)})`}</Text>
            </View>
          ) : (
            <View key={`${g.message}-${g.screen}-${g.version}-${g.platform}-${i}`} style={[T.row, { flexDirection: 'column', alignItems: 'stretch', gap: 4 }]}>
              <Text selectable style={[T.td, { lineHeight: 18 }]} numberOfLines={5}>{g.message || 'Sin mensaje'}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{`${g.count} ${g.count === 1 ? 'vez' : 'veces'} · ${g.churches} ${g.churches === 1 ? 'iglesia' : 'iglesias'} · ${g.people} ${g.people === 1 ? 'persona' : 'personas'} · ${PLATFORM[g.platform] ?? g.platform} ${g.version}${g.screen ? ` · ${g.screen}` : ''} · ${activityLabel(g.last_at)}`}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={{ fontSize: 12, color: colors.muted }}>
        No se muestra a quién le pasó cada error. Del texto se sacan correos, números largos e identificadores. La pantalla se anota solo en la versión web nueva; en los avisos viejos dice "No se sabe". La app guarda los últimos 2000 avisos.
      </Text>
    </DeskPage>
  );
}
