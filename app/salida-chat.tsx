// Chat de la salida: entre todos los que están en evangelismo ahora mismo.
import React from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Screen';
import { ChatRoom } from '@/components/ChatRoom';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { colors } from '@/theme';

export default function SalidaChat() {
  const outing = useOuting();
  const { can } = useAuth();
  const inside = !!outing.active || can('evang.ver_salidas');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Chat de la salida" subtitle="Solo lo ven los que están en salida ahora · se borra a las 12 horas" back />
      {inside ? (
        <ChatRoom room="outing" placeholder="Ej.: Estoy en la esquina de la plaza"
          empty={{ title: 'Nadie escribió todavía', text: 'Avisá dónde estás, pedí oración o coordiná con el equipo.' }} />
      ) : (
        <ChatRoom room="outing" readOnly empty={{ title: 'No estás en una salida', text: 'El chat de la salida se abre cuando empezás una salida de evangelismo desde el Mapa.' }} />
      )}
    </View>
  );
}
