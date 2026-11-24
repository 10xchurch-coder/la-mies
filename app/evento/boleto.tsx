// Mi entrada: el QR que se muestra en la puerta del evento. Se puede guardar con una captura de pantalla.
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading, Tag } from '@/components/ui';
import { eventRegistrations, getEvent } from '@/lib/api';
import { showCode, ticketPayload } from '@/lib/ticket';
import { fmtDateShort, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchEvent, EventRegistration } from '@/types';
import { tx } from '@/lib/i18n';

export default function Boleto() {
  const { id, fecha } = useLocalSearchParams<{ id: string; fecha?: string }>();
  const { session } = useAuth();
  const [ev, setEv] = useState<ChurchEvent | null | undefined>(undefined);
  const [reg, setReg] = useState<EventRegistration | null | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    getEvent(id).then(async (e) => {
      setEv(e);
      if (!e) return;
      const rows = await eventRegistrations(e.id, fecha ?? isoDate(new Date(e.starts_at)));
      setReg(rows.find((r) => r.user_id === session?.user.id) ?? null);
    }).catch(() => { setEv((o) => o ?? null); setReg((o) => o ?? null); });
  }, [id, fecha, session?.user.id]));

  if (ev === undefined || reg === undefined) return <Loading />;
  if (!ev || !reg || !reg.ticket_code) return <Empty icon="tag" title={tx('No encontré tu entrada')} text={tx('Anotate primero desde la página del evento.')} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Mi entrada')} subtitle={ev.title} back />
      <Screen>
        <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
          <View style={{ padding: 14, backgroundColor: '#FFF', borderRadius: 16 }}>
            <QRCode value={ticketPayload(reg.ticket_code)} size={220} backgroundColor="#FFF" color="#000" />
          </View>
          <Text style={{ fontSize: 26, fontWeight: '900', letterSpacing: 3, color: colors.text }}>{showCode(reg.ticket_code)}</Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{reg.name}{reg.people > 1 ? ` (+${reg.people - 1})` : ''}</Text>
          <Text style={{ fontSize: 14, color: colors.muted }}>{fmtDateShort(reg.occurs_on)}</Text>
          {reg.checked_in_at ? <Tag text={tx('Ya entraste')} tone="green" /> : <Tag text={tx('Mostrá este código en la puerta')} tone="blue" />}
        </Card>
        <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>{tx('Una entrada sirve para todas las personas anotadas con vos. Sacale una captura por si no tenés señal.')}</Text>
      </Screen>
    </View>
  );
}
