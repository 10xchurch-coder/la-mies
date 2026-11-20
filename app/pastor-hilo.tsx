// Conversación privada entre un miembro y el pastor. El miembro ve solo la suya; el pastor, la de quien elija.
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading } from '@/components/ui';
import { pastorThread, readPastorThread, sendPastorMessage } from '@/lib/api';
import { fmtRelativeDay, fmtTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { PastorMessage } from '@/types';

export default function PastorHilo() {
  const { profile } = useAuth();
  const { member, name } = useLocalSearchParams<{ member?: string; name?: string }>();
  const isPastor = profile?.role === 'admin';
  const target = isPastor ? member ?? null : null;
  const [rows, setRows] = useState<PastorMessage[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    if (isPastor && !target) { setRows([]); return; }
    pastorThread(target).then((r) => {
      setRows(r);
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
      Alert.alert('No se pudo enviar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const title = isPastor ? name || 'Mensajes' : 'Escribile al pastor';
  let lastDay = '';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={title} subtitle={isPastor ? 'Conversación privada' : 'Solo el pastor lee esto'} back />
      <Screen>
        {!isPastor ? (
          <Card style={{ backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
            <Text style={{ fontSize: 13, color: colors.greenText, lineHeight: 19 }}>
              Lo que escribas acá le llega solo al pastor. No lo ve nadie más: ni la secretaría ni los demás hermanos.
            </Text>
          </Card>
        ) : null}
        {rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="message-circle" title={isPastor && !target ? 'Elegí una conversación' : 'Todavía no hay mensajes'} text={isPastor ? undefined : 'Escribí lo que quieras contarle o preguntarle al pastor.'} />
        ) : null}
        {(rows ?? []).map((m) => {
          const day = fmtRelativeDay(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <View key={m.id} style={{ gap: 6 }}>
              {showDay ? <Text style={{ textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 6 }}>{day}</Text> : null}
              <View style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                <View style={{ maxWidth: '86%', padding: 10, borderRadius: 14, backgroundColor: m.mine ? colors.green : colors.graySoft }}>
                  <Text selectable style={{ fontSize: 15, lineHeight: 21, color: m.mine ? '#fff' : colors.text }}>{m.body}</Text>
                  <Text style={{ fontSize: 11, marginTop: 4, textAlign: 'right', color: m.mine ? '#DDF1E4' : colors.muted }}>{fmtTime(m.created_at)}</Text>
                </View>
              </View>
            </View>
          );
        })}
        {!isPastor || target ? (
          <Card style={{ gap: 10 }}>
            <Field label={isPastor ? 'Tu respuesta' : 'Tu mensaje'} value={body} onChangeText={setBody} multiline maxLength={2000} placeholder="Escribí acá…" />
            <Button title="Enviar" icon="send" onPress={send} loading={busy} disabled={!body.trim()} />
          </Card>
        ) : null}
      </Screen>
    </View>
  );
}
