// Quiénes faltaron el fin de semana (miembros y visitas), separados por cuántas semanas seguidas faltaron.
// Al lado de cada uno: WhatsApp con el mensaje que corresponde (desde tu nombre), llamar y registrar la visita.
//   1 semana  → "te extrañamos, ¿cómo estás?, ¿podemos orar por algo?"
//   2 semanas → coordinar una visita
//   3 o más   → "recién oré por vos" + recordatorio de visitarlo
import { telDigits } from '@/lib/phone';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { DateChips } from '@/components/Picker';
import { Empty, Loading, Tag } from '@/components/ui';
import { listServices, weekendAbsences } from '@/lib/api';
import { addDays, fmtDateOnly, fmtDateShort, fmtRelativeDay, isoDate, lastSaturday, parseDate } from '@/lib/format';
import { messageText, openWhatsApp, type MessageKind } from '@/lib/messages';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { AbsenceRow, ChurchService } from '@/types';

const SECTIONS: { weeks: number; title: string; hint: string; kind: MessageKind; tone: 'amber' | 'red' | 'blue' }[] = [
  { weeks: 1, title: 'Faltaron este fin de semana', hint: 'Escribiles hoy: los extrañamos y queremos saber cómo están.', kind: 'missed1', tone: 'blue' },
  { weeks: 2, title: 'Faltaron 2 semanas seguidas', hint: 'Coordiná una visita esta semana.', kind: 'missed2', tone: 'amber' },
  { weeks: 3, title: 'Faltaron 3 semanas o más', hint: 'Orá por cada uno, mandales que oraste por ellos y visitalos.', kind: 'missed3', tone: 'red' },
];

export default function Ausencias() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fecha?: string }>();
  const { isStaff, profile, church } = useAuth();
  const [sat, setSat] = useState(params.fecha ?? lastSaturday());
  const [rows, setRows] = useState<AbsenceRow[] | null>(null);
  const [services, setServices] = useState<ChurchService[]>([]);
  const saturdays = Array.from({ length: 8 }, (_, i) => isoDate(addDays(parseDate(lastSaturday()), -7 * i)));

  useEffect(() => {
    listServices().then(setServices).catch(() => undefined);
  }, []);
  useFocusEffect(
    useCallback(() => {
      setRows(null);
      weekendAbsences(sat).then(setRows).catch(() => setRows([]));
    }, [sat]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Faltaron" subtitle={`Fin de semana del ${fmtDateShort(sat)} y ${fmtDateShort(isoDate(addDays(parseDate(sat), 1)))}`} back />
      <Screen>
        <DateChips dates={saturdays.includes(sat) ? saturdays : [sat, ...saturdays]} value={sat} onChange={setSat} format={(d) => `Finde ${fmtDateShort(d)}`} />
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          {isStaff || church?.absence_recipients?.includes(profile?.id ?? '') ? 'Miembros y visitas que no fueron marcados presentes el sábado ni el domingo.' : 'La gente de tu ruta que no fue marcada presente el sábado ni el domingo.'} El WhatsApp sale desde tu teléfono y con tu nombre.
        </Text>
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="check-circle" title="No faltó nadie" text="¡Gloria a Dios!" /> : null}
        {SECTIONS.map((sec) => {
          const list = (rows ?? []).filter((r) => Math.min(3, r.weeks_missed ?? 1) === sec.weeks);
          if (!list.length) return null;
          return (
            <View key={sec.weeks} style={{ gap: 8 }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{sec.title} · {list.length}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{sec.hint}</Text>
              </View>
              {list.map((r) => (
                <View key={r.contact_id} style={{ gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                  <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="button">
                    <Face name={r.name} path={r.photo_path} size={44} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {r.last_attended ? `Vino por última vez: ${fmtDateOnly(r.last_attended)}` : 'Nunca marcado presente'}
                        {r.last_visit ? ` · visitado ${fmtRelativeDay(r.last_visit)}` : ''}
                      </Text>
                    </View>
                    <Tag text={r.status === 'member' ? 'Miembro' : 'Visita'} tone={r.status === 'member' ? 'green' : sec.tone} />
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Btn icon="message-circle" label={sec.weeks === 3 ? 'Oré por vos' : sec.weeks === 2 ? 'Coordinar visita' : 'Lo extrañamos'} disabled={!r.phone}
                      onPress={() => openWhatsApp(r.phone, messageText(sec.kind, { to: r.name, from: profile?.display_name, church: church?.name, services }))} />
                    <Btn icon="phone" label="Llamar" disabled={!r.phone} onPress={() => Linking.openURL(`tel:${telDigits(r.phone)}`)} />
                    <Btn icon="check-square" label="Visité" onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id, visita: '1' } })} />
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </Screen>
    </View>
  );
}

function Btn({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 10, backgroundColor: colors.greenSoft, opacity: disabled ? 0.4 : 1 }}>
      <Feather name={icon} size={15} color={colors.greenText} />
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.greenText }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
