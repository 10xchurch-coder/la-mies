// Chat de toda la iglesia, en vivo.
import React from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Screen';
import { ChatRoom } from '@/components/ChatRoom';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function ChatIglesia() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Chat de la iglesia')} subtitle={tx('Lo ve toda la iglesia · mantené apretado un mensaje para más opciones')} back />
      <ChatRoom room="church" features={{ photo: true, doc: true, poll: true }} empty={{ title: tx('Todavía no hay mensajes'), text: tx('Saludá a los hermanos. Lo que escribas lo ve toda la iglesia.') }} />
    </View>
  );
}
