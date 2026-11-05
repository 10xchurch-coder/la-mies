// Un ministerio: chat del grupo (el líder puede mandar anuncios a todos), turnos, integrantes y recomendaciones.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Empty, Loading, RowLink, Segmented, Tag } from '@/components/ui';
import { listDuties, listMinistries, listPeople, listProfiles, ministryMembers, ministryMessages, sendMinistryMessage } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtDateShort, fmtRelativeDay, fmtTime, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Contact, Duty, Ministry, MinistryMember, MinistryMessage, Profile } from '@/types';

type Tab = 'chat' | 'duties' | 'people' | 'tips';

export default function MinisterioDetalle() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isStaff } = useAuth();
  const [m, setM] = useState<Ministry | null | undefined>(undefined);
  const [members, setMembers] = useState<MinistryMember[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [msgs, setMsgs] = useState<MinistryMessage[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [tab, setTab] = useState<Tab>('chat');
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [picker, setPicker] = useState<null | 'member' | 'leader'>(null);
  const listRef = useRef<FlatList<MinistryMessage>>(null);

  const load = useCallback(async () => {
    try {
      const [ms, mm, p] = await Promise.all([listMinistries(), ministryMembers(id), listProfiles()]);
      setM(ms.find((x) => x.id === id) ?? null);
      setMembers(mm);
      setPeople(p);
      ministryMessages(id).then(setMsgs).catch(() => setMsgs([]));
      listDuties(id, isoDate(new Date())).then(setDuties).catch(() => setDuties([]));
      listPeople().then(setContacts).catch(() => undefined);
    } catch {
      setM(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Mensajes nuevos en vivo.
  useEffect(() => {
    const ch = supabase
      .channel(`ministry-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ministry_messages', filter: `ministry_id=eq.${id}` }, (payload) => {
        const row = payload.new as MinistryMessage;
        setMsgs((prev) => (prev.some((x) => x.id === row.id) ? prev : [row, ...prev]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  const isLeader = !!m && (isStaff || m.leader_id === profile?.id || members.some((x) => x.profile_id === profile?.id && x.is_leader));
  const isMember = members.some((x) => x.profile_id === profile?.id) || isLeader;
  const nameOf = (uid: string | null) => people.find((p) => p.id === uid)?.display_name ?? 'Alguien';
  const tips = useMemo(() => msgs.filter((x) => x.kind === 'recommendation'), [msgs]);
  const chat = useMemo(() => msgs.filter((x) => x.kind !== 'recommendation'), [msgs]);

  const send = async (kind: MinistryMessage['kind']) => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await sendMinistryMessage(id, body, kind);
      setAnnounce(false);
      ministryMessages(id).then(setMsgs).catch(() => undefined);
    } catch (e) {
      setText(body);
      Alert.alert('No se envió', errorMessage(e));
    }
  };

  const addMember = async (pid: string | null) => {
    setPicker(null);
    if (!pid) return;
    const { error } = await supabase.from('ministry_members').upsert({ ministry_id: id, profile_id: pid });
    if (error) Alert.alert('No se pudo', errorMessage(error));
    load();
  };

  const setLeader = async (pid: string | null) => {
    setPicker(null);
    const { error } = await supabase.from('ministries').update({ leader_id: pid }).eq('id', id);
    if (error) Alert.alert('No se pudo', errorMessage(error));
    if (pid) await supabase.from('ministry_members').upsert({ ministry_id: id, profile_id: pid, is_leader: true });
    load();
  };

  const memberMenu = (mm: MinistryMember) => {
    if (!isLeader) return;
    Alert.alert(nameOf(mm.profile_id), undefined, [
      { text: mm.is_leader ? 'Quitar como colíder' : 'Hacer colíder', onPress: async () => {
        await supabase.from('ministry_members').update({ is_leader: !mm.is_leader }).eq('ministry_id', id).eq('profile_id', mm.profile_id);
        load();
      } },
      { text: 'Sacar del ministerio', style: 'destructive', onPress: async () => {
        await supabase.from('ministry_members').delete().eq('ministry_id', id).eq('profile_id', mm.profile_id);
        load();
      } },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  if (m === undefined) return <Loading />;
  if (!m) return <View style={{ flex: 1 }}><Header title="Ministerio" back /><Text style={{ padding: 24, color: colors.text }}>No se encontró.</Text></View>;

  const dutiesByDate = duties.reduce<Record<string, Duty[]>>((acc, d) => ({ ...acc, [d.on_date]: [...(acc[d.on_date] ?? []), d] }), {});

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <Header title={m.name} subtitle={`${members.length} integrantes · líder: ${m.leader_id ? nameOf(m.leader_id) : 'sin asignar'}`} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Segmented options={[{ value: 'chat', label: 'Chat' }, { value: 'duties', label: 'Turnos' }, { value: 'tips', label: 'Consejos' }, { value: 'people', label: 'Gente' }]} value={tab} onChange={setTab} />
      </View>

      {tab === 'chat' ? (
        isMember ? (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={listRef}
              data={chat}
              inverted
              keyExtractor={(x) => x.id}
              contentContainerStyle={{ padding: 12, gap: 8 }}
              ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }] }}><Empty icon="message-circle" title="Todavía no hay mensajes" text="Escribí el primero. Todos los del ministerio lo ven." /></View>}
              renderItem={({ item }) => {
                const mine = item.user_id === profile?.id;
                if (item.kind === 'announcement') {
                  return (
                    <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.amberSoft, borderWidth: 1, borderColor: '#F3D2A8', gap: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.amberText }}>ANUNCIO · {nameOf(item.user_id)} · {fmtRelativeDay(item.created_at)} {fmtTime(item.created_at)}</Text>
                      <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>{item.body}</Text>
                    </View>
                  );
                }
                return (
                  <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: 10, borderRadius: 14, backgroundColor: mine ? colors.greenSoft : colors.bgSoft, gap: 2 }}>
                    {!mine ? <Text style={{ fontSize: 11, fontWeight: '800', color: colors.green }}>{nameOf(item.user_id)}</Text> : null}
                    <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>{item.body}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted, alignSelf: 'flex-end' }}>{fmtRelativeDay(item.created_at)} {fmtTime(item.created_at)}</Text>
                  </View>
                );
              }}
            />
            <View style={{ padding: 10, paddingBottom: 24, gap: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              {isLeader ? (
                <Pressable onPress={() => setAnnounce(!announce)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name={announce ? 'check-square' : 'square'} size={18} color={colors.amberText} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.amberText }}>Mandar como anuncio (les llega aviso al teléfono a todos)</Text>
                </Pressable>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <TextInput value={text} onChangeText={setText} placeholder="Escribí un mensaje" placeholderTextColor="#8B918C" multiline
                  style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1.5, borderColor: colors.input, borderRadius: 14, paddingHorizontal: 12, paddingTop: 11, fontSize: 15 }} />
                <Pressable onPress={() => send(announce ? 'announcement' : 'message')} accessibilityLabel="Enviar" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: announce ? colors.amber : colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="send" size={20} color="#FFF" />
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <Empty icon="lock" title="El chat es para los integrantes" text="Pedile al líder que te agregue al ministerio." />
        )
      ) : null}

      {tab === 'duties' ? (
        <Screen>
          {isLeader ? <Button title="Agregar turno" icon="plus" onPress={() => router.push({ pathname: '/ministerio/turno', params: { ministry: id } })} /> : null}
          {Object.keys(dutiesByDate).length ? Object.entries(dutiesByDate).map(([d, list]) => (
            <Card key={d} style={{ padding: 0 }}>
              <Text style={{ padding: 12, paddingBottom: 4, fontSize: 13, fontWeight: '800', color: colors.muted }}>{fmtDateShort(d).toUpperCase()}</Text>
              {list.map((x) => {
                const who = x.profile_id ? nameOf(x.profile_id) : contacts.find((c) => c.id === x.contact_id)?.name ?? 'Alguien';
                return (
                  <RowLink
                    key={x.id}
                    icon={x.profile_id === profile?.id ? 'star' : 'user'}
                    title={`${who} · ${x.task}`}
                    subtitle={[x.arrive_time ? `Llegar ${x.arrive_time}` : null, x.note].filter(Boolean).join(' · ') || undefined}
                    onPress={isLeader ? () => router.push({ pathname: '/ministerio/turno', params: { ministry: id, duty: x.id } }) : undefined}
                  />
                );
              })}
            </Card>
          )) : <Empty icon="calendar" title="No hay turnos cargados" text={isLeader ? 'Cargá los turnos de las próximas semanas. Cada lunes a la mañana les llega el aviso.' : 'El líder los carga con anticipación.'} />}
        </Screen>
      ) : null}

      {tab === 'tips' ? (
        <Screen>
          {m.description ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{m.description}</Text> : null}
          {tips.map((t) => (
            <Card key={t.id} style={{ gap: 6, borderColor: colors.green }}>
              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{t.body}</Text>
              {isLeader ? <Text onPress={() => supabase.from('ministry_messages').delete().eq('id', t.id).then(load)} style={{ fontSize: 12, color: colors.red, fontWeight: '700' }}>Borrar</Text> : null}
            </Card>
          ))}
          {!tips.length ? <Empty icon="info" title="Sin recomendaciones todavía" /> : null}
          {isLeader ? (
            <Card style={{ gap: 8 }}>
              <TextInput value={text} onChangeText={setText} placeholder="Nueva recomendación (ej: llegar una hora antes, orar juntos antes de abrir)" multiline placeholderTextColor="#8B918C"
                style={{ minHeight: 80, borderWidth: 1.5, borderColor: colors.input, borderRadius: 12, padding: 10, fontSize: 15, textAlignVertical: 'top' }} />
              <Button title="Guardar recomendación" small onPress={() => send('recommendation')} />
            </Card>
          ) : null}
        </Screen>
      ) : null}

      {tab === 'people' ? (
        <Screen>
          {members.map((mm) => {
            const c = contacts.find((x) => x.profile_id === mm.profile_id);
            return (
              <Pressable key={mm.profile_id} onPress={() => memberMenu(mm)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Face name={nameOf(mm.profile_id)} path={c?.photo_path} size={44} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{nameOf(mm.profile_id)}</Text>
                {mm.is_leader || m.leader_id === mm.profile_id ? <Tag text="Líder" tone="green" /> : null}
              </Pressable>
            );
          })}
          {!members.length ? <Empty icon="users" title="Sin integrantes todavía" /> : null}
          {isLeader ? <Button title="Agregar integrante" icon="user-plus" variant="outline" onPress={() => setPicker('member')} /> : null}
          {isStaff ? <Button title="Cambiar líder" icon="award" variant="ghost" onPress={() => setPicker('leader')} /> : null}
        </Screen>
      ) : null}

      <PickerModal visible={picker === 'member'} title="Agregar al ministerio"
        items={people.filter((p) => !members.some((x) => x.profile_id === p.id)).map((p) => ({ id: p.id, title: p.display_name, photo: contacts.find((c) => c.profile_id === p.id)?.photo_path }))}
        onClose={() => setPicker(null)} onPick={addMember} />
      <PickerModal visible={picker === 'leader'} title="Líder del ministerio" allowNone
        items={people.map((p) => ({ id: p.id, title: p.display_name, photo: contacts.find((c) => c.profile_id === p.id)?.photo_path }))}
        onClose={() => setPicker(null)} onPick={setLeader} />
    </KeyboardAvoidingView>
  );
}
