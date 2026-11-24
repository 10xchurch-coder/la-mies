// La Mies Central · Iglesias: la tabla de todas las iglesias, para ordenar y filtrar. Se busca por iglesia y ciudad, nunca por personas.
import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Chips, LoadError, StateChip, tableStyles as T, useCentralLoad } from '@/components/central/CentralUI';
import { DeskButton, DeskPage } from '@/components/desk/DeskShell';
import { Loading, Tag, Toggle } from '@/components/ui';
import { activityLabel } from '@/lib/alta';
import { attentionOf, filterChurches, lastWeekAttendance, sortChurches, STATE_INFO, stateOf, type CentralChurch, type ChurchSort, type ChurchState } from '@/lib/central';
import { centralOverview } from '@/lib/centralData';
import { toCsv } from '@/lib/desk';
import { downloadText } from '@/lib/download';
import { fmtDayYear } from '@/lib/format';
import { useLayout } from '@/lib/layout';
import { colors } from '@/theme';

type Col = { key: ChurchSort | 'pastor' | 'attention'; label: string; flex: number; num?: boolean; sort?: ChurchSort };
const COLS: Col[] = [
  { key: 'name', label: 'Iglesia', flex: 2.4, sort: 'name' },
  { key: 'state', label: 'Estado', flex: 1.3, sort: 'state' },
  { key: 'pastor', label: 'Pastor', flex: 1.5 },
  { key: 'created', label: 'Desde', flex: 1, sort: 'created' },
  { key: 'accounts', label: 'Cuentas', flex: 0.8, num: true, sort: 'accounts' },
  { key: 'people', label: 'Fichas', flex: 0.8, num: true, sort: 'people' },
  { key: 'attendance', label: 'Asistencia', flex: 0.9, num: true, sort: 'attendance' },
  { key: 'active', label: 'Activos 7 días', flex: 0.9, num: true, sort: 'active' },
  { key: 'last', label: 'Último movimiento', flex: 1.2, sort: 'last' },
  { key: 'attention', label: 'Atención', flex: 1.8 },
];

