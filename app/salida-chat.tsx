// Chat de la salida: entre todos los que están en evangelismo ahora mismo.
import React from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Screen';
import { ChatRoom } from '@/components/ChatRoom';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function SalidaChat() {
  const outing = useOuting();
  const { can } = useAuth();
  const inside = !!outing.active || can('evang.ver_salidas');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Chat de la salida')} subtitle={tx('Solo lo ven los que están en salida ahora · se borra a las 12 horas')} back />
      {inside ? (
        <ChatRoom room="outing" features={{ photo: true }} placeholder={tx('Ej.: Estoy en la esquina de la plaza')}
          empty={{ title: tx('Nadie escribió todavía'), text: tx('Avisá dónde estás, pedí oración o coordiná con el equipo.') }} />
      ) : (
        <ChatRoom room="outing" readOnly empty={{ title: tx('No estás en una salida'), text: tx('El chat de la salida se abre cuando empezás una salida de evangelismo desde el Mapa.') }} />
      )}
    </View>
  );
}
