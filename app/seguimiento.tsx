// Mis contactos para seguir: los que anoté (o me asignaron), primero los que prometieron venir y los más interesados.
// Con un toque: WhatsApp con el mensaje escrito, llamar, cómo llegar o registrar la visita.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Card, Empty, Loading, Tag } from '@/components/ui';
import { completeFollowUp, listServices, myFirstVisitTasks, myFollowups, type FirstVisitTask } from '@/lib/api';
import { INTEREST_LABEL, PROMISE_LABEL, fmtRelativeDay } from '@/lib/format';
import { chooseWhatsApp, messageText, openWhatsApp } from '@/lib/messages';
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

  // Una fila por persona (cada visita nueva trae dos pasos: escribirle y visitarla).
  const visitors = useMemo(() => {
    const by = new Map<string, { contact_id: string; name: string; phone: string | null; photo_path: string | null; tasks: FirstVisitTask[] }>();
    for (const t of tasks) {
      const v = by.get(t.contact_id) ?? { contact_id: t.contact_id, name: t.name, phone: t.phone, photo_path: t.photo_path, tasks: [] };
      v.tasks.push(t);
      by.set(t.contact_id, v);
    }
    for (const v of by.values()) v.tasks.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'call' ? -1 : 1));
    return [...by.values()];
  }, [tasks]);

  const week = Date.now() - 7 * 86400000;
  const pending = (rows ?? []).filter((r) => !r.last_visit || new Date(r.last_visit).getTime() < week);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mis contactos para seguir" subtitle={rows ? `${rows.length} personas · ${pending.length} sin contacto esta semana` : undefined} back />
      <Screen>
        {tasks.length ? (
          <Card style={{ gap: 8, borderColor: colors.amber, borderWidth: 1.5, backgroundColor: colors.amberSoft }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.amberText }}>Vinieron por primera vez</Text>
            <Text style={{ fontSize: 12, color: colors.amberText }}>Cada uno tiene dos pasos: escribirle en 48 horas y visitarlo en la semana. El botón de WhatsApp abre el mensaje ya escrito. Cuando hagas cada paso, tocá “Ya le escribí” o “Ya lo visité” y sale de la lista.</Text>
            {visitors.map((v) => (
              <View key={v.contact_id} style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: v.contact_id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Face name={v.name} path={v.photo_path} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{v.name}</Text>
                    {v.tasks.map((t) => (
                      <Text key={t.id} style={{ fontSize: 12, color: t.overdue ? colors.red : colors.muted }}>
                        {t.kind === 'call' ? 'Escribirle' : 'Visitarlo'} {t.overdue ? '· atrasado' : `antes del ${new Date(t.due_at).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}`}
                      </Text>
                    ))}
                  </View>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Small icon="message-circle" label="WhatsApp" disabled={!v.phone}
                    onPress={() => openWhatsApp(v.phone, messageText('firstvisit', { to: v.name, from: profile?.display_name, church: church?.name, services }))} />
                  {v.tasks.map((t) => (
                    <Small key={t.id} icon="check" label={t.kind === 'call' ? 'Ya le escribí' : 'Ya lo visité'}
                      onPress={() => completeFollowUp(t.id).then(() => setTasks((cur) => cur.filter((x) => x.id !== t.id))).catch(() => undefined)} />
                  ))}
                </View>
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
