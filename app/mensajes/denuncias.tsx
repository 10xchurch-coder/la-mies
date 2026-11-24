// Para el pastor: los mensajes privados que algún hermano denunció. Se ve solo el mensaje denunciado, no la conversación.
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, Tag } from '@/components/ui';
import { dmReportResolve, dmReports, type DmReport } from '@/lib/dm';
import { fmtRelativeDay } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function Denuncias() {
  const { profile } = useAuth();
  const isPastor = profile?.role === 'admin';
  const [rows, setRows] = useState<DmReport[] | null>(null);
  const load = useCallback(() => { dmReports().then(setRows).catch(() => setRows((old) => old ?? [])); }, []);
  useFocusEffect(load);
  const done = (r: DmReport) => dmReportResolve(r.id).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Mensajes denunciados')} subtitle={tx('De las conversaciones privadas entre hermanos')} back />
      <Screen>
        {!isPastor ? <Empty icon="lock" title={tx('Solo para el pastor')} /> : rows === null ? <Loading /> : !rows.length ? (
          <Empty icon="check-circle" title={tx('No hay denuncias')} text={tx('Si un hermano denuncia un mensaje privado, aparece acá con una copia del mensaje.')} />
        ) : rows.map((r) => (
          <Card key={r.id} style={{ gap: 8, opacity: r.resolved_at ? 0.6 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{tx('{sender} le escribió a {reporter}', { sender: r.sender, reporter: r.reporter })}</Text>
              {r.resolved_at ? <Tag text={tx('Revisado')} tone="green" /> : <Tag text={tx('Nuevo')} tone="red" />}
            </View>
            <Text selectable style={{ fontSize: 15, lineHeight: 21, color: colors.text, backgroundColor: colors.bgSoft, padding: 10, borderRadius: 10 }}>{r.body || tx('(sin texto)')}</Text>
            {r.reason ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('Motivo: {reason}', { reason: r.reason })}</Text> : null}
            <Text style={{ fontSize: 12, color: colors.muted }}>{fmtRelativeDay(r.created_at)}</Text>
            {!r.resolved_at ? <Button title={tx('Ya lo revisé')} icon="check" variant="outline" small onPress={() => done(r)} /> : null}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
