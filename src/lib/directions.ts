// Abrir Google Maps (o el mapa del teléfono) con el camino a pie hasta un compañero.
import { Linking, Platform } from 'react-native';
import { showActions } from '@/components/ActionSheet';
import type { LiveMember } from '@/components/CoverageMap';

export function walkTo(lat: number, lng: number): void {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  Linking.openURL(url).catch(() => {
    if (Platform.OS === 'ios') Linking.openURL(`http://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`).catch(() => undefined);
  });
}

/** Al tocar a un compañero en el mapa. */
export function liveMemberActions(m: LiveMember, extra: { onChat?: () => void } = {}): void {
  if (m.me) return;
  showActions(m.display_name, 'Está en salida ahora. Su ubicación se actualiza cada pocos segundos.', [
    { text: `Ir caminando hasta ${m.display_name.split(' ')[0]}`, icon: 'navigation', onPress: () => walkTo(m.lat, m.lng) },
    ...(extra.onChat ? [{ text: 'Abrir el chat de la salida', icon: 'message-circle' as const, onPress: extra.onChat }] : []),
    { text: 'Cancelar', icon: 'x' as const },
  ]);
}
