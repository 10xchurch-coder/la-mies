// Un ministerio: chat del grupo (el líder puede mandar anuncios a todos), turnos, integrantes y recomendaciones.
// Los integrantes se eligen por ficha: no hace falta que usen la app (los que la usan, además, tienen el chat y los avisos).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Empty, Loading, RowLink, Segmented, Tag } from '@/components/ui';
import {
  addMinistryPerson, listDuties, listMinistries, listPeople, listProfiles, ministryMembers, ministryMessages, ministryPeople, removeMinistryPerson,
  sendMinistryMessage, setMinistryPersonLeader,
} from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtDateShort, fmtRelativeDay, fmtTime, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Contact, Duty, Ministry, MinistryMember, MinistryMessage, MinistryPerson, Profile } from '@/types';

import { moderate } from '@/lib/moderation';
import { showActions } from '@/components/ActionSheet';
import { ReactionChips } from '@/components/ReactionChips';
import { REACTIONS, myReaction, useReactions } from '@/lib/reactions';
import { tx } from '@/lib/i18n';

type Tab = 'chat' | 'duties' | 'people' | 'tips';

export default function MinisterioDetalle() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isStaff } = useAuth();
  const [m, setM] = useState<Ministry | null | undefined>(undefined);
  const [members, setMembers] = useState<MinistryMember[]>([]);
  const [crew, setCrew] = useState<MinistryPerson[]>([]);
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
      const [ms, mm, p, cr] = await Promise.all([listMinistries(), ministryMembers(id), listProfiles(), ministryPeople(id)]);
      setM(ms.find((x) => x.id === id) ?? null);
      setMembers(mm);
      setPeople(p);
      setCrew(cr);
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
  const nameOf = (uid: string | null) => people.find((p) => p.id === uid)?.display_name ?? tx('Alguien');
  const tips = useMemo(() => msgs.filter((x) => x.kind === 'recommendation'), [msgs]);
  const chat = useMemo(() => msgs.filter((x) => x.kind !== 'recommendation'), [msgs]);
  // Reacciones: mantené apretado un mensaje y elegí una carita.
  const chatIds = useMemo(() => chat.map((x) => x.id), [chat]);
  const reactErr = useCallback((e: unknown) => Alert.alert(tx('No se pudo reaccionar'), errorMessage(e)), []);
  const rx = useReactions('ministry', chatIds, profile?.display_name ?? tx('Vos'), reactErr);
  const onLong = (item: MinistryMessage, mine: boolean) => showActions(tx('Mensaje'), undefined, [
    ...(mine ? [] : [{ text: tx('Denunciar o bloquear'), icon: 'flag' as const, onPress: () => moderate({ kind: 'ministry_message', targetId: item.id, authorId: item.user_id, authorName: nameOf(item.user_id), excerpt: item.body, onChange: load }) }]),
    { text: tx('Cancelar'), icon: 'x' as const },
  ], { options: REACTIONS, current: myReaction(rx.map[item.id]), onPick: (e) => { rx.toggle(item.id, e); } });

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
      Alert.alert(tx('No se envió'), errorMessage(e));
    }
  };

  const addMember = async (contactId: string | null) => {
    setPicker(null);
    if (!contactId) return;
    try {
      await addMinistryPerson(id, contactId);
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    }
    load();
  };

  const setLeader = async (pid: string | null) => {
    setPicker(null);
    const { error } = await supabase.from('ministries').update({ leader_id: pid }).eq('id', id);
    if (error) Alert.alert(tx('No se pudo'), errorMessage(error));
    // El líder queda en la lista del ministerio (por su ficha).
    const card = pid ? contacts.find((c) => c.profile_id === pid) : null;
    if (card) await addMinistryPerson(id, card.id).then(() => setMinistryPersonLeader(id, card.id, true)).catch(() => undefined);
    else if (pid) await supabase.from('ministry_members').upsert({ ministry_id: id, profile_id: pid, is_leader: true });
    load();
  };

  const memberMenu = (p: MinistryPerson) => {
    const isMainLeader = !!p.profile_id && m?.leader_id === p.profile_id;
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: tx('Ver su ficha'), onPress: () => router.push({ pathname: '/contacto/[id]', params: { id: p.contact_id } }) },
    ];
    if (isLeader && p.profile_id && !isMainLeader) {
      options.push({ text: p.is_leader ? tx('Quitar como colíder') : tx('Hacer colíder'), onPress: () => {
        setMinistryPersonLeader(id, p.contact_id, !p.is_leader).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
      } });
    }
    if (isLeader && !isMainLeader) {
      options.push({ text: tx('Sacar del ministerio'), style: 'destructive', onPress: () => {
        removeMinistryPerson(id, p.contact_id).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
      } });
    }
    options.push({ text: tx('Cancelar'), style: 'cancel' });
    Alert.alert(p.name, p.profile_id ? undefined : tx('No usa la app: no ve el chat ni recibe avisos. Los turnos se los avisás vos.'), options);
  };

  if (m === undefined) return <Loading />;
  if (!m) return <View style={{ flex: 1 }}><Header title={tx('Ministerio')} back /><Text style={{ padding: 24, color: colors.text }}>{tx('No se encontró.')}</Text></View>;

  const dutiesByDate = duties.reduce<Record<string, Duty[]>>((acc, d) => ({ ...acc, [d.on_date]: [...(acc[d.on_date] ?? []), d] }), {});

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <Header title={m.name} subtitle={tx('{n} {pl} · líder: {v1}', { n: crew.length, pl: crew.length === 1 ? tx('integrante') : tx('integrantes'), v1: m.leader_id ? nameOf(m.leader_id) : tx('sin asignar') })} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Segmented options={[{ value: 'chat', label: tx('Chat') }, { value: 'duties', label: tx('Turnos') }, { value: 'tips', label: tx('Consejos') }, { value: 'people', label: tx('Gente') }]} value={tab} onChange={setTab} />
      </View>

      {tab === 'chat' ? (
        isMember ? (
          <View style={{ flex: 1 }}>
            {!chat.length ? (
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Empty icon="message-circle" title={tx('Todavía no hay mensajes')} text={tx('Escribí el primero. Todos los del ministerio con la app lo ven.')} />
              </View>
            ) : (
            <FlatList
              ref={listRef}
              data={chat}
              inverted
              keyExtractor={(x) => x.id}
              extraData={rx.map}
              contentContainerStyle={{ padding: 12, gap: 8 }}
              renderItem={({ item }) => {
                const mine = item.user_id === profile?.id;
                if (item.kind === 'announcement') {
                  return (
                    <View>
                      <Pressable onLongPress={() => onLong(item, mine)} delayLongPress={300} style={{ padding: 12, borderRadius: 12, backgroundColor: colors.amberSoft, borderWidth: 1, borderColor: '#F3D2A8', gap: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.amberText }}>{tx('ANUNCIO ·')} {nameOf(item.user_id)} · {fmtRelativeDay(item.created_at)} {fmtTime(item.created_at)}</Text>
                        <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>{item.body}</Text>
                      </Pressable>
                      <View style={{ marginTop: 4 }}><ReactionChips list={rx.map[item.id]} mine={false} onToggle={(e) => { rx.toggle(item.id, e); }} /></View>
                    </View>
                  );
                }
                return (
                  <View>
                  <Pressable onLongPress={() => onLong(item, mine)} delayLongPress={300} accessibilityHint={tx('Mantené apretado para reaccionar')}
                    style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: 10, borderRadius: 14, backgroundColor: mine ? colors.greenSoft : colors.bgSoft, gap: 2 }}>
                    {!mine ? <Text style={{ fontSize: 11, fontWeight: '800', color: colors.green }}>{nameOf(item.user_id)}</Text> : null}
                    <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>{item.body}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted, alignSelf: 'flex-end' }}>{fmtRelativeDay(item.created_at)} {fmtTime(item.created_at)}</Text>
                    {!mine ? <Text onPress={() => moderate({ kind: 'ministry_message', targetId: item.id, authorId: item.user_id, authorName: nameOf(item.user_id), excerpt: item.body, onChange: load })} style={{ fontSize: 10, color: colors.muted }}>{tx('Denunciar o bloquear')}</Text> : null}
                  </Pressable>
                  <View style={{ marginTop: 4 }}><ReactionChips list={rx.map[item.id]} mine={mine} onToggle={(e) => { rx.toggle(item.id, e); }} /></View>
                  </View>
                );
              }}
            />
            )}
            <View style={{ padding: 10, paddingBottom: 24, gap: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              {isLeader ? (
                <Pressable onPress={() => setAnnounce(!announce)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name={announce ? 'check-square' : 'square'} size={18} color={colors.amberText} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.amberText }}>{tx('Mandar como anuncio (les llega aviso al teléfono a todos)')}</Text>
                </Pressable>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <TextInput value={text} onChangeText={setText} placeholder={tx('Escribí un mensaje')} placeholderTextColor="#8B918C" multiline
                  style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1.5, borderColor: colors.input, borderRadius: 14, paddingHorizontal: 12, paddingTop: 11, fontSize: 15, color: colors.text }} />
                <Pressable onPress={() => send(announce ? 'announcement' : 'message')} accessibilityLabel={tx('Enviar')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: announce ? colors.amber : colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="send" size={20} color="#FFF" />
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <Empty icon="lock" title={tx('El chat es para los integrantes')} text={tx('Pedile al líder que te agregue al ministerio.')} />
        )
      ) : null}

      {tab === 'duties' ? (
        <Screen>
          {isLeader ? <Button title={tx('Agregar turno')} icon="plus" onPress={() => router.push({ pathname: '/ministerio/turno', params: { ministry: id } })} /> : null}
          {Object.keys(dutiesByDate).length ? Object.entries(dutiesByDate).map(([d, list]) => (
            <Card key={d} style={{ padding: 0 }}>
              <Text style={{ padding: 12, paddingBottom: 4, fontSize: 13, fontWeight: '800', color: colors.muted }}>{fmtDateShort(d).toUpperCase()}</Text>
              {list.map((x) => {
                const who = contacts.find((c) => c.id === x.contact_id)?.name ?? (x.profile_id ? nameOf(x.profile_id) : tx('Alguien'));
                return (
                  <RowLink
                    key={x.id}
                    icon={x.profile_id === profile?.id ? 'star' : 'user'}
                    title={`${who} · ${x.task}`}
                    subtitle={[x.arrive_time ? tx('Llegar {arrive_time}', { arrive_time: x.arrive_time }) : null, x.note].filter(Boolean).join(' · ') || undefined}
                    onPress={isLeader ? () => router.push({ pathname: '/ministerio/turno', params: { ministry: id, duty: x.id } }) : undefined}
                  />
                );
              })}
            </Card>
          )) : <Empty icon="calendar" title={tx('No hay turnos cargados')} text={isLeader ? tx('Cargá los turnos de las próximas semanas. Cada lunes a la mañana les llega el aviso.') : tx('El líder los carga con anticipación.')} />}
        </Screen>
      ) : null}

      {tab === 'tips' ? (
        <Screen>
          {m.description ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{m.description}</Text> : null}
          {tips.map((t) => (
            <Card key={t.id} style={{ gap: 6, borderColor: colors.green }}>
              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{t.body}</Text>
              {isLeader ? <Text onPress={() => supabase.from('ministry_messages').delete().eq('id', t.id).then(load)} style={{ fontSize: 12, color: colors.red, fontWeight: '700' }}>{tx('Borrar')}</Text> : null}
            </Card>
          ))}
          {!tips.length ? <Empty icon="info" title={tx('Sin recomendaciones todavía')} /> : null}
          {isLeader ? (
            <Card style={{ gap: 8 }}>
              <TextInput value={text} onChangeText={setText} placeholder={tx('Nueva recomendación (ej: llegar una hora antes, orar juntos antes de abrir)')} multiline placeholderTextColor="#8B918C"
                style={{ minHeight: 80, borderWidth: 1.5, borderColor: colors.input, borderRadius: 12, padding: 10, fontSize: 15, textAlignVertical: 'top', color: colors.text }} />
              <Button title={tx('Guardar recomendación')} small onPress={() => send('recommendation')} />
            </Card>
          ) : null}
        </Screen>
      ) : null}

      {tab === 'people' ? (
        <Screen>
          {crew.map((p) => (
            <Pressable key={p.contact_id} onPress={() => memberMenu(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="button">
              <Face name={p.name} path={p.photo_path} size={44} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{p.name}</Text>
              {p.is_leader ? <Tag text={tx('Líder')} tone="green" /> : null}
              {!p.profile_id ? <Tag text={tx('Sin la app')} tone="gray" /> : null}
            </Pressable>
          ))}
          {!crew.length ? <Empty icon="users" title={tx('Sin integrantes todavía')} /> : null}
          {isLeader ? <Button title={tx('Agregar integrante')} icon="user-plus" variant="outline" onPress={() => setPicker('member')} /> : null}
          {isLeader ? (
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              {tx('Podés agregar a cualquier persona de la iglesia, aunque no use la app. Los que usan la app además ven el chat y reciben el aviso de sus turnos.')}
            </Text>
          ) : null}
          {isStaff ? <Button title={tx('Cambiar líder')} icon="award" variant="ghost" onPress={() => setPicker('leader')} /> : null}
        </Screen>
      ) : null}

      <PickerModal visible={picker === 'member'} title={tx('Agregar al ministerio')}
        items={contacts
          .filter((c) => c.status !== 'contact' && !crew.some((x) => x.contact_id === c.id))
          .sort((a, b) => Number(b.status === 'member') - Number(a.status === 'member') || a.name.localeCompare(b.name))
          .map((c) => ({ id: c.id, title: c.name, subtitle: `${c.status === 'member' ? tx('Miembro') : tx('Visita')}${c.profile_id ? '' : tx(' · sin la app')}`, photo: c.photo_path }))}
        onClose={() => setPicker(null)} onPick={addMember} />
      <PickerModal visible={picker === 'leader'} title={tx('Líder del ministerio')} allowNone
        items={people.map((p) => ({ id: p.id, title: p.display_name, photo: contacts.find((c) => c.profile_id === p.id)?.photo_path }))}
        onClose={() => setPicker(null)} onPick={setLeader} />
    </KeyboardAvoidingView>
  );
}
