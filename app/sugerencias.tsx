// Sugerencias para la iglesia: cualquiera escribe una idea; el pastor y la secretaría las leen y responden.
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, Segmented, Tag, Toggle } from '@/components/ui';
import { addSuggestion, answerSuggestion, suggestionsList } from '@/lib/api';
import { fmtRelativeDay } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { SuggestionRow } from '@/types';

const STATUS: Record<SuggestionRow['status'], { label: string; tone: 'blue' | 'amber' | 'green' }> = {
  new: { label: 'Nueva', tone: 'blue' }, seen: { label: 'Leída', tone: 'amber' }, done: { label: 'Hecha', tone: 'green' },
};

export default function Sugerencias() {
  const { isStaff } = useAuth();
  const [rows, setRows] = useState<SuggestionRow[] | null>(null);
  const [body, setBody] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const load = useCallback(() => {
    suggestionsList().then(setRows).catch(() => setRows([]));
  }, []);
  useFocusEffect(load);

  const send = async () => {
    setBusy(true);
    try {
      await addSuggestion(body.trim(), anon);
      setBody('');
      setAnon(false);
      load();
      Alert.alert('¡Gracias!', 'Tu sugerencia le llegó al pastor.');
    } catch (e) {
      Alert.alert('No se pudo enviar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Sugerencias" subtitle="Ideas y opiniones para la iglesia" back />
      <Screen>
        <Card style={{ gap: 10 }}>
          <Field label="Tu sugerencia" value={body} onChangeText={setBody} multiline placeholder="Me gustaría que…" />
          <Toggle label="Enviar sin mi nombre" value={anon} onChange={setAnon} />
          <Button title="Enviar al pastor" icon="send" onPress={send} loading={busy} disabled={body.trim().length < 2} />
        </Card>
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="message-square" title={isStaff ? 'No hay sugerencias todavía' : 'Todavía no mandaste sugerencias'} /> : null}
        {(rows ?? []).map((r) => (
          <Card key={r.id} style={{ gap: 8, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>
                {r.mine ? 'Vos' : r.author ?? 'Anónimo'} · <Text style={{ fontWeight: '500', color: colors.muted }}>{fmtRelativeDay(r.created_at)}</Text>
              </Text>
              <Tag text={STATUS[r.status].label} tone={STATUS[r.status].tone} />
            </View>
            <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>{r.body}</Text>
            {r.reply ? <Text style={{ fontSize: 13, color: colors.greenText }}>Respuesta: {r.reply}</Text> : null}
            {isStaff ? (
              replyFor === r.id ? (
                <View style={{ gap: 8 }}>
                  <Field label="Respuesta" value={reply} onChangeText={setReply} multiline />
                  <Button title="Guardar" small onPress={() => answerSuggestion(r.id, r.status === 'new' ? 'seen' : r.status, reply.trim() || null).then(() => { setReplyFor(null); load(); })} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Segmented style={{ flex: 1 }} options={[{ value: 'new', label: 'Nueva' }, { value: 'seen', label: 'Leída' }, { value: 'done', label: 'Hecha' }]} value={r.status} onChange={(v) => answerSuggestion(r.id, v, r.reply).then(load)} />
                  <Button title="Responder" small variant="outline" onPress={() => { setReplyFor(r.id); setReply(r.reply ?? ''); }} />
                </View>
              )
            ) : null}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
