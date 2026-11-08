// Cumpleaños de los próximos 30 días, con un saludo listo por WhatsApp.
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Card, Empty, Loading, SectionTitle } from '@/components/ui';
import { upcomingBirthdays, type BirthdayRow } from '@/lib/api';
import { isoDate, whatsappNumber } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function Cumples() {
  const router = useRouter();
  const { profile, church } = useAuth();
  const [rows, setRows] = useState<BirthdayRow[] | null>(null);
  useFocusEffect(useCallback(() => { upcomingBirthdays(30).then(setRows).catch(() => setRows([])); }, []));

  const today = isoDate(new Date());
  const groups: { title: string; list: BirthdayRow[] }[] = [
    { title: 'Hoy', list: (rows ?? []).filter((r) => r.next_on === today) },
    { title: 'Esta semana', list: (rows ?? []).filter((r) => r.next_on > today && r.next_on <= isoDate(new Date(Date.now() + 7 * 86400000))) },
    { title: 'Más adelante', list: (rows ?? []).filter((r) => r.next_on > isoDate(new Date(Date.now() + 7 * 86400000))) },
  ];

  const greet = (r: BirthdayRow) => {
    if (!r.phone) return;
    const first = r.name.split(' ')[0];
    const msg = `¡Feliz cumpleaños, ${first}! 🎉 Que Dios te bendiga mucho en este nuevo año de vida. Te queremos mucho. ${profile?.display_name ?? ''}${church?.name ? ` · ${church.name}` : ''}`;
    Linking.openURL(`https://wa.me/${whatsappNumber(r.phone)}?text=${encodeURIComponent(msg)}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Cumpleaños" subtitle="Los próximos 30 días" back />
      <Screen>
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="gift" title="No hay cumpleaños cargados" text="Cargá la fecha de nacimiento en la ficha de cada persona y aparecen acá. La víspera les llega un aviso a los líderes." /> : null}
        {groups.filter((g) => g.list.length).map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <SectionTitle>{g.title}</SectionTitle>
            <Card style={{ padding: 0 }}>
              {g.list.map((r, i) => (
                <View key={r.contact_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.contact_id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Face name={r.name} path={r.photo_path} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>{new Date(`${r.next_on}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · cumple {r.turns}</Text>
                    </View>
                  </Pressable>
                  {r.phone ? (
                    <Pressable onPress={() => greet(r)} accessibilityRole="button" accessibilityLabel={`Saludar a ${r.name}`} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="message-circle" size={18} color={colors.green} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </Card>
          </View>
        ))}
      </Screen>
    </View>
  );
}
