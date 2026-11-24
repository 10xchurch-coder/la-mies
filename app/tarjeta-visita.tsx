// Tarjeta de visita: el QR para pegar en la puerta. La visita lo escanea, escribe su nombre y su celular, y queda cargada para el seguimiento.
// Acá se ve y se imprime el QR, se cambia el código y se ven las últimas tarjetas que llegaron.
import React, { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, SectionTitle, Tag } from '@/components/ui';
import { visitUrl } from '@/lib/personas';
import { visitCards, visitToken, type VisitCard } from '@/lib/personasApi';
import { formatPhone } from '@/lib/phone';
import { WEB_URL } from '@/lib/share';
import { errorMessage } from '@/lib/supabase';
import { fmtRelativeDay } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function TarjetaVisita() {
  const router = useRouter();
  const { church, isStaff } = useAuth();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [cards, setCards] = useState<VisitCard[]>([]);
  const [busy, setBusy] = useState(false);
  const web = Platform.OS === 'web';
  const noprint = web ? ({ dataSet: { noprint: '1' } } as object) : {};

  useFocusEffect(useCallback(() => {
    visitToken().then(setToken).catch(() => setToken(null));
    visitCards().then(setCards).catch(() => undefined);
  }, []));

  const url = token ? visitUrl(WEB_URL, token) : null;
  const rotate = () => Alert.alert('¿Cambiar el código?', 'El QR que ya imprimiste deja de servir. Vas a tener que imprimir el nuevo y pegarlo otra vez.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cambiar', style: 'destructive', onPress: () => {
      setBusy(true);
      visitToken(true).then(setToken).catch((e) => Alert.alert('No se pudo', errorMessage(e))).finally(() => setBusy(false));
    } },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View {...noprint}><Header title="Tarjeta de visita" subtitle="El QR de la puerta" back /></View>
      <Screen>
        {web ? React.createElement('style', null, '@media print { [data-noprint] { display: none !important; } body { background: #fff !important; } [data-poster] { border: none !important; } }') : null}
        {token === undefined ? <Loading /> : !url ? (
          <Empty icon="grid" title="No se pudo cargar el código" text="Esta pantalla es para los líderes. Probá de nuevo con señal." />
        ) : (
          <>
            <View {...(web ? ({ dataSet: { poster: '1' } } as object) : {})}
              style={{ alignSelf: 'center', width: '100%', maxWidth: 420, alignItems: 'center', gap: 14, padding: 24, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#5F6B63', textAlign: 'center' }}>{church?.name ?? ''}</Text>
              <Text style={{ fontSize: 28, fontWeight: '900', color: '#17201A', textAlign: 'center' }}>¿Es tu primera vez?</Text>
              <Text style={{ fontSize: 17, lineHeight: 24, color: '#17201A', textAlign: 'center' }}>Apuntá la cámara de tu teléfono a este código y dejanos tu nombre.</Text>
              <View style={{ padding: 12, backgroundColor: '#FFFFFF' }}>
                <QRCode value={url} size={240} backgroundColor="#FFFFFF" color="#000000" />
              </View>
              <Text style={{ fontSize: 15, color: '#5F6B63', textAlign: 'center' }}>¡Qué alegría que estés acá!</Text>
            </View>
            <View {...noprint} style={{ gap: 12 }}>
              {web ? <Button title="Imprimir el cartel" icon="printer" onPress={() => (globalThis as { print?: () => void }).print?.()} />
                : <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 }}>Para imprimir el cartel, abrí esta pantalla desde la computadora. También podés mostrar el código desde el teléfono.</Text>}
              <Card style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>El enlace del código</Text>
                <Text selectable style={{ fontSize: 13, color: colors.text }}>{url}</Text>
                {isStaff ? <Button title="Cambiar el código" icon="refresh-cw" variant="ghost" small onPress={rotate} loading={busy} /> : null}
              </Card>
              <SectionTitle>Últimas tarjetas</SectionTitle>
              {!cards.length ? <Text style={{ fontSize: 13, color: colors.muted }}>Todavía no llegó ninguna. Cuando una visita llene la tarjeta, aparece acá y les llega un aviso al pastor y a la secretaría.</Text> : null}
              {cards.map((v) => (
                <Card key={v.id} style={{ padding: 12, gap: 4 }}>
                  <Pressable disabled={!v.contact_id} accessibilityRole="button" onPress={() => v.contact_id && router.push({ pathname: '/contacto/[id]', params: { id: v.contact_id } })} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.text }}>{v.name}</Text>
                      <Tag text={v.is_new ? 'Nueva' : 'Ya estaba cargada'} tone={v.is_new ? 'green' : 'gray'} />
                    </View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{fmtRelativeDay(v.created_at)}{v.phone ? ` · ${formatPhone(v.phone)}` : ''}</Text>
                    {v.heard ? <Text style={{ fontSize: 13, color: colors.text }}><Text style={{ fontWeight: '700' }}>Nos conoció por: </Text>{v.heard}</Text> : null}
                    {v.prayer ? <Text style={{ fontSize: 13, color: colors.text }}><Text style={{ fontWeight: '700' }}>Pedido de oración: </Text>{v.prayer}</Text> : null}
                  </Pressable>
                </Card>
              ))}
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}
