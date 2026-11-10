// Pedidos de oración. Al pedir, se elige quién lo ve: toda la iglesia, solo el pastor, o personas elegidas.
// "Oré" para que la persona sepa que están orando por ella.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading, Tag, Toggle } from '@/components/ui';
import { addPrayer, deletePrayer, listProfiles, markPrayerAnswered, prayerList, setPrayed } from '@/lib/api';
import { fmtRelativeDay } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { PrayerRow, Profile } from '@/types';
import { moderate } from '@/lib/moderation';

const VIS_LABEL = { church: 'Toda la iglesia', pastor: 'Solo el pastor', people: 'Personas elegidas' } as const;

export default function Oracion() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<PrayerRow[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [vis, setVis] = useState<PrayerRow['visibility']>('church');
  const [chosen, setChosen] = useState<string[]>([]);
  const [anon, setAnon] = useState(false);
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
      Alert.alert('Elegí a quién', 'Tocá los nombres de las personas que van a ver el pedido.');
      return;
    }
    setBusy(true);
    try {
      await addPrayer(body.trim(), vis, vis === 'people' ? chosen : [], anon);
      setBody(''); setChosen([]); setAnon(false); setVis('church'); setWriting(false);
      load();
    } catch (e) {
      Alert.alert('No se pudo enviar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const prayed = async (r: PrayerRow) => {
    try {
      await setPrayed(r.id, !r.i_prayed);
      load();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Oración" subtitle="Orad unos por otros (Santiago 5:16)" back />
      <Screen>
        {writing ? (
          <Card style={{ gap: 10 }}>
            <Field label="Tu pedido" value={body} onChangeText={setBody} multiline autoFocus placeholder="Por la salud de mi mamá…" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>¿Quién lo ve?</Text>
            <Choice options={(Object.keys(VIS_LABEL) as PrayerRow['visibility'][]).map((v) => ({ value: v, label: VIS_LABEL[v] }))} value={vis} onChange={setVis} />
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
            {vis !== 'pastor' ? <Toggle label="Sin mi nombre" hint="Los demás no ven quién lo pidió" value={anon} onChange={setAnon} /> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Cancelar" variant="ghost" onPress={() => setWriting(false)} style={{ flex: 1 }} />
              <Button title="Enviar" onPress={send} loading={busy} disabled={body.trim().length < 2} style={{ flex: 2 }} />
            </View>
          </Card>
        ) : (
          <Button title="Pedir oración" icon="plus" onPress={() => setWriting(true)} />
        )}
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="heart" title="No hay pedidos" text="Cuando alguien pida oración, aparece acá." /> : null}
        {(rows ?? []).map((r) => (
          <Card key={r.id} style={{ gap: 8, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.text }}>{r.author ?? 'Un hermano'} · <Text style={{ fontWeight: '500', color: colors.muted }}>{fmtRelativeDay(r.created_at)}</Text></Text>
              {r.visibility !== 'church' ? <Tag text={VIS_LABEL[r.visibility]} tone="gray" /> : null}
              {r.answered_at ? <Tag text="¡Respondida!" tone="green" /> : null}
            </View>
            <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>{r.body}</Text>
            {r.answer_note ? <Text style={{ fontSize: 13, color: colors.greenText }}>{r.answer_note}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => prayed(r)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: r.i_prayed ? colors.green : colors.greenSoft }}>
                <Feather name="heart" size={15} color={r.i_prayed ? '#FFF' : colors.greenText} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: r.i_prayed ? '#FFF' : colors.greenText }}>{r.i_prayed ? 'Oré' : 'Orar'}{r.prayed ? ` · ${r.prayed}` : ''}</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              {r.mine && !r.answered_at ? (
                <Pressable onPress={() => markPrayerAnswered(r.id, null).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e)))} style={{ padding: 6 }} accessibilityRole="button">
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>Dios respondió</Text>
                </Pressable>
              ) : null}
              {!r.mine ? (
                <Pressable onPress={() => moderate({ kind: 'prayer', targetId: r.id, authorId: r.user_id ?? null, authorName: r.author, excerpt: r.body, onChange: load })} style={{ padding: 6 }} accessibilityLabel="Denunciar o bloquear">
                  <Feather name="more-horizontal" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
              {r.mine ? (
                <Pressable onPress={() => Alert.alert('Borrar pedido', '', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => deletePrayer(r.id).then(load) }])} style={{ padding: 6 }} accessibilityLabel="Borrar">
                  <Feather name="trash-2" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          </Card>
        ))}
      </Screen>
    </View>
  );
}
