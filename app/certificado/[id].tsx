// Certificado de bautismo: se ve, se guarda como imagen, se comparte o se imprime desde el menú del teléfono.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Loading } from '@/components/ui';
import { BaptismCertificate, type Cert } from '@/components/BaptismCertificate';
import { errorMessage, supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export default function Certificado() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [cert, setCert] = useState<Cert | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const w = Math.min(width - 32, 720);

  useEffect(() => {
    supabase.rpc('baptism_certificate', { p_contact: id }).then(({ data }) => setCert(((data ?? []) as Cert[])[0] ?? null));
  }, [id]);

  const save = async () => {
    if (!ref.current || !cert) return;
    if (Platform.OS === 'web') { Alert.alert('Abrilo desde el teléfono', 'Para guardarlo o imprimirlo, abrí este certificado en la app del teléfono.'); return; }
    setBusy(true);
    try {
      const { captureRef } = await import('react-native-view-shot');
      const uri = await captureRef(ref as unknown as number, { format: 'png', quality: 1, width: 2480, height: 1754, result: 'tmpfile' });
      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) { Alert.alert('No se pudo', 'Este teléfono no permite compartir archivos.'); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Certificado de bautismo', UTI: 'public.png' });
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Certificado de bautismo" subtitle="Guardalo, compartilo o imprimilo" back />
      <Screen>
        {cert === undefined ? <Loading /> : cert === null ? (
          <Card style={{ gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Todavía no hay certificado</Text>
            <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>Aparece cuando la iglesia anota la fecha de tu bautismo.</Text>
          </Card>
        ) : (
          <>
            <View style={{ alignSelf: 'center', borderWidth: 1, borderColor: colors.border }}>
              <View ref={ref} collapsable={false}><BaptismCertificate cert={cert} w={w} /></View>
            </View>
            <Button title="Guardar, compartir o imprimir" icon="download" onPress={save} loading={busy} />
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>
              Se guarda como imagen en alta calidad. En el menú que se abre elegí “Guardar imagen”, “Imprimir” o la app para enviarlo.
            </Text>
          </>
        )}
      </Screen>
    </View>
  );
}
