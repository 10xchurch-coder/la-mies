// Chat de toda la iglesia, en vivo.
import React from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Screen';
import { ChatRoom } from '@/components/ChatRoom';
import { colors } from '@/theme';

export default function ChatIglesia() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Chat de la iglesia" subtitle="Lo ve toda la iglesia · mantené apretado un mensaje para más opciones" back />
      <ChatRoom room="church" empty={{ title: 'Todavía no hay mensajes', text: 'Saludá a los hermanos. Lo que escribas lo ve toda la iglesia.' }} />
    </View>
  );
}
