// "Que la cargue el equipo de La Mies": qué mandar, cómo prepararlo y el botón para pedirlo.
// El pedido es también el permiso: sin él, el equipo no puede cargar nada en esta iglesia (lo cuida la base).
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading } from '@/components/ui';
import { helpLinks } from '@/lib/alta';
import { altaState, requestImportHelp } from '@/lib/altaData';
import { downloadText } from '@/lib/download';
import { fmtDayYear } from '@/lib/format';
import { downloadTemplateXlsx } from '@/lib/importFile';
import { templateCsv } from '@/lib/importSmart';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function ImportarAyuda() {
  const router = useRouter();
  const { church, can } = useAuth();
  const [asked, setAsked] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const allowed = can('admin.iglesia');

  useFocusEffect(useCallback(() => {
    if (!allowed) return;
    altaState().then((s) => setAsked(s.import_help_at)).catch(() => setAsked(null));
  }, [allowed]));

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Que la cargue el equipo" back />
        <Empty icon="lock" title="Solo el pastor o el administrador de la app" />
      </View>
    );
  }
  if (asked === undefined) return <Loading />;

  const h = helpLinks({ church: church?.name, step: 'Quiero que me carguen la lista de personas' });
  const write = () => { Linking.openURL(h.whatsapp ?? h.mailto).catch(() => Alert.alert('Escribinos', h.email)); };
  const ask = async (on: boolean) => {
    setBusy(true);
    try {
      setAsked(await requestImportHelp(on));
      if (on) write();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const template = () => {
    if (Platform.OS === 'web') { try { downloadTemplateXlsx(); return; } catch { /* sigue con la de texto */ } }
    downloadText('planilla-modelo-la-mies.csv', templateCsv()).catch((e) => Alert.alert('No se pudo', errorMessage(e)));
  };

  const p = { fontSize: 14, color: colors.text, lineHeight: 21 } as const;
  const h2 = { fontSize: 16, fontWeight: '800', color: colors.text } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Que la cargue el equipo" subtitle="Nos mandás la lista y la cargamos nosotros" back />
      <Screen>
        <Card style={{ gap: 8 }}>
          <Text style={h2}>Qué nos tenés que mandar</Text>
          <Text style={p}>La lista de tu gente, como la tengas: un Excel, una hoja de Google, un archivo de otro programa, o una foto clara de un cuaderno.</Text>
          <Text style={p}>Lo que más sirve de cada persona:</Text>
          <Text style={p}>• Nombre y apellido (lo único obligatorio).</Text>
          <Text style={p}>• Celular con el código de área. Con esto la app reconoce a la persona cuando crea su cuenta.</Text>
          <Text style={p}>• Si es miembro o visita.</Text>
          <Text style={p}>• Si querés: dirección y barrio, fecha de nacimiento, si está bautizado, y de qué familia es.</Text>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={h2}>Cómo prepararla (si podés)</Text>
          <Text style={p}>1. Una persona por fila.</Text>
          <Text style={p}>2. Un título arriba de cada columna: Nombre, Apellido, Celular…</Text>
          <Text style={p}>3. Los que son de la misma familia, con el mismo nombre de familia.</Text>
          <Text style={p}>Si no podés ordenarla, mandala igual: la ordenamos nosotros.</Text>
          <Button title="Bajar la planilla modelo" icon="download" variant="outline" small onPress={template} />
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={h2}>Qué pasa después</Text>
          <Text style={p}>1. Tocás "Pedir que la carguen" acá abajo. Eso nos da permiso para cargar personas en tu iglesia, y nada más.</Text>
          <Text style={p}>2. Nos mandás la lista a {h.email}{h.whatsapp ? ' o por WhatsApp' : ''}.</Text>
          <Text style={p}>3. La cargamos y te avisamos. Queda anotado en el historial de tu iglesia quién la cargó y cuándo.</Text>
          <Text style={p}>4. Si algo quedó mal, se puede deshacer esa carga.</Text>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            El equipo de La Mies no puede ver a tus personas, tu plata ni tus mensajes dentro de la app. Solo ve la lista que vos le mandás. El permiso vence solo a los 30 días y lo podés sacar cuando quieras.
          </Text>
        </Card>

        {asked ? (
          <Card style={{ gap: 8, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
            <Text style={h2}>Ya lo pediste el {fmtDayYear(asked)}</Text>
            <Text style={p}>Mandanos la lista y la cargamos. Si ya la mandaste, te vamos a avisar cuando esté.</Text>
            <Button title={h.whatsapp ? 'Escribirle al equipo' : 'Mandar la lista por correo'} icon="send" onPress={write} />
            <Button title="Sacar el permiso" variant="ghost" small onPress={() => ask(false)} loading={busy} />
          </Card>
        ) : (
          <Button title="Pedir que la carguen" icon="life-buoy" onPress={() => ask(true)} loading={busy} />
        )}
        <Button title="Mejor la subo yo" variant="ghost" onPress={() => router.replace('/admin/importar' as Href)} />
      </Screen>
    </View>
  );
}
