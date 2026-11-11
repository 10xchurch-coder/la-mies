// Tomar asistencia de una reunión: elegís la reunión y tocás la cara de cada persona que vino.
// La pueden tomar capitanes, recepción (ministerio que toma asistencia), secretaría y pastor.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header } from '@/components/Screen';
import { Face } from '@/components/Face';
import { DateChips } from '@/components/Picker';
import { Button, Empty, Loading } from '@/components/ui';
import { addPerson, attendanceSheet, listServices, setAttendance } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { STATUS_LABEL, addDays, fmtDateShort, isoDate } from '@/lib/format';
import { colors, themed } from '@/theme';
import { CONTENT_MAX_WIDTH, useLayout } from '@/lib/layout';
import type { ChurchService, SheetRow } from '@/types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** La reunión más cercana a hoy (la de hoy si hay; si no, la última que pasó). */
function defaultPick(services: ChurchService[]): { service: ChurchService | null; date: string } {
  const today = new Date();
  for (let back = 0; back < 7; back++) {
    const d = addDays(today, -back);
    const list = services.filter((s) => s.dow === d.getDay());
    if (list.length) {
      const main = list.find((s) => s.main) ?? list[0];
      return { service: main, date: isoDate(d) };
    }
  }
  return { service: services[0] ?? null, date: isoDate(today) };
}

export default function Asistencia() {
  const router = useRouter();
  const [services, setServices] = useState<ChurchService[]>([]);
  const [service, setService] = useState<ChurchService | null>(null);
  const [date, setDate] = useState(isoDate(new Date()));
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyPresent, setOnlyPresent] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [adding, setAdding] = useState(false);
  const { columns } = useLayout();
  const cols = columns(118, 3, 8);

  useEffect(() => {
    listServices().then((s) => {
      setServices(s);
      const p = defaultPick(s);
      setService(p.service);
      setDate(p.date);
    }).catch(() => setRows([]));
  }, []);

  const load = useCallback(async () => {
    if (!service) return;
    try {
      setRows(await attendanceSheet(date, service.id));
    } catch (e) {
      Alert.alert('No se pudo cargar', errorMessage(e));
      setRows([]);
    }
  }, [service, date]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Si otra persona está tomando asistencia al mismo tiempo, sus marcas aparecen solas acá.
      const id = setInterval(() => { if (!busyToggles.current) attendanceSheet(date, service?.id ?? '').then((r) => { if (service && !busyToggles.current) setRows(r); }).catch(() => undefined); }, 6000);
      return () => clearInterval(id);
    }, [load, date, service]),
  );

  // Fechas de esa reunión: las últimas 6 y la próxima.
  const dates = useMemo(() => {
    if (!service) return [];
    const out: string[] = [];
    const today = new Date();
    const back = (today.getDay() - service.dow + 7) % 7;
    for (let i = 0; i < 8; i++) out.push(isoDate(addDays(today, -back - 7 * i)));
    return out;
  }, [service]);

  useEffect(() => {
    if (dates.length && !dates.includes(date)) setDate(dates[0]);
  }, [dates, date]);

  const busyToggles = useRef(0);
  const toggle = async (r: SheetRow) => {
    if (!service) return;
    const next = !r.present;
    busyToggles.current += 1;
    setRows((rs) => rs?.map((x) => (x.contact_id === r.contact_id ? { ...x, present: next } : x)) ?? null);
    try {
      await setAttendance(r.contact_id, date, service.id, next);
    } catch (e) {
      setRows((rs) => rs?.map((x) => (x.contact_id === r.contact_id ? { ...x, present: !next } : x)) ?? null);
      Alert.alert('No se guardó', errorMessage(e));
    } finally {
      busyToggles.current -= 1;
    }
  };

  const quickAdd = async () => {
    if (!service || quickName.trim().length < 2) return;
    setAdding(true);
    try {
      const p = await addPerson({ name: quickName.trim(), status: 'visitor', interest: 'some' });
      await setAttendance(p.id, date, service.id, true);
      setQuickName('');
      await load();
      Alert.alert('Visita anotada', `${p.name} quedó presente. Después podés completar sus datos y su foto en Personas.`);
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  const shown = useMemo(() => {
    const s = norm(q.trim());
    return (rows ?? []).filter((r) => (!onlyPresent || r.present) && (!s || norm(r.name).includes(s)));
  }, [rows, q, onlyPresent]);
  const present = rows?.filter((r) => r.present).length ?? 0;

  if (!services.length && rows === null) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Asistencia" subtitle={service ? `${service.name} · ${fmtDateShort(date)}` : 'Sin reuniones cargadas'} back />
      <View style={styles.filters}>
        <DateChips
          dates={services.map((s) => s.id)}
          value={service?.id ?? ''}
          onChange={(sid) => setService(services.find((s) => s.id === sid) ?? null)}
          format={(sid) => services.find((s) => s.id === sid)?.name ?? ''}
        />
        <DateChips dates={dates} value={date} onChange={setDate} format={(d) => (d === isoDate(new Date()) ? 'Hoy' : fmtDateShort(d))} />
        <View style={styles.counter}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.greenText }}>{present}</Text>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.greenText }}>presentes{rows ? ` de ${rows.length} en la lista` : ''}</Text>
          <Pressable onPress={() => setOnlyPresent(!onlyPresent)} style={[styles.filter, onlyPresent && { backgroundColor: colors.green }]}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: onlyPresent ? '#FFF' : colors.greenText }}>{onlyPresent ? 'Ver todos' : 'Solo presentes'}</Text>
          </Pressable>
        </View>
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar" placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} />
        </View>
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
          ListEmptyComponent={<Empty icon="users" title="No hay nadie en la lista" text="Aparecen los miembros, las visitas y quienes prometieron venir. Agregá una visita nueva abajo." />}
          renderItem={({ item: r }) => (
            <Pressable onPress={() => toggle(r)} onLongPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id } })} accessibilityRole="checkbox" accessibilityState={{ checked: r.present }} style={[styles.cell, { maxWidth: `${100 / cols}%` }, r.present && styles.cellOn]}>
              <View>
                <Face name={r.name} path={r.photo_path} size={64} ring={r.present ? colors.green : undefined} />
                {r.present ? (
                  <View style={styles.check}>
                    <Feather name="check" size={14} color="#FFF" />
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: r.present ? '800' : '600', color: colors.text, textAlign: 'center' }}>{r.name}</Text>
              {r.status !== 'member' ? <Text style={{ fontSize: 10, color: colors.muted }}>{STATUS_LABEL[r.status]}</Text> : null}
            </Pressable>
          )}
        />
      )}
      <View style={styles.bottom}>
        <View style={{ flexDirection: 'row', gap: 8, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}>
        <TextInput value={quickName} onChangeText={setQuickName} placeholder="Visita nueva: nombre y apellido" placeholderTextColor="#8B918C" style={styles.quick} />
        <Button title="Anotar" small onPress={quickAdd} loading={adding} disabled={quickName.trim().length < 2} style={{ paddingHorizontal: 18 }} />
        </View>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  list: { padding: 12, paddingBottom: 140, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  filters: { paddingHorizontal: 16, gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.greenSoft },
  filter: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.green, justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSoft },
  cell: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, marginBottom: 8 },
  cellOn: { backgroundColor: colors.greenSoft },
  check: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  quick: { flex: 1, height: 44, borderWidth: 1.5, borderColor: colors.input, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, color: colors.text },
}));
