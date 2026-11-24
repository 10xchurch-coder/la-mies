// Iglesia suspendida por el equipo de La Mies: nadie de esa iglesia usa la app hasta que se saque la suspensión.
// Solo puede pasar con una iglesia que se anotó sola. Si no se puede saber (sin señal, base vieja), la app sigue normal.
import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { LA_MIES_TEAM } from '@/lib/alta';
import { churchStatus } from '@/lib/altaData';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

/** true: la iglesia de quien entró está suspendida. */
export function useChurchSuspended(): boolean {
  const { session, profile } = useAuth();
  const church = profile?.church_id ?? null;
  const uid = session?.user?.id ?? null;
  const [suspended, setSuspended] = useState(false);
  useEffect(() => {
    if (!uid || !church) { setSuspended(false); return; }
    let live = true;
    churchStatus().then((s) => { if (live) setSuspended(s === 'suspended'); }).catch(() => undefined);
    return () => { live = false; };
  }, [uid, church]);
  return suspended;
}

export function SuspendedScreen() {
  const { signOut, church } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
      <Feather name="pause-circle" size={56} color={colors.amberText} />
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{tx('La app de {name} está en pausa', { name: church?.name ?? tx('tu iglesia') })}</Text>
      <Text style={{ fontSize: 15, color: colors.text, textAlign: 'center', lineHeight: 22, maxWidth: 420 }}>
        {tx('El equipo de La Mies la puso en pausa por ahora. No se borró nada. Si sos el pastor, escribinos y lo vemos juntos.')}
      </Text>
      <Text selectable style={{ fontSize: 15, fontWeight: '700', color: colors.green }}>{LA_MIES_TEAM.email}</Text>
      <Button title={tx('Escribir al equipo')} icon="mail" onPress={() => { Linking.openURL(`mailto:${LA_MIES_TEAM.email}?subject=${encodeURIComponent(tx('Iglesia en pausa'))}`).catch(() => undefined); }} />
      <Button title={tx('Salir de la cuenta')} variant="ghost" onPress={() => { signOut().catch(() => undefined); }} />
    </View>
  );
}
