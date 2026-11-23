// Mensajes: mis conversaciones privadas con otros hermanos, y el botón para empezar una nueva.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, RowLink, Tag } from '@/components/ui';
import { Face } from '@/components/Face';
import { pastorUnread } from '@/lib/api';
import { norm } from '@/lib/desk';
import { dmInbox, dmPeople, dmPreview, type DmPerson, type DmThreadRow } from '@/lib/dm';
import { fmtRelativeDay } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function Mensajes() {
  const router = useRouter();
  const { profile } = useAuth();
  const isPastor = profile?.role === 'admin';
  const [rows, setRows] = useState<DmThreadRow[] | null>(null);
  const [people, setPeople] = useState<DmPerson[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [pm, setPm] = useState(0);

  useFocusEffect(useCallback(() => {
    dmInbox().then(setRows).catch(() => setRows((old) => old ?? []));
    pastorUnread().then(setPm).catch(() => undefined);
  }, []));

  const open = (id: string, name: string) => router.push({ pathname: '/mensajes/[id]', params: { id, name } } as unknown as Href);
  const startNew = () => {
    setPicking(true);
    if (!people) dmPeople().then(setPeople).catch(() => setPeople([]));
  };
  const shown = useMemo(() => {
    const k = norm(q.trim());
    return (people ?? []).filter((p) => !k || norm(p.name).includes(k));
  }, [people, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mensajes" subtitle="Conversaciones privadas con otros hermanos" back />
      <Screen>
        {picking ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, backgroundColor: colors.bgSoft, paddingHorizontal: 12 }}>
              <Feather name="search" size={18} color={colors.muted} />
              <TextInput value={q} onChangeText={setQ} autoFocus placeholder="¿A quién le escribís?" placeholderTextColor={colors.muted} accessibilityLabel="Buscar a un hermano" style={{ flex: 1, fontSize: 16, color: colors.text }} />
              <Pressable onPress={() => { setPicking(false); setQ(''); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar"><Feather name="x" size={20} color={colors.muted} /></Pressable>
            </View>
            {people === null ? <Loading /> : !shown.length ? <Empty icon="users" title="No hay nadie con ese nombre" text="Solo aparecen los hermanos que ya tienen la app." /> : null}
            {shown.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Escribirle a ${p.name}`} onPress={() => { setPicking(false); setQ(''); open(p.id, p.name); }}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
                  <Face name={p.name} path={p.photo_path} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{p.name}</Text>
                    {p.title ? <Text style={{ fontSize: 12, color: colors.violetText, fontWeight: '700' }}>{p.title}</Text> : null}
                  </View>
                  {p.i_blocked ? <Tag text="Bloqueado" tone="red" /> : <Feather name="chevron-right" size={18} color={colors.gray} />}
                </Card>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <Button title="Nuevo mensaje" icon="edit" onPress={startNew} />
            <Card style={{ padding: 0 }}>
              {isPastor ? (
                <>
                  <RowLink icon="mail" title={pm ? `Mensajes al pastor (${pm} sin leer)` : 'Mensajes al pastor'} subtitle="Lo que te escriben desde “Escribile al pastor”" onPress={() => router.push('/pastor-bandeja' as Href)} />
                  <RowLink icon="flag" title="Mensajes denunciados" subtitle="Lo que algún hermano denunció de un mensaje privado" onPress={() => router.push('/mensajes/denuncias' as Href)} />
                </>
              ) : (
                <RowLink icon="mail" title={pm ? `Escribile al pastor (${pm} nuevo${pm > 1 ? 's' : ''})` : 'Escribile al pastor'} subtitle="Solo lo lee el pastor" onPress={() => router.push('/pastor-hilo' as Href)} />
              )}
            </Card>
            {rows === null ? <Loading /> : !rows.length ? (
              <Empty icon="message-circle" title="Todavía no tenés conversaciones" text="Tocá “Nuevo mensaje” para escribirle a un hermano. Lo que se escriben lo ven solo ustedes dos." />
            ) : rows.map((r) => (
              <Pressable key={r.other_id} accessibilityRole="button" accessibilityLabel={`Conversación con ${r.name}${r.unread ? `, ${r.unread} sin leer` : ''}`} onPress={() => open(r.other_id, r.name)}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                  <Face name={r.name} path={r.photo_path} size={46} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: r.unread ? '800' : '700', color: colors.text }}>{r.name}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 13, color: r.unread ? colors.text : colors.muted }}>{r.last_mine ? 'Vos: ' : ''}{dmPreview(r)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{fmtRelativeDay(r.last_at)}</Text>
                    {r.unread ? (
                      <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>{r.unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </Screen>
    </View>
  );
}
