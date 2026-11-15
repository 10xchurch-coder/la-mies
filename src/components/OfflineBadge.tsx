// Aviso chico cuando no hay señal o hay cambios esperando para subirse.
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { netState, subscribeNet } from '@/lib/netFetch';
import { pendingCount } from '@/lib/offline';

export function OfflineBadge() {
  const insets = useSafeAreaInsets();
  const [net, setNet] = useState(netState());
  const [contacts, setContacts] = useState(0);
  // Al suscribirse se vuelve a leer: la señal pudo haber cambiado mientras la pantalla se armaba.
  useEffect(() => { setNet(netState()); return subscribeNet(setNet); }, []);
  useEffect(() => {
    const load = () => { pendingCount().then(setContacts).catch(() => undefined); };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [net.online]);

  const pending = net.pending + contacts;
  if (net.online && !pending) return null;
  const changes = pending === 1 ? '1 cambio' : `${pending} cambios`;
  const text = !net.online
    ? (pending ? `Sin conexión · ${changes} por subir` : 'Sin conexión · ves lo último guardado')
    : `Subiendo ${changes}…`;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 70 }]}>
      <View style={[styles.pill, net.online && { backgroundColor: '#1F6B45' }]}>
        <Feather name={net.online ? 'upload-cloud' : 'wifi-off'} size={13} color="#FFF" />
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(40,44,42,0.92)' },
  text: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
