// Modo presentación: control remoto. Desde el teléfono se pasa de diapositiva en el aparato que maneja la lista
// (que tiene que estar abierto en el Modo presentación, con la lista del culto).
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { PresentSlide } from '@/components/PresentSlide';
import { useChurchLogo } from '@/components/BrandFooter';
import { Button, Card, Empty, Loading } from '@/components/ui';
import { BLACK, isNewer, type LiveState, type RemoteCommand } from '@/lib/present';
import { openPresentLink, type LinkStatus, type PresentLink } from '@/lib/presentSync';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function Control() {
  const { church, isLeader } = useAuth();
  const { width } = useWindowDimensions();
  const logo = useChurchLogo();
  const [live, setLive] = useState<LiveState>(BLACK);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<LinkStatus>('conectando');
  const link = useRef<PresentLink | null>(null);
  const liveRef = useRef<LiveState | null>(null);
  const churchId = church?.id;
  const allowed = !!churchId && isLeader;

  useEffect(() => {
    if (!churchId || !allowed) return;
    const l = openPresentLink(churchId, {
      onStatus: setStatus,
      onState: (s) => {
        if (!isNewer(liveRef.current, s)) return;
        liveRef.current = s;
        setOffset(s.at - Date.now());
        setLive(s);
      },
    });
    link.current = l;
    return () => { l.close(); link.current = null; };
  }, [churchId, allowed]);

  if (!church) return <Loading />;
  if (!isLeader) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Control remoto" back />
        <Empty icon="lock" title="Solo para líderes" text="Si tenés que manejar la pantalla, pedile permiso al pastor." />
      </View>
    );
  }

  const send = (c: RemoteCommand) => link.current?.sendCommand(c);
  const w = Math.min(width - 64, 520);
  const big = (title: string, icon: React.ComponentProps<typeof Feather>['name'], c: RemoteCommand, primary: boolean) => (
    <Pressable onPress={() => send(c)} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flex: primary ? 1.5 : 1, height: 120, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: primary ? colors.green : colors.bg, borderWidth: primary ? 0 : 2, borderColor: colors.green, opacity: pressed ? 0.8 : 1 })}>
      <Feather name={icon} size={34} color={primary ? '#FFFFFF' : colors.green} />
      <Text style={{ fontSize: 17, fontWeight: '800', color: primary ? '#FFFFFF' : colors.green }}>{title}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Control remoto" subtitle={status === 'conectado' ? 'Conectado' : status === 'conectando' ? 'Conectando…' : 'Sin conexión'} back />
      <Screen>
        <Card style={{ gap: 10, alignItems: 'center' }}>
          <Text style={{ alignSelf: 'flex-start', fontSize: 13, fontWeight: '800', color: colors.text }}>EN PANTALLA</Text>
          <View style={{ borderRadius: 8, overflow: 'hidden' }}>
            <PresentSlide live={live} width={w} height={Math.round((w * 9) / 16)} clockOffset={offset} logoUrl={logo} churchName={church.name} />
          </View>
        </Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {big('Anterior', 'arrow-left', 'prev', false)}
          {big('Siguiente', 'arrow-right', 'next', true)}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button title="Negro" icon="square" variant="outline" onPress={() => send('black')} style={{ flex: 1 }} />
          <Button title="Logo" icon="home" variant="outline" onPress={() => send('logo')} style={{ flex: 1 }} />
        </View>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
          Para que ande, el aparato que maneja la lista tiene que tener abierto el Modo presentación, y los dos tienen que tener internet.
          {status === 'sin-conexion' ? ' Ahora no hay conexión: revisá el wifi o los datos.' : ''}
        </Text>
      </Screen>
    </View>
  );
}
