// Las tildes de WhatsApp: ✓ enviado · ✓✓ entregado · ✓✓ azules visto.
import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Ticks as T } from '../lib/chatTicks';
import { colors } from '../theme';

export const READ_BLUE = '#2E9BD6';

export function Ticks({ state }: { state: T }) {
  const color = state === 'read' ? READ_BLUE : colors.muted;
  return (
    <View accessibilityLabel={state === 'read' ? 'Visto' : state === 'delivered' ? 'Entregado' : 'Enviado'} style={{ flexDirection: 'row', width: state === 'sent' ? 14 : 19, height: 14 }}>
      <Feather name="check" size={14} color={color} />
      {state !== 'sent' ? <Feather name="check" size={14} color={color} style={{ position: 'absolute', left: 5 }} /> : null}
    </View>
  );
}
