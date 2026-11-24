// "No hubo": marcar las fechas en que una reunión (culto, jóvenes, oración…) o una actividad semanal
// del calendario (por ejemplo Evangelismo personal) no se hizo o no se va a hacer.
// Esas fechas no cuentan para la fidelidad ni para las ausencias, y el informe semanal dice "no hubo".
// Se abre con ?servicio=<id> o ?evento=<id>.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Loading } from '@/components/ui';
import { getEvent, listAllServices, listCancellations, setCancelled } from '@/lib/api';
import { addDays, dayName, fmtDateShort, isoDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import type { Cancellation } from '@/types';
import { tx } from '@/lib/i18n';

const PAST_WEEKS = 4;
const NEXT_WEEKS = 8;

export default function Suspender() {
  const { servicio, evento } = useLocalSearchParams<{ servicio?: string; evento?: string }>();
  const [item, setItem] = useState<{ name: string; dow: number } | null | undefined>(undefined);
  const [offs, setOffs] = useState<Cancellation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const today = isoDate(new Date());

  const load = useCallback(() => {
    if (servicio) {
      listAllServices().then((ss) => {
        const s = ss.find((x) => x.id === servicio);
        setItem(s ? { name: s.name, dow: s.dow } : null);
      }).catch(() => setItem(null));
    } else if (evento) {
      getEvent(evento).then((e) => setItem(e && e.weekly ? { name: e.title, dow: new Date(e.starts_at).getDay() } : null)).catch(() => setItem(null));
    } else {
      setItem(null);
    }
    listCancellations(isoDate(addDays(new Date(), -7 * (PAST_WEEKS + 1)))).then(setOffs);
  }, [servicio, evento]);
  useFocusEffect(load);

  // Las fechas de esa reunión: las próximas arriba (para avisar con tiempo) y las últimas abajo.
  const dates = useMemo(() => {
    if (!item) return { next: [] as string[], past: [] as string[] };
    const now = new Date();
    const first = addDays(now, (item.dow - now.getDay() + 7) % 7);
    const next = Array.from({ length: NEXT_WEEKS }, (_, i) => isoDate(addDays(first, 7 * i)));
    const past = Array.from({ length: PAST_WEEKS }, (_, i) => isoDate(addDays(first, -7 * (i + 1))));
    return { next, past };
  }, [item]);

  const isOff = (d: string) => offs.find((c) => c.on_date === d && (servicio ? c.service_id === servicio : c.event_id === evento));

  const toggle = async (d: string) => {
    const off = !isOff(d);
    setBusy(d);
    try {
      await setCancelled({ serviceId: servicio ?? null, eventId: evento ?? null, date: d, cancelled: off });
      setOffs(await listCancellations(isoDate(addDays(new Date(), -7 * (PAST_WEEKS + 1)))));
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (item === undefined) return <Loading />;
  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('No hubo')} back />
        <Text style={{ padding: 24, color: colors.muted, textAlign: 'center' }}>{tx('No se encontró esa reunión.')}</Text>
      </View>
    );
  }

  const Row = ({ d, last }: { d: string; last: boolean }) => {
    const off = !!isOff(d);
    const future = d > today;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border, backgroundColor: off ? colors.amberSoft : 'transparent' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{d === today ? tx('Hoy · {fmtDateShort}', { fmtDateShort: fmtDateShort(d) }) : fmtDateShort(d)}</Text>
          <Text style={{ fontSize: 12, color: off ? colors.amberText : colors.muted }}>
            {off ? (future ? tx('Se suspende') : tx('No hubo')) : future ? tx('Se hace') : tx('Hubo')}
          </Text>
        </View>
        <Pressable
          onPress={() => toggle(d)}
          disabled={busy !== null}
          accessibilityRole="switch"
          accessibilityState={{ checked: off, busy: busy === d }}
          accessibilityLabel={`${item.name} ${fmtDateShort(d)}: ${off ? tx('no hubo') : tx('hubo')}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1.5,
            borderColor: off ? colors.amber : colors.input, backgroundColor: off ? colors.amber : colors.bg, opacity: busy === d ? 0.5 : 1 }}
        >
          <Feather name={off ? 'x-circle' : 'slash'} size={15} color={off ? '#FFF' : colors.text} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: off ? '#FFF' : colors.text }}>
            {off ? (future ? tx('Suspendida') : tx('No hubo')) : future ? tx('Suspender') : tx('Marcar "no hubo"')}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={item.name} subtitle={tx('Cada {dayName} · fechas que no se hacen', { dayName: dayName(item.dow) })} back />
      <Screen>
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
          {tx('Marcá las fechas en que no hubo')} {item.name.toLowerCase()} {tx('o en que se suspende. Esas fechas no bajan los números: no cuentan para la fidelidad ni para las ausencias, y en el informe semanal figuran como "no hubo".')}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{tx('Próximas')}</Text>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {dates.next.map((d, i) => <Row key={d} d={d} last={i === dates.next.length - 1} />)}
        </Card>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{tx('Últimas')}</Text>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {dates.past.map((d, i) => <Row key={d} d={d} last={i === dates.past.length - 1} />)}
        </Card>
        {servicio ? (
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>
            {tx('Si ya se tomó asistencia ese día, primero sacá a los presentes en Asistencia.')}
          </Text>
        ) : null}
      </Screen>
    </View>
  );
}
