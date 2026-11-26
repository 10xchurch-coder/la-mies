// Caja de preguntas: cualquiera manda una pregunta de la Biblia, con su nombre o sin él.
// Si va sin nombre, no se guarda quién la hizo. El pastor la lee, la marca respondida y puede escribir una respuesta para toda la iglesia.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, SectionTitle, Tag } from '@/components/ui';
import { answerQuestion, askQuestion, questionsList, removeQuestion, type QuestionRow } from '@/lib/culto';
import { fmtRelativeDay } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Preguntas() {
  const { can } = useAuth();
  const pastor = can('com.moderar');
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [body, setBody] = useState('');
  const anon = false; // las preguntas le llegan al pastor siempre con el nombre
  const [busy, setBusy] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const load = useCallback(() => {
    questionsList().then(setRows).catch(() => setRows([]));
  }, []);
  useFocusEffect(load);

  const send = async () => {
    setBusy(true);
    try {
      await askQuestion(body.trim(), anon);
      setBody('');
      load();
      Alert.alert(tx('¡Gracias!'), anon ? tx('Tu pregunta le llegó al pastor, sin tu nombre. Cuando la responda para todos, la vas a ver acá abajo.') : tx('Tu pregunta le llegó al pastor.'));

    } catch (e) {
      Alert.alert(tx('No se pudo enviar'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async (q: QuestionRow) => {
    setBusy(true);
    try {
      await answerQuestion(q.id, true, reply.trim() || null);
      setReplyFor(null); setReply('');
      load();
    } catch (e) {
      Alert.alert(tx('No se pudo guardar'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (q: QuestionRow) => Alert.alert(tx('Borrar la pregunta'), tx('¿Seguro?'), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Borrar'), style: 'destructive', onPress: () => removeQuestion(q.id).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) },
  ]);

  const all = rows ?? [];
  // Para el pastor: primero las que faltan responder. Para todos: mis preguntas y las respuestas públicas.
  const waiting = all.filter((q) => q.status === 'new' && (pastor || q.mine));
  const answered = all.filter((q) => q.status === 'answered');

  const card = (q: QuestionRow) => (
    <Card key={q.id} style={{ gap: 8, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>
          {q.mine ? tx('Vos') : q.author ?? (pastor && q.anonymous ? tx('Sin nombre') : tx('Un hermano'))} · <Text style={{ fontWeight: '500', color: colors.muted }}>{fmtRelativeDay(q.created_at)}</Text>
        </Text>
        <Tag text={q.status === 'answered' ? tx('Respondida') : tx('Esperando')} tone={q.status === 'answered' ? 'green' : 'amber'} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22 }}>{q.body}</Text>
      {q.answer ? <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>{q.answer}</Text> : q.status === 'answered' ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('El pastor ya la respondió en persona.')}</Text> : null}
      {pastor ? (
        replyFor === q.id ? (
          <View style={{ gap: 8 }}>
            <Field label={tx('Respuesta para toda la iglesia')} hint={tx('(opcional)')} value={reply} onChangeText={setReply} multiline maxLength={3000} placeholder={tx('Una respuesta corta, con el versículo…')} />
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{tx('Si escribís una respuesta, toda la iglesia ve la pregunta y la respuesta, sin el nombre de quien preguntó. Si la dejás vacía, solo queda marcada como respondida.')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={tx('Cancelar')} variant="ghost" small onPress={() => setReplyFor(null)} style={{ flex: 1 }} />
              <Button title={tx('Guardar')} small onPress={() => save(q)} loading={busy} style={{ flex: 2 }} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Button title={q.status === 'answered' ? tx('Cambiar la respuesta') : tx('Responder')} small variant="outline" onPress={() => { setReplyFor(q.id); setReply(q.answer ?? ''); }} style={{ flex: 1 }} />
            {q.status === 'answered' ? <Button title={tx('Volver a “esperando”')} small variant="ghost" onPress={() => answerQuestion(q.id, false, null).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)))} style={{ flex: 1 }} /> : null}
            <Pressable onPress={() => remove(q)} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={tx('Borrar la pregunta')}><Feather name="trash-2" size={17} color={colors.muted} /></Pressable>
          </View>
        )
      ) : q.mine && q.status === 'new' ? (
        <Text onPress={() => remove(q)} style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{tx('Borrar mi pregunta')}</Text>
      ) : null}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Preguntas')} subtitle={tx('Preguntá lo que quieras de la Biblia')} back />
      <Screen>
        <Card style={{ gap: 10 }}>
          <Field label={tx('Tu pregunta')} value={body} onChangeText={setBody} multiline maxLength={1000} placeholder={tx('¿Qué quiere decir…?')} />
          <Button title={tx('Enviar al pastor')} icon="send" onPress={send} loading={busy && !replyFor} disabled={body.trim().length < 5} />
        </Card>
        {rows === null ? <Loading /> : !all.length ? <Empty icon="help-circle" title={tx('Todavía no hay preguntas')} text={tx('Las respuestas del pastor para toda la iglesia aparecen acá.')} /> : null}
        {waiting.length ? <SectionTitle>{pastor ? tx('Para responder') : tx('Mis preguntas')}</SectionTitle> : null}
        {waiting.map(card)}
        {answered.length ? <SectionTitle>{tx('Respuestas')}</SectionTitle> : null}
        {answered.map(card)}
      </Screen>
    </View>
  );
}
