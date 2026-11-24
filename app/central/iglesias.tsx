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
import { tx } from '@/lib/i18n';

type Col = { key: ChurchSort | 'attention'; label: string; flex: number; num?: boolean; sort?: ChurchSort };
const COLS: Col[] = [
  { key: 'name', get label() { return tx('Iglesia'); }, flex: 2.3, sort: 'name' },
  { key: 'state', get label() { return tx('Estado'); }, flex: 1.5, sort: 'state' },
  { key: 'created', get label() { return tx('Desde'); }, flex: 0.95, sort: 'created' },
  { key: 'accounts', get label() { return tx('Cuentas'); }, flex: 0.8, num: true, sort: 'accounts' },
  { key: 'people', get label() { return tx('Fichas'); }, flex: 0.7, num: true, sort: 'people' },
  { key: 'attendance', get label() { return tx('Asistencia'); }, flex: 1, num: true, sort: 'attendance' },
  { key: 'active', get label() { return tx('Usaron 7 d.'); }, flex: 1, num: true, sort: 'active' },
  { key: 'last', get label() { return tx('Último uso'); }, flex: 1.05, sort: 'last' },
  { key: 'attention', get label() { return tx('Atención'); }, flex: 2.7 },
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
    [tx('Iglesia'), tx('Ciudad'), tx('País'), tx('Estado'), tx('Pastor'), tx('Desde'), tx('Cuentas'), tx('Fichas de personas'), tx('Asistencia (última semana)'), tx('Usaron la app en 7 días'), tx('Usaron la app en 30 días'), tx('Último movimiento'), tx('Atención')],
    rows.map((c) => [c.name, c.city, c.country, STATE_INFO[stateOf(c)].label, c.pastor_name, c.created_at.slice(0, 10), c.facts.accounts, c.facts.people, attendance.get(c.id) ?? 0, c.active_7, c.active_30,
      c.last_activity ? c.last_activity.slice(0, 10) : '', attentionOf(c).map((a) => a.text).join(' / ')]))).catch(() => undefined);

  if (error && !data) return <DeskPage title={tx('Iglesias')}><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data) return <DeskPage title={tx('Iglesias')}><Loading /></DeskPage>;

  const cell = (c: CentralChurch, col: Col): React.ReactNode => {
    switch (col.key) {
      case 'name': return (
        <View>
          <Text style={[T.td, { fontWeight: '800' }]} numberOfLines={1}>{c.name}{c.is_host ? tx(' (la nuestra)') : ''}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{[c.city, c.province, c.country].filter(Boolean).join(', ') || '—'}</Text>
        </View>
      );
      case 'state': return <View style={{ alignItems: 'flex-start' }}><StateChip church={c} /></View>;
      case 'created': return <Text style={T.td} numberOfLines={1}>{c.created_at.slice(0, 10).split('-').reverse().join('/')}</Text>;
      case 'accounts': return <Text style={T.num}>{c.facts.accounts}</Text>;
      case 'people': return <Text style={T.num}>{c.facts.people}</Text>;
      case 'attendance': return <Text style={T.num}>{attendance.get(c.id) ?? 0}</Text>;
      case 'active': return <Text style={T.num}>{c.active_7}</Text>;
      case 'last': return <Text style={T.td} numberOfLines={1}>{activityLabel(c.last_activity)}</Text>;
      default: {
        // En la tabla van como renglones de texto (los chips no entran en una columna angosta).
        const why = attentionOf(c);
        const tone = { red: colors.redText, amber: colors.amberText, blue: colors.blueText } as const;
        return why.length ? (
          <View style={{ gap: 2 }}>
            {why.slice(0, 2).map((w) => <Text key={w.key} style={{ fontSize: 12, fontWeight: '700', color: tone[w.tone], lineHeight: 16 }} numberOfLines={2}>{`• ${w.text}`}</Text>)}
            {why.length > 2 ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('y {v1} más', { v1: why.length - 2 })}</Text> : null}
          </View>
        ) : <Text style={[T.td, { color: colors.muted }]}>{tx('Todo bien')}</Text>;
      }
    }
  };

  const wide = width >= 1250;
  return (
    <DeskPage title={tx('Iglesias')} subtitle={tx('{n} de {n2}', { n: rows.length, n2: data.churches.length })}
      actions={<>
        <DeskButton label={tx('Bajar la lista (CSV)')} icon="download" onPress={exportCsv} />
        {data.role === 'owner' ? <DeskButton label={tx('Crear una iglesia o invitar a un pastor')} icon="plus-circle" primary onPress={() => router.push('/admin/red' as Href)} /> : null}
      </>}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, minWidth: 260, flex: 1, maxWidth: 420, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bg }}>
            <Feather name="search" size={16} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder={tx('Buscar por iglesia o ciudad')} placeholderTextColor={colors.muted} accessibilityLabel={tx('Buscar por iglesia o ciudad')} autoCorrect={false}
              style={{ flex: 1, height: '100%', fontSize: 14, color: colors.text }} />
          </View>
          <View style={{ width: 300 }}><Toggle label={tx('Solo las que necesitan atención')} value={onlyAttention} onChange={setOnlyAttention} /></View>
        </View>
        <Chips<'all' | ChurchState> value={state} onChange={setState} options={[
          { value: 'all', label: tx('Todas'), count: data.churches.length },
          ...(['ok', 'setup', 'no_pastor', 'quiet', 'suspended'] as ChurchState[]).map((s) => ({ value: s, label: STATE_INFO[s].label, count: counts.get(s) ?? 0 })),
        ]} />
      </View>

      {!rows.length ? <Text style={{ fontSize: 14, color: colors.muted, paddingVertical: 20 }}>{tx('No hay iglesias con ese filtro.')}</Text> : wide ? (
        <View style={T.table}>
          <View style={T.thead}>
            {COLS.map((col) => {
              const active = col.sort && sort.by === col.sort;
              return (
                <Pressable key={col.key} disabled={!col.sort} accessibilityRole={col.sort ? 'button' : undefined} accessibilityLabel={col.sort ? tx('Ordenar por {label}', { label: col.label }) : col.label}
                  onPress={() => col.sort && setSort((s) => ({ by: col.sort as ChurchSort, dir: s.by === col.sort ? (s.dir === 1 ? -1 : 1) : col.num ? -1 : 1 }))}
                  style={{ flex: col.flex, flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: col.num ? 'flex-end' : 'flex-start' }}>
                  <Text style={[T.th, active && { color: colors.text }]} numberOfLines={1}>{col.label}</Text>
                  {active ? <Feather name={sort.dir === 1 ? 'arrow-up' : 'arrow-down'} size={12} color={colors.text} /> : null}
                </Pressable>
              );
            })}
          </View>
          {rows.map((c) => (
            <Pressable key={c.id} accessibilityRole="link" accessibilityLabel={tx('Abrir {name}', { name: c.name })} onPress={() => open(c)}
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
                <Text style={{ fontSize: 13, color: colors.muted }}>{[c.city, c.pastor_name ? tx('Pastor: {pastor_name}', { pastor_name: c.pastor_name }) : null, tx('desde {fmtDayYear}', { fmtDayYear: fmtDayYear(c.created_at) })].filter(Boolean).join(' · ')}</Text>
                <Text style={{ fontSize: 13, color: colors.text }}>{tx('{accounts} cuentas · {people} fichas · asistencia {get} · {active_7} activos en 7 días · {activityLabel}', { accounts: c.facts.accounts, people: c.facts.people, get: attendance.get(c.id) ?? 0, active_7: c.active_7, activityLabel: activityLabel(c.last_activity) })}</Text>
                {why.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{why.map((w) => <Tag key={w.key} text={w.text} tone={w.tone} />)}</View> : null}
              </Pressable>
            );
          })}
        </View>
      )}
      {data.demo ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('La iglesia de ejemplo "{name}" (demostración) no figura en esta lista.', { name: data.demo.name })}</Text> : null}
    </DeskPage>
  );
}