export default function CentralChurches() {
  const router = useRouter();
  const { width } = useLayout();
  const { data, error, reload } = useCentralLoad(centralOverview);
  const [q, setQ] = useState('');
  const [state, setState] = useState<'all' | ChurchState>('all');
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [sort, setSort] = useState<{ by: ChurchSort; dir: 1 | -1 }>({ by: 'name', dir: 1 });

  const attendance = useMemo(() => lastWeekAttendance(data?.weeks ?? []), [data]);
  const rows = useMemo(() => sortChurches(filterChurches(data?.churches ?? [], { q, state, onlyAttention }), sort.by, sort.dir, attendance), [data, q, state, onlyAttention, sort, attendance]);
  const counts = useMemo(() => {
    const m = new Map<ChurchState, number>();
    for (const c of data?.churches ?? []) m.set(stateOf(c), (m.get(stateOf(c)) ?? 0) + 1);
    return m;
  }, [data]);

  const open = (c: CentralChurch) => router.push(`/central/iglesia/${c.id}` as Href);
  const exportCsv = () => downloadText('iglesias-de-la-red.csv', toCsv(
    ['Iglesia', 'Ciudad', 'País', 'Estado', 'Pastor', 'Desde', 'Cuentas', 'Fichas de personas', 'Asistencia (última semana)', 'Usaron la app en 7 días', 'Usaron la app en 30 días', 'Último movimiento', 'Atención'],
    rows.map((c) => [c.name, c.city, c.country, STATE_INFO[stateOf(c)].label, c.pastor_name, c.created_at.slice(0, 10), c.facts.accounts, c.facts.people, attendance.get(c.id) ?? 0, c.active_7, c.active_30,
      c.last_activity ? c.last_activity.slice(0, 10) : '', attentionOf(c).map((a) => a.text).join(' / ')]))).catch(() => undefined);

  if (error && !data) return <DeskPage title="Iglesias"><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data) return <DeskPage title="Iglesias"><Loading /></DeskPage>;

  const cell = (c: CentralChurch, col: Col): React.ReactNode => {
    switch (col.key) {
      case 'name': return (
        <View>
          <Text style={[T.td, { fontWeight: '800' }]} numberOfLines={1}>{c.name}{c.is_host ? ' (la nuestra)' : ''}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{[c.city, c.province, c.country].filter(Boolean).join(', ') || '—'}</Text>
        </View>
      );
      case 'state': return <View style={{ alignItems: 'flex-start' }}><StateChip church={c} /></View>;
      case 'pastor': return <Text style={T.td} numberOfLines={1}>{c.pastor_name ?? '—'}</Text>;
      case 'created': return <Text style={T.td} numberOfLines={1}>{fmtDayYear(c.created_at)}</Text>;
      case 'accounts': return <Text style={T.num}>{c.facts.accounts}</Text>;
      case 'people': return <Text style={T.num}>{c.facts.people}</Text>;
      case 'attendance': return <Text style={T.num}>{attendance.get(c.id) ?? 0}</Text>;
      case 'active': return <Text style={T.num}>{c.active_7}</Text>;
      case 'last': return <Text style={T.td} numberOfLines={1}>{activityLabel(c.last_activity)}</Text>;
      default: {
        const why = attentionOf(c);
        return why.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{why.slice(0, 2).map((w) => <Tag key={w.key} text={w.text} tone={w.tone} />)}{why.length > 2 ? <Tag text={`+${why.length - 2}`} /> : null}</View>
          : <Text style={[T.td, { color: colors.muted }]}>Todo bien</Text>;
      }
    }
  };

  const wide = width >= 1150;
  return (
    <DeskPage title="Iglesias" subtitle={`${rows.length} de ${data.churches.length}`}
      actions={<>
        <DeskButton label="Bajar la lista (CSV)" icon="download" onPress={exportCsv} />
        {data.role === 'owner' ? <DeskButton label="Crear una iglesia o invitar a un pastor" icon="plus-circle" primary onPress={() => router.push('/admin/red' as Href)} /> : null}
      </>}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, minWidth: 260, flex: 1, maxWidth: 420, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bg }}>
            <Feather name="search" size={16} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Buscar por iglesia o ciudad" placeholderTextColor={colors.muted} accessibilityLabel="Buscar por iglesia o ciudad" autoCorrect={false}
              style={{ flex: 1, height: '100%', fontSize: 14, color: colors.text }} />
          </View>
          <View style={{ width: 300 }}><Toggle label="Solo las que necesitan atención" value={onlyAttention} onChange={setOnlyAttention} /></View>
        </View>
        <Chips<'all' | ChurchState> value={state} onChange={setState} options={[
          { value: 'all', label: 'Todas', count: data.churches.length },
          ...(['ok', 'setup', 'no_pastor', 'quiet', 'suspended'] as ChurchState[]).map((s) => ({ value: s, label: STATE_INFO[s].label, count: counts.get(s) ?? 0 })),
        ]} />
      </View>

      {!rows.length ? <Text style={{ fontSize: 14, color: colors.muted, paddingVertical: 20 }}>No hay iglesias con ese filtro.</Text> : wide ? (
        <View style={T.table}>
          <View style={T.thead}>
            {COLS.map((col) => {
              const active = col.sort && sort.by === col.sort;
              return (
                <Pressable key={col.key} disabled={!col.sort} accessibilityRole={col.sort ? 'button' : undefined} accessibilityLabel={col.sort ? `Ordenar por ${col.label}` : col.label}
                  onPress={() => col.sort && setSort((s) => ({ by: col.sort as ChurchSort, dir: s.by === col.sort ? (s.dir === 1 ? -1 : 1) : col.num ? -1 : 1 }))}
                  style={{ flex: col.flex, flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: col.num ? 'flex-end' : 'flex-start' }}>
                  <Text style={[T.th, active && { color: colors.text }]} numberOfLines={1}>{col.label}</Text>
                  {active ? <Feather name={sort.dir === 1 ? 'arrow-up' : 'arrow-down'} size={12} color={colors.text} /> : null}
                </Pressable>
              );
            })}
          </View>
          {rows.map((c) => (
            <Pressable key={c.id} accessibilityRole="link" accessibilityLabel={`Abrir ${c.name}`} onPress={() => open(c)}
              style={(s) => [T.row, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.bgSoft }]}>
              {COLS.map((col) => <View key={col.key} style={{ flex: col.flex, minWidth: 0 }}>{cell(c, col)}</View>)}
            </Pressable>
          ))}
        </View>
      ) : (
        // Pantalla más angosta (tablet): una tarjeta por iglesia.
        <View style={{ gap: 10 }}>
          {rows.map((c) => {
            const why = attentionOf(c);
            return (
              <Pressable key={c.id} accessibilityRole="link" onPress={() => open(c)} style={[T.table, { padding: 14, gap: 6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ flexShrink: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{c.name}</Text>
                  <StateChip church={c} />
                </View>
                <Text style={{ fontSize: 13, color: colors.muted }}>{[c.city, c.pastor_name ? `Pastor: ${c.pastor_name}` : null, `desde ${fmtDayYear(c.created_at)}`].filter(Boolean).join(' · ')}</Text>
                <Text style={{ fontSize: 13, color: colors.text }}>{`${c.facts.accounts} cuentas · ${c.facts.people} fichas · asistencia ${attendance.get(c.id) ?? 0} · ${c.active_7} activos en 7 días · ${activityLabel(c.last_activity)}`}</Text>
                {why.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{why.map((w) => <Tag key={w.key} text={w.text} tone={w.tone} />)}</View> : null}
              </Pressable>
            );
          })}
        </View>
      )}
      {data.demo ? <Text style={{ fontSize: 12, color: colors.muted }}>{`La iglesia de ejemplo "${data.demo.name}" (demostración) no figura en esta lista.`}</Text> : null}
    </DeskPage>
  );
}
