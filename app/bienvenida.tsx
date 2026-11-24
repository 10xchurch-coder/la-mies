// Visitas nuevas: quién ya recibió el regalo de bienvenida y una visita, con la fecha y quién lo anotó.
// Así nadie recibe dos regalos y nadie se queda sin el suyo.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { CareButtons } from '@/components/CareMarks';
import { Button, Card, Choice, Empty, Loading } from '@/components/ui';
import { filterCare, showDay, type CareFilter, type CareRow } from '@/lib/personas';
import { careList } from '@/lib/personasApi';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function Bienvenida() {
  const router = useRouter();
  const { isLeader } = useAuth();
  const [rows, setRows] = useState<CareRow[] | null>(null);
  const [filter, setFilter] = useState<CareFilter>('all');
  const load = useCallback(() => { careList().then(setRows).catch(() => setRows((r) => r ?? [])); }, []);
  useFocusEffect(load);

  const shown = filterCare(rows ?? [], filter);
  const noGift = filterCare(rows ?? [], 'no_gift').length;
  const noVisit = filterCare(rows ?? [], 'no_visit').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Visitas nuevas" subtitle="Regalo de bienvenida y visita" back />
      <Screen>
        {isLeader ? <Button title="Tarjeta de visita (QR de la puerta)" icon="grid" variant="outline" small onPress={() => router.push('/tarjeta-visita' as Href)} /> : null}
        <Choice columns={3} value={filter} onChange={setFilter}
          options={[{ value: 'all', label: `Todas (${rows?.length ?? 0})` }, { value: 'no_gift', label: `Sin regalo (${noGift})` }, { value: 'no_visit', label: `Sin visita (${noVisit})` }]} />
        {rows === null ? <Loading /> : !shown.length ? (
          <Empty icon="gift" title={filter === 'no_gift' ? 'Todas recibieron su regalo' : filter === 'no_visit' ? 'Todas recibieron una visita' : 'No hay visitas cargadas'}
            text={filter === 'all' ? 'Acá aparecen las personas que figuran como “Visita”.' : undefined} />
        ) : null}
        {shown.map((r) => (
          <Card key={r.id} style={{ padding: 12, gap: 10 }}>
            <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.id } })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Face name={r.name} path={r.photo_path} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{r.first_on ? `Vino por primera vez el ${showDay(r.first_on)}` : `Cargada el ${showDay(r.since)} · todavía sin asistencia`}</Text>
              </View>
            </Pressable>
            <CareButtons id={r.id} care={r} onChanged={load} />
          </Card>
        ))}
      </Screen>
    </View>
  );
}
