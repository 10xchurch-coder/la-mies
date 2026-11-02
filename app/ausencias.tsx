// Quiénes faltaron el fin de semana. El pastor ve a los miembros; cada capitán, a la gente de su colectivo.
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { DateChips } from '@/components/Picker';
import { Empty, Loading, Tag } from '@/components/ui';
import { weekendAbsences } from '@/lib/api';
import { addDays, fmtDateOnly, fmtDateShort, isoDate, lastSaturday, parseDate, whatsappNumber } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { AbsenceRow } from '@/types';

export default function Ausencias() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fecha?: string }>();
  const { isStaff } = useAuth();
  const [sat, setSat] = useState(params.fecha ?? lastSaturday());
  const [rows, setRows] = useState<AbsenceRow[] | null>(null);
  const saturdays = Array.from({ length: 8 }, (_, i) => isoDate(addDays(parseDate(lastSaturday()), -7 * i)));

  useFocusEffect(
    useCallback(() => {
      setRows(null);
      weekendAbsences(sat).then(setRows).catch(() => setRows([]));
    }, [sat]),
  );

  const groups = (rows ?? []).reduce<Record<string, AbsenceRow[]>>((acc, r) => {
    const k = r.group_name ?? 'Sin colectivo';
    return { ...acc, [k]: [...(acc[k] ?? []), r] };
  }, {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Faltaron" subtitle={`Fin de semana del ${fmtDateShort(sat)} y ${fmtDateShort(isoDate(addDays(parseDate(sat), 1)))}`} back />
      <Screen>
        <DateChips dates={saturdays.includes(sat) ? saturdays : [sat, ...saturdays]} value={sat} onChange={setSat} format={(d) => `Finde ${fmtDateShort(d)}`} />
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          {isStaff ? 'Miembros que no fueron marcados presentes en ninguna reunión del sábado ni del domingo.' : 'La gente de tu colectivo que no fue marcada presente el sábado ni el domingo.'} Tomá asistencia en cada culto para que esta lista sea exacta.
        </Text>
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="check-circle" title="No faltó nadie" text="¡Gloria a Dios!" /> : null}
        {Object.entries(groups).map(([g, list]) => (
          <View key={g} style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>{g.toUpperCase()} · {list.length}</Text>
            {list.map((r) => (
              <Pressable key={r.contact_id} onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                <Face name={r.name} path={r.photo_path} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700' }}>{r.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{r.last_attended ? `Última vez: ${fmtDateOnly(r.last_attended)}` : 'Nunca marcado presente'}</Text>
                </View>
                {r.status !== 'member' ? <Tag text={r.status === 'visitor' ? 'Visita' : 'Contacto'} tone="blue" /> : null}
                {r.phone ? (
                  <>
                    <Pressable onPress={() => Linking.openURL(`tel:${r.phone}`)} accessibilityLabel={`Llamar a ${r.name}`} style={{ padding: 8 }}>
                      <Feather name="phone" size={20} color={colors.green} />
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL(`https://wa.me/${whatsappNumber(r.phone as string)}`)} accessibilityLabel={`WhatsApp a ${r.name}`} style={{ padding: 8 }}>
                      <Feather name="message-circle" size={20} color={colors.green} />
                    </Pressable>
                  </>
                ) : null}
              </Pressable>
            ))}
          </View>
        ))}
      </Screen>
    </View>
  );
}
