// Pedidos de oración. Al pedir, se elige quién lo ve: toda la iglesia, solo el pastor, o personas elegidas.
// "Oré" para que la persona sepa que están orando por ella.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading, Tag } from '@/components/ui';
import { addPrayer, deletePrayer, listProfiles, prayerList, setPrayed } from '@/lib/api';
import { markAnswered } from '@/lib/culto';
import { fmtRelativeDay } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { PrayerRow, Profile } from '@/types';
import { moderate, useHidden } from '@/lib/moderation';
import { tx } from '@/lib/i18n';
import { IfOn } from '@/components/IfOn';

const VIS_LABEL = { church: 'Toda la iglesia', pastor: 'Solo el pastor', people: 'Personas elegidas' } as const;

export default function Oracion() {
  const { profile, can } = useAuth();
  const router = useRouter();
  // Marcar "Dios respondió": quien hizo el pedido o quien modera, con un testimonio corto si quiere.
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [testimony, setTestimony] = useState('');
  const [marking, setMarking] = useState(false);
  const [rows, setRows] = useState<PrayerRow[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [vis, setVis] = useState<PrayerRow['visibility']>('church');
  const [chosen, setChosen] = useState<string[]>([]);
  const anon = false; // los pedidos van siempre con el nombre (Apple no permite publicar sin nombre)
  const isHidden = useHidden();
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    prayerList().then(setRows).catch(() => setRows([]));
  }, []);
  useFocusEffect(load);
  useEffect(() => {
    listProfiles().then(setPeople).catch(() => undefined);
  }, []);

  const send = async () => {
    if (body.trim().length < 2) return;
    if (vis === 'people' && !chosen.length) {
      Alert.alert(tx('Elegí a quién'), tx('Tocá los nombres de las personas que van a ver el pedido.'));
      return;
    }
    setBusy(true);
    try {
      await addPrayer(body.trim(), vis, vis === 'people' ? chosen : [], anon);
      setBody(''); setChosen([]); setVis('church'); setWriting(false);
      load();
    } catch (e) {
      Alert.alert(tx('No se pudo enviar'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const answered = async (id: string) => {
    setMarking(true);
    try {
      await markAnswered(id, testimony.trim() || null);
      setAnswerFor(null); setTestimony('');
      load();
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    } finally {
      setMarking(false);
    }
  };

  const prayed = async (r: PrayerRow) => {
    try {
      await setPrayed(r.id, !r.i_prayed);
      load();
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Oración')} subtitle={tx('Orad unos por otros (Santiago 5:16)')} back />
      <Screen>
        {writing ? (
          <Card style={{ gap: 10 }}>
            <Field label={tx('Tu pedido')} value={body} onChangeText={setBody} multiline autoFocus placeholder={tx('Por la salud de mi mamá…')} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{tx('¿Quién lo ve?')}</Text>
            <Choice options={(Object.keys(VIS_LABEL) as PrayerRow['visibility'][]).map((v) => ({ value: v, label: tx(VIS_LABEL[v]) }))} value={vis} onChange={setVis} />
            {vis === 'people' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {people.filter((p) => p.id !== profile?.id).map((p) => {
                  const on = chosen.includes(p.id);
                  return (
                    <Pressable key={p.id} onPress={() => setChosen((c) => (on ? c.filter((x) => x !== p.id) : [...c, p.id]))} accessibilityRole="button"
                      style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.greenSoft : colors.bg, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: on ? '800' : '600', color: on ? colors.greenText : colors.text }}>{p.display_name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={tx('Cancelar')} variant="ghost" onPress={() => setWriting(false)} style={{ flex: 1 }} />
              <Button title={tx('Enviar')} onPress={send} loading={busy} disabled={body.trim().length < 2} style={{ flex: 2 }} />
            </View>
          </Card>
        ) : (
          <Button title={tx('Pedir oración')} icon="plus" onPress={() => setWriting(true)} />
        )}
        <IfOn feature="oracion_respondidas"><Button title={tx('Oraciones respondidas')} icon="sun" variant="outline" small onPress={() => router.push('/oraciones-respondidas' as Href)} /></IfOn>
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="heart" title={tx('No hay pedidos')} text={tx('Cuando alguien pida oración, aparece acá.')} /> : null}
        {(rows ?? []).filter((r) => !isHidden(r.id)).map((r) => (
          <Card key={r.id} style={{ gap: 8, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>{r.author ?? tx('Un hermano')} · <Text style={{ fontWeight: '500', color: colors.muted }}>{fmtRelativeDay(r.created_at)}</Text></Text>
              {r.visibility !== 'church' ? <Tag text={tx(VIS_LABEL[r.visibility])} tone="gray" /> : null}
              {r.answered_at ? <Tag text={tx('¡Respondida!')} tone="green" /> : null}
            </View>
            <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>{r.body}</Text>
            {r.answer_note ? <Text style={{ fontSize: 13, color: colors.greenText }}>{r.answer_note}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => prayed(r)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: r.i_prayed ? colors.green : colors.greenSoft }}>
                <Feather name="heart" size={15} color={r.i_prayed ? '#FFF' : colors.greenText} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: r.i_prayed ? '#FFF' : colors.greenText }}>{r.i_prayed ? tx('Oré') : tx('Orar')}{r.prayed ? ` · ${r.prayed}` : ''}</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              {(r.mine || can('com.moderar')) && !r.answered_at && answerFor !== r.id ? (
                <Pressable onPress={() => { setAnswerFor(r.id); setTestimony(''); }} style={{ padding: 6 }} accessibilityRole="button">
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>{tx('Dios respondió')}</Text>
                </Pressable>
              ) : null}
              {!r.mine ? (
                <Pressable onPress={() => moderate({ kind: 'prayer', targetId: r.id, authorId: r.user_id ?? null, authorName: r.author, excerpt: r.body, onChange: load })} style={{ padding: 6 }} accessibilityLabel={tx('Denunciar o bloquear')}>
                  <Feather name="more-horizontal" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
              {r.mine ? (
                <Pressable onPress={() => Alert.alert(tx('Borrar pedido'), '', [{ text: tx('Cancelar'), style: 'cancel' }, { text: tx('Borrar'), style: 'destructive', onPress: () => deletePrayer(r.id).then(load) }])} style={{ padding: 6 }} accessibilityLabel={tx('Borrar')}>
                  <Feather name="trash-2" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            {answerFor === r.id ? (
              <View style={{ gap: 8 }}>
                <Field label={tx('¿Qué hizo Dios?')} hint={tx('(opcional)')} value={testimony} onChangeText={setTestimony} multiline maxLength={600} placeholder={tx('Contá en pocas palabras cómo respondió…')} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={tx('Cancelar')} variant="ghost" small onPress={() => setAnswerFor(null)} style={{ flex: 1 }} />
                  <Button title={tx('Dios respondió')} icon="check" small onPress={() => answered(r.id)} loading={marking} style={{ flex: 2 }} />
                </View>
              </View>
            ) : null}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
