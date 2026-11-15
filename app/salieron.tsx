// Quiénes salieron a evangelizar: se marca a cada hermano que salió ese día, aunque no use la app.
// Es solo para saber cuántos salieron. No cuenta como asistencia a los cultos ni para la fidelidad.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header } from '@/components/Screen';
import { Face } from '@/components/Face';
import { DateChips } from '@/components/Picker';
import { Empty, Loading } from '@/components/ui';
import { attendanceCounts, outingSheet, setOutingAttendance, type OutingSheetRow } from '@/lib/api';
import { byFaithfulness, type Times } from '@/lib/faithful';
import { errorMessage } from '@/lib/supabase';
import { STATUS_LABEL, addDays, fmtDateShort, isoDate } from '@/lib/format';
import { colors, themed } from '@/theme';
import { CONTENT_MAX_WIDTH, useLayout } from '@/lib/layout';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Salieron() {
  const router = useRouter();
  const today = isoDate(new Date());
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<OutingSheetRow[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyOut, setOnlyOut] = useState(false);
  // Hermanos que salieron con la app pero todavía no tienen su ficha unida a la cuenta.
  const [noCard, setNoCard] = useState(0);
  const [times, setTimes] = useState<Times>({});
  const busy = useRef(0);

  // Cuántas veces salió cada uno: los que más salen quedan arriba de la lista.
  useEffect(() => { attendanceCounts('outing').then(setTimes); }, []);
  const { columns } = useLayout();
  const cols = columns(118, 3, 8);

  // Los últimos 14 días: lo normal es marcar la salida de hoy o la de hace unos días.
  const dates = useMemo(() => Array.from({ length: 14 }, (_, i) => isoDate(addDays(new Date(), -i))), []);

  const load = useCallback(async () => {
    try {
      const s = await outingSheet(date);
      if (!busy.current) { setRows(s.rows); setNoCard(Math.max(0, s.total - s.rows.filter((r) => r.marked || r.via_app).length)); }
    } catch (e) {
      Alert.alert('No se pudo cargar', errorMessage(e));
      setRows([]);
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      setRows(null);
      load();
      // Si otro está marcando al mismo tiempo, sus marcas aparecen solas.
      const id = setInterval(() => { if (!busy.current) load(); }, 8000);
      return () => clearInterval(id);
    }, [load]),
  );

  const toggle = async (r: OutingSheetRow) => {
    if (r.via_app) return;
    const next = !r.marked;
    busy.current += 1;
    setRows((rs) => rs?.map((x) => (x.contact_id === r.contact_id ? { ...x, marked: next } : x)) ?? null);
    try {
      await setOutingAttendance(r.contact_id, date, next);
    } catch (e) {
      setRows((rs) => rs?.map((x) => (x.contact_id === r.contact_id ? { ...x, marked: !next } : x)) ?? null);
      Alert.alert('No se guardó', errorMessage(e));
    } finally {
      busy.current -= 1;
    }
  };

  const went = (r: OutingSheetRow) => r.marked || r.via_app;
  const shown = useMemo(() => {
    const s = norm(q.trim());
    const list = (rows ?? []).filter((r) => (!onlyOut || went(r)) && (!s || norm(r.name).includes(s)));
    return byFaithfulness(list, times, (r) => r.contact_id, (r) => r.name);
  }, [rows, q, onlyOut, times]);
  const withApp = (rows?.filter((r) => r.via_app).length ?? 0) + noCard;
  const total = (rows?.filter((r) => r.marked && !r.via_app).length ?? 0) + withApp;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Quiénes salieron" subtitle={`Evangelismo · ${date === today ? 'hoy' : fmtDateShort(date)}`} back />
      <View style={styles.filters}>
        <DateChips dates={dates} value={date} onChange={setDate} format={(d) => (d === today ? 'Hoy' : fmtDateShort(d))} />
        <View style={styles.counter}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.greenText }}>{total}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.greenText }}>{total === 1 ? 'salió a evangelizar' : 'salieron a evangelizar'}</Text>
            {withApp ? <Text style={{ fontSize: 11, color: colors.greenText }}>{withApp} con la app, {total - withApp} marcados a mano</Text> : null}
          </View>
          <Pressable onPress={() => setOnlyOut(!onlyOut)} style={[styles.filter, onlyOut && { backgroundColor: colors.green }]}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: onlyOut ? '#FFF' : colors.greenText }}>{onlyOut ? 'Ver todos' : 'Solo los que salieron'}</Text>
          </Pressable>
        </View>
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar" placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} />
        </View>
        <Text style={{ fontSize: 12, color: colors.muted }}>Tocá a cada hermano que salió. Los que usaron la app ya aparecen marcados. Esto no cuenta como asistencia a los cultos.</Text>
      </View>
      {rows === null ? (
        <Loading />
      ) : (
        <FlatList
          key={cols}
          data={shown}
          keyExtractor={(r) => r.contact_id}
          numColumns={cols}
          contentContainerStyle={styles.list}
          columnWrapperStyle={{ gap: 8 }}
          ListEmptyComponent={<Empty icon="users" title="No hay nadie en la lista" text="Aparecen los miembros y los que asisten seguido." />}
          renderItem={({ item: r }) => {
            const on = went(r);
            return (
              <Pressable onPress={() => toggle(r)} onLongPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id } })} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: r.via_app }} style={[styles.cell, { maxWidth: `${100 / cols}%` }, on && styles.cellOn]}>
                <View>
                  <Face name={r.name} path={r.photo_path} size={64} ring={on ? colors.green : undefined} />
                  {on ? (
                    <View style={styles.check}>
                      <Feather name={r.via_app ? 'smartphone' : 'check'} size={14} color="#FFF" />
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: colors.text, textAlign: 'center' }}>{r.name}</Text>
                {r.via_app ? <Text style={{ fontSize: 10, fontWeight: '700', color: colors.greenText }}>Con la app</Text>
                  : r.status !== 'member' ? <Text style={{ fontSize: 10, color: colors.muted }}>{STATUS_LABEL[r.status]}</Text> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  list: { padding: 12, paddingBottom: 60, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  filters: { paddingHorizontal: 16, gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.greenSoft },
  filter: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.green, justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSoft },
  cell: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, marginBottom: 8 },
  cellOn: { backgroundColor: colors.greenSoft },
  check: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
}));
