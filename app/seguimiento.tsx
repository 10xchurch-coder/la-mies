// Mis contactos para seguir: los que anoté (o me asignaron), primero los que prometieron venir y los más interesados.
// Con un toque: WhatsApp con el mensaje escrito, llamar, cómo llegar o registrar la visita.
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Card, Empty, Loading, Tag } from '@/components/ui';
import { completeFollowUp, listServices, myFirstVisitTasks, myFollowups, type FirstVisitTask } from '@/lib/api';
import { INTEREST_LABEL, PROMISE_LABEL, fmtRelativeDay } from '@/lib/format';
import { chooseWhatsApp } from '@/lib/messages';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchService, FollowupRow } from '@/types';

export default function Seguimiento() {
  const router = useRouter();
  const { profile, church } = useAuth();
  const [rows, setRows] = useState<FollowupRow[] | null>(null);
  const [services, setServices] = useState<ChurchService[]>([]);
  const [tasks, setTasks] = useState<FirstVisitTask[]>([]);

  useEffect(() => {
    listServices().then(setServices).catch(() => undefined);
  }, []);
  useFocusEffect(
    useCallback(() => {
      myFollowups().then(setRows).catch(() => setRows([]));
      myFirstVisitTasks().then(setTasks).catch(() => undefined);
    }, []),
  );

  const week = Date.now() - 7 * 86400000;
  const pending = (rows ?? []).filter((r) => !r.last_visit || new Date(r.last_visit).getTime() < week);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mis contactos para seguir" subtitle={rows ? `${rows.length} personas · ${pending.length} sin contacto esta semana` : undefined} back />
      <Screen>
        {tasks.length ? (
          <Card style={{ gap: 8, borderColor: colors.amber, borderWidth: 1.5, backgroundColor: colors.amberSoft }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.amberText }}>Vinieron por primera vez</Text>
            <Text style={{ fontSize: 12, color: colors.amberText }}>Llamalos en 48 horas y visitalos en la semana. Al registrar la visita se tilda solo.</Text>
            {tasks.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: t.contact_id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Face name={t.name} path={t.photo_path} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{t.name}</Text>
                    <Text style={{ fontSize: 12, color: t.overdue ? colors.red : colors.muted }}>
                      {t.kind === 'call' ? 'Llamar' : 'Visitar'} {t.overdue ? '· atrasado' : `antes del ${new Date(t.due_at).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}`}
                    </Text>
                  </View>
                </Pressable>
                {t.phone ? <Small icon={t.kind === 'call' ? 'phone' : 'message-circle'} label={t.kind === 'call' ? 'Llamar' : 'Escribir'} onPress={() => (t.kind === 'call' ? Linking.openURL(`tel:${t.phone}`) : chooseWhatsApp(t.phone, { to: t.name, from: profile?.display_name, church: church?.name, services }, ['followup', 'visit']))} /> : null}
                <Small icon="check" label="Hecho" onPress={() => completeFollowUp(t.id).then(() => setTasks(tasks.filter((x) => x.id !== t.id))).catch(() => undefined)} />
              </View>
            ))}
          </Card>
        ) : null}
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="users" title="No tenés contactos para seguir" text="Los contactos que anotás en las salidas (o que te asignan) aparecen acá." /> : null}
        {(rows ?? []).map((r) => {
          const stale = !r.last_visit || new Date(r.last_visit).getTime() < week;
          return (
            <Card key={r.id} style={{ padding: 12, gap: 10 }}>
              <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="button">
                <Face name={r.name} path={r.photo_path} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
                    {r.last_visit ? `Último contacto: ${fmtRelativeDay(r.last_visit)}` : 'Sin visitas todavía'}{r.address_hint ? ` · ${r.address_hint}` : ''}
                  </Text>
                </View>
                {r.promise_day ? <Tag text={`Prometió ${PROMISE_LABEL[r.promise_day] ?? ''}`} tone="amber" /> : r.interest ? <Tag text={INTEREST_LABEL[r.interest] ?? r.interest} tone={r.interest === 'very' ? 'green' : 'gray'} /> : null}
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Small icon="message-circle" label="WhatsApp" disabled={!r.phone} onPress={() => chooseWhatsApp(r.phone, { to: r.name, from: profile?.display_name, church: church?.name, promiseDay: r.promise_day, services }, r.promise_day ? ['promise', 'followup', 'visit'] : ['followup', 'visit', 'promise'])} />
                <Small icon="phone" label="Llamar" disabled={!r.phone} onPress={() => Linking.openURL(`tel:${r.phone}`)} />
                <Small icon="check-square" label={stale ? 'Visité' : 'Visitado'} onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.id, visita: '1' } })} />
              </View>
            </Card>
          );
        })}
      </Screen>
    </View>
  );
}

function Small({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 10, backgroundColor: colors.greenSoft, opacity: disabled ? 0.4 : 1 }}>
      <Feather name={icon} size={16} color={colors.greenText} />
      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.greenText }}>{label}</Text>
    </Pressable>
  );
}
