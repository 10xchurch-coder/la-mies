// Anuncios: un mensaje a toda la iglesia, a los líderes, a los maestros, a un ministerio o a un grupo.
// Le llega como aviso al teléfono a cada uno. Lo mandan el pastor, la secretaría y los capitanes.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading } from '@/components/ui';
import { deleteAnnouncement, listAnnouncements, listGroups, listMinistries, sendAnnouncement } from '@/lib/api';
import { fmtRelativeDay, fmtTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Announcement, Group, Ministry } from '@/types';

const AUD_LABEL: Record<Announcement['audience'], string> = {
  all: 'Toda la iglesia', staff: 'Pastor y secretaría', leaders: 'Líderes y capitanes', teachers: 'Maestros', ministry: 'Un ministerio', group: 'Un grupo / ruta',
};

export default function Anuncios() {
  const { isLeader, isStaff, session } = useAuth();
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [aud, setAud] = useState<Announcement['audience']>('all');
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listAnnouncements().then(setRows).catch(() => setRows([]));
  }, []);
  useFocusEffect(load);
  useEffect(() => {
    listMinistries().then(setMinistries).catch(() => undefined);
    listGroups().then(setGroups).catch(() => undefined);
  }, []);

  const send = async () => {
    if (!title.trim() || !body.trim()) return;
    if ((aud === 'ministry' || aud === 'group') && !target) {
      Alert.alert('Elegí a quién', aud === 'ministry' ? 'Elegí el ministerio.' : 'Elegí el grupo.');
      return;
    }
    setBusy(true);
    try {
      await sendAnnouncement({ title: title.trim(), body: body.trim(), audience: aud, ministry_id: aud === 'ministry' ? target : null, group_id: aud === 'group' ? target : null });
      setTitle(''); setBody(''); setAud('all'); setTarget(''); setWriting(false);
      load();
      Alert.alert('Enviado', 'Les llega como aviso al teléfono.');
    } catch (e) {
      Alert.alert('No se pudo enviar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Anuncios" back />
      <Screen>
        {isLeader ? (
          writing ? (
            <Card style={{ gap: 10 }}>
              <Field label="Título" value={title} onChangeText={setTitle} placeholder="Ensayo especial el viernes" />
              <Field label="Mensaje" value={body} onChangeText={setBody} multiline />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>¿Para quién?</Text>
              <Choice columns={2} options={(Object.keys(AUD_LABEL) as Announcement['audience'][]).map((a) => ({ value: a, label: AUD_LABEL[a] }))} value={aud} onChange={(v) => { setAud(v); setTarget(''); }} />
              {aud === 'ministry' || aud === 'group' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(aud === 'ministry' ? ministries : groups).map((x) => (
                    <Pressable key={x.id} onPress={() => setTarget(x.id)} accessibilityRole="button"
                      style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: target === x.id ? colors.green : colors.input, backgroundColor: target === x.id ? colors.greenSoft : colors.bg, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: target === x.id ? colors.greenText : colors.text }}>{x.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Cancelar" variant="ghost" onPress={() => setWriting(false)} style={{ flex: 1 }} />
                <Button title="Enviar" icon="send" onPress={send} loading={busy} disabled={!title.trim() || !body.trim()} style={{ flex: 2 }} />
              </View>
            </Card>
          ) : (
            <Button title="Nuevo anuncio" icon="plus" onPress={() => setWriting(true)} />
          )
        ) : null}
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="volume-2" title="No hay anuncios" /> : null}
        {(rows ?? []).map((a) => (
          <Card key={a.id} style={{ gap: 6, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="volume-2" size={16} color={colors.green} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{a.title}</Text>
              {isStaff || a.author_id === session?.user.id ? (
                <Pressable onPress={() => Alert.alert('Borrar anuncio', a.title, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => deleteAnnouncement(a.id).then(load) }])} style={{ padding: 4 }} accessibilityLabel="Borrar">
                  <Feather name="trash-2" size={15} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{a.body}</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {fmtRelativeDay(a.created_at)} {fmtTime(a.created_at)} · {AUD_LABEL[a.audience]}{a.audience === 'ministry' ? ` (${ministries.find((m) => m.id === a.ministry_id)?.name ?? ''})` : a.audience === 'group' ? ` (${groups.find((g) => g.id === a.group_id)?.name ?? ''})` : ''}{isLeader ? ` · llegó a ${a.sent_to}` : ''}
            </Text>
          </Card>
        ))}
      </Screen>
    </View>
  );
}
