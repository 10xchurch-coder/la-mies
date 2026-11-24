// Cartel para imprimir: el código QR para que los hermanos creen su cuenta en la iglesia, o para instalar la app.
// Se imprime igual que la tarjeta de visita: en la computadora, con "Imprimir el cartel".
import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Header, Screen } from '@/components/Screen';
import { Button, Choice, Empty, Loading } from '@/components/ui';
import { joinLink, STORE_LINKS } from '@/lib/alta';
import { WEB_URL } from '@/lib/share';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

type Mode = 'codigo' | 'instalar';

export default function Cartel() {
  const { church, can } = useAuth();
  const { modo } = useLocalSearchParams<{ modo?: string }>();
  const [mode, setMode] = useState<Mode>(modo === 'instalar' ? 'instalar' : 'codigo');
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const web = Platform.OS === 'web';
  const noprint = web ? ({ dataSet: { noprint: '1' } } as object) : {};
  const allowed = can('admin.iglesia');

  useEffect(() => {
    if (!allowed) return;
    supabase.rpc('church_join_code').then(({ data }) => setCode(typeof data === 'string' ? data : null));
  }, [allowed]);

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Cartel con el código" back />
        <Empty icon="lock" title="Solo el pastor o el administrador de la app" />
      </View>
    );
  }

  const url = mode === 'codigo' ? (code ? joinLink(WEB_URL, code) : null) : WEB_URL;
  const dark = '#17201A'; const soft = '#5F6B63';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View {...noprint}><Header title="Cartel para imprimir" subtitle={mode === 'codigo' ? 'El código de la iglesia' : 'Instalar la app'} back /></View>
      <Screen>
        {web ? React.createElement('style', null, '@media print { [data-noprint] { display: none !important; } body { background: #fff !important; } [data-poster] { border: none !important; } }') : null}
        <View {...noprint}>
          <Choice<Mode> value={mode} onChange={setMode} options={[{ value: 'codigo', label: 'Para crear la cuenta' }, { value: 'instalar', label: 'Para instalar la app' }]} />
        </View>
        {code === undefined ? <Loading /> : !url ? (
          <Empty icon="grid" title="No se pudo cargar el código" text="Probá de nuevo con señal." />
        ) : (
          <>
            <View {...(web ? ({ dataSet: { poster: '1' } } as object) : {})}
              style={{ alignSelf: 'center', width: '100%', maxWidth: 440, alignItems: 'center', gap: 12, padding: 24, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: soft, textAlign: 'center' }}>{church?.name ?? ''}</Text>
              <Text style={{ fontSize: 28, fontWeight: '900', color: dark, textAlign: 'center' }}>{mode === 'codigo' ? 'Sumate a la app de la iglesia' : 'Instalá la app La Mies'}</Text>
              <Text style={{ fontSize: 17, lineHeight: 24, color: dark, textAlign: 'center' }}>
                {mode === 'codigo' ? 'Apuntá la cámara de tu teléfono a este código y tocá "Crear cuenta".' : 'Apuntá la cámara de tu teléfono a este código para abrir la app.'}
              </Text>
              <View style={{ padding: 12, backgroundColor: '#FFFFFF' }}>
                <QRCode value={url} size={240} backgroundColor="#FFFFFF" color="#000000" />
              </View>
              {mode === 'codigo' ? (
                <>
                  <Text style={{ fontSize: 15, color: soft, textAlign: 'center' }}>Código de la iglesia</Text>
                  <Text selectable style={{ fontSize: 30, fontWeight: '900', letterSpacing: 2, color: dark, textAlign: 'center' }}>{code}</Text>
                </>
              ) : (
                <>
                  <Text selectable style={{ fontSize: 14, color: dark, textAlign: 'center' }}>{WEB_URL}</Text>
                  <Text style={{ fontSize: 14, color: soft, textAlign: 'center', lineHeight: 20 }}>
                    También podés buscar "La Mies" en {STORE_LINKS.ios || STORE_LINKS.android ? 'la tienda de tu teléfono' : 'el App Store o en Google Play'}.
                  </Text>
                  {STORE_LINKS.android ? <Text selectable style={{ fontSize: 12, color: soft, textAlign: 'center' }}>Android: {STORE_LINKS.android}</Text> : null}
                  {STORE_LINKS.ios ? <Text selectable style={{ fontSize: 12, color: soft, textAlign: 'center' }}>iPhone: {STORE_LINKS.ios}</Text> : null}
                </>
              )}
            </View>
            <View {...noprint} style={{ gap: 10 }}>
              {web ? <Button title="Imprimir el cartel" icon="printer" onPress={() => (globalThis as { print?: () => void }).print?.()} />
                : <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 }}>Para imprimir el cartel, abrí esta pantalla desde la computadora. También podés mostrar el código desde el teléfono.</Text>}
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>Pegalo en la entrada o proyectalo antes del culto.</Text>
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}
