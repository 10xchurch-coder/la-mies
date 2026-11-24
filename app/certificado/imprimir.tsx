// Certificado para imprimir: de bautismo o de membresía (?tipo=bautismo|miembro), con los datos de la ficha de la persona.
// En la computadora se imprime con un botón; en el teléfono se guarda como imagen para compartir o imprimir.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Header } from '@/components/Screen';
import { useChurchLogo } from '@/components/BrandFooter';
import { PrintCertificate, certTitle } from '@/components/PrintCertificate';
import { Button, Card, Loading } from '@/components/ui';
import { certificate, type CertData, type CertKind } from '@/lib/personasApi';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function CertificadoImprimir() {
  const { id, tipo } = useLocalSearchParams<{ id: string; tipo?: string }>();
  const kind: CertKind = tipo === 'miembro' ? 'miembro' : 'bautismo';
  const { width } = useWindowDimensions();
  const logo = useChurchLogo();
  const [cert, setCert] = useState<CertData | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const web = Platform.OS === 'web';
  // En la computadora, el ancho que entra en una hoja A4 acostada.
  const w = Math.min(width - 32, web ? 1000 : 720);
  const noprint = web ? ({ dataSet: { noprint: '1' } } as object) : {};

  useEffect(() => {
    certificate(id, kind).then(setCert).catch(() => setCert(null));
  }, [id, kind]);

  const save = async () => {
    if (web) { (globalThis as { print?: () => void }).print?.(); return; }
    if (!ref.current || !cert) return;
    setBusy(true);
    try {
      const { captureRef } = await import('react-native-view-shot');
      const uri = await captureRef(ref as unknown as number, { format: 'png', quality: 1, width: 2480, height: 1754, result: 'tmpfile' });
      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) { Alert.alert(tx('No se pudo'), tx('Este teléfono no permite compartir archivos.')); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: certTitle(kind), UTI: 'public.png' });
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {web ? React.createElement('style', null, '@page { size: A4 landscape; margin: 8mm; } @media print { [data-noprint] { display: none !important; } body { background: #fff !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }') : null}
      <View {...noprint}><Header title={certTitle(kind)} subtitle={web ? tx('Para imprimir') : tx('Guardalo, compartilo o imprimilo')} back /></View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, alignItems: 'center' }}>
        {cert === undefined ? <Loading /> : cert === null ? (
          <Card style={{ gap: 6, alignSelf: 'stretch' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{tx('Todavía no hay certificado')}</Text>
            <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>
              {tx('{pl} Los certificados los imprime el pastor o la secretaría.', { pl: kind === 'bautismo' ? tx('Aparece cuando en la ficha está la fecha del bautismo hecho en esta iglesia.') : tx('Aparece cuando la persona es miembro y en su ficha está la fecha “Miembro desde”.') })}
            </Text>
          </Card>
        ) : (
          <>
            <View style={{ borderWidth: 1, borderColor: colors.border }}>
              <View ref={ref} collapsable={false}><PrintCertificate cert={cert} kind={kind} w={w} logo={logo} /></View>
            </View>
            <View {...noprint} style={{ gap: 10, alignSelf: 'stretch', maxWidth: 520, width: '100%', alignItems: 'stretch' }}>
              <Button title={web ? tx('Imprimir') : tx('Guardar, compartir o imprimir')} icon={web ? 'printer' : 'download'} onPress={save} loading={busy} />
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>
                {web ? tx('Sale en una hoja A4 acostada. Si la ventana es chica, agrandala antes de imprimir. La firma va a mano, sobre la línea.')
                  : tx('Se guarda como imagen en alta calidad. En el menú que se abre elegí “Guardar imagen”, “Imprimir” o la app para enviarlo.')}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
