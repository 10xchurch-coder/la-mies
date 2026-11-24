// Conversación privada entre un miembro y el pastor. El miembro ve solo la suya; el pastor, la de quien elija.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading } from '@/components/ui';
import { showActions } from '@/components/ActionSheet';
import { ReactionChips } from '@/components/ReactionChips';
import { REACTIONS, myReaction, useReactions } from '@/lib/reactions';
import { pastorThread, readPastorThread, sendPastorMessage } from '@/lib/api';
import { fmtRelativeDay, fmtTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { PastorMessage } from '@/types';
import { tx } from '@/lib/i18n';

export default function PastorHilo() {
  const { profile } = useAuth();
  const { member, name } = useLocalSearchParams<{ member?: string; name?: string }>();
  const isPastor = profile?.role === 'admin';
  const target = isPastor ? member ?? null : null;
  const [rows, setRows] = useState<PastorMessage[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ids = useMemo(() => (rows ?? []).map((m) => m.id).reverse(), [rows]);
  const reactErr = useCallback((e: unknown) => Alert.alert(tx('No se pudo reaccionar'), errorMessage(e)), []);
  const rx = useReactions('pastor', ids, profile?.display_name ?? tx('Vos'), reactErr);
  const rxReload = useRef(rx.reload);
  rxReload.current = rx.reload;
  const onLong = (m: PastorMessage) => showActions(tx('Mensaje'), undefined, [
    { text: tx('Copiar'), icon: 'copy', onPress: () => { Clipboard.setStringAsync(m.body).catch(() => undefined); } },
    { text: tx('Cancelar'), icon: 'x' },
  ], { options: REACTIONS, current: myReaction(rx.map[m.id]), onPick: (e) => { rx.toggle(m.id, e); } });

  const load = useCallback(() => {
    if (isPastor && !target) { setRows([]); return; }
    pastorThread(target).then((r) => {
      setRows(r);
      rxReload.current();
      if (r.some((m) => !m.mine && !m.read_at)) readPastorThread(target).catch(() => undefined);
    }).catch(() => setRows((old) => old ?? []));
  }, [isPastor, target]);

  // Se abre al entrar y se actualiza solo cada 20 segundos mientras está a la vista.
  useFocusEffect(useCallback(() => {
    load();
    timer.current = setInterval(load, 20000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]));

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await sendPastorMessage(text, target);
      setBody('');
      load();
    } catch (e) {
      Alert.alert(tx('No se pudo enviar'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const title = isPastor ? name || tx('Mensajes') : tx('Escribile al pastor');
  let lastDay = '';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={title} subtitle={isPastor ? tx('Conversación privada') : tx('Solo el pastor lee esto')} back />
      <Screen>
        {!isPastor ? (
          <Card style={{ backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
            <Text style={{ fontSize: 13, color: colors.greenText, lineHeight: 19 }}>
              {tx('Lo que escribas acá le llega solo al pastor. No lo ve nadie más: ni la secretaría ni los demás hermanos.')}
            </Text>
          </Card>
        ) : null}
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="message-circle" title={isPastor && !target ? tx('Elegí una conversación') : tx('Todavía no hay mensajes')} text={isPastor ? undefined : tx('Escribí lo que quieras contarle o preguntarle al pastor.')} />
        ) : null}
        {(rows ?? []).map((m) => {
          const day = fmtRelativeDay(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <View key={m.id} style={{ gap: 6 }}>
              {showDay ? <Text style={{ textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 6 }}>{day}</Text> : null}
              <View style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                <Pressable onLongPress={() => onLong(m)} delayLongPress={300} accessibilityHint={tx('Mantené apretado para reaccionar')}
                  style={{ maxWidth: '86%', padding: 10, borderRadius: 14, backgroundColor: m.mine ? colors.green : colors.graySoft }}>
                  <Text style={{ fontSize: 15, lineHeight: 21, color: m.mine ? '#fff' : colors.text }}>{m.body}</Text>
                  <Text style={{ fontSize: 11, marginTop: 4, textAlign: 'right', color: m.mine ? '#DDF1E4' : colors.muted }}>{fmtTime(m.created_at)}</Text>
                </Pressable>
                <View style={{ marginTop: 4 }}><ReactionChips list={rx.map[m.id]} mine={m.mine} onToggle={(e) => { rx.toggle(m.id, e); }} /></View>
              </View>
            </View>
          );
        })}
        {!isPastor || target ? (
          <Card style={{ gap: 10 }}>
            <Field label={isPastor ? tx('Tu respuesta') : tx('Tu mensaje')} value={body} onChangeText={setBody} multiline maxLength={2000} placeholder={tx('Escribí acá…')} />
            <Button title={tx('Enviar')} icon="send" onPress={send} loading={busy} disabled={!body.trim()} />
          </Card>
        ) : null}
      </Screen>
    </View>
  );
}
