// Pedir ayuda a La Mies y mandarle una idea: para el pastor y los administradores de cualquier iglesia.
// El pedido queda anotado para el equipo de La Mies (con el nombre y el contacto de quien pide, para poder responderle)
// y además se puede abrir WhatsApp o el correo. Abajo se ve cómo va cada pedido y qué respondieron a cada idea.
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, SectionTitle, Tag } from '@/components/ui';
import { helpLinks } from '@/lib/alta';
import { HELP_STATUS, IDEA_STATUS } from '@/lib/central';
import { helpCreate, helpMine, ideaSend, ideasMine, type MyHelp, type MyIdea } from '@/lib/centralData';
import { fmtDayYear } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

export default function AskLaMies() {
  const { church, can } = useAuth();
  const canIdea = can('admin.iglesia');
  const [help, setHelp] = useState('');
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<MyHelp[]>([]);
  const [ideas, setIdeas] = useState<MyIdea[]>([]);

  const load = useCallback(() => {
    helpMine().then(setMine).catch(() => undefined);
    if (canIdea) ideasMine().then(setIdeas).catch(() => undefined);
  }, [canIdea]);
  useFocusEffect(load);

  const links = helpLinks({ church: church?.name, step: help.trim() ? help.trim().slice(0, 200) : null });
  const sendHelp = async (then?: 'whatsapp' | 'mail') => {
    if (help.trim().length < 3) { Alert.alert('Contanos un poco más', 'Escribí en pocas palabras con qué necesitás ayuda.'); return; }
    setBusy(true);
    try {
      await helpCreate({ step: 'Pedir ayuda a La Mies', screen: '/admin/ayuda', message: help.trim() });
      if (then === 'whatsapp' && links.whatsapp) Linking.openURL(links.whatsapp).catch(() => undefined);
      else if (then === 'mail') Linking.openURL(links.mailto).catch(() => undefined);
      else Alert.alert('Pedido enviado', 'Le llegó al equipo de La Mies. Te van a escribir al teléfono o al correo de tu cuenta.');
      setHelp('');
      load();
    } catch (e) { Alert.alert('No se pudo enviar', errorMessage(e)); } finally { setBusy(false); }
  };
  const sendIdea = async () => {
    if (idea.trim().length < 5) { Alert.alert('Falta la idea', 'Escribí tu idea en pocas palabras.'); return; }
    setBusy(true);
    try { await ideaSend(idea.trim()); setIdea(''); load(); Alert.alert('Gracias', 'Tu idea le llegó al equipo de La Mies.'); } catch (e) { Alert.alert('No se pudo enviar', errorMessage(e)); } finally { setBusy(false); }
  };

  const small = { fontSize: 12, color: colors.muted, lineHeight: 17 } as const;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Pedir ayuda a La Mies" subtitle="El equipo que hace la app te ayuda" back />
      <Screen>
        <Card style={{ gap: 10 }}>
          <Field label="¿Con qué necesitás ayuda?" value={help} onChangeText={setHelp} multiline maxLength={2000} placeholder="No me sale cargar la lista de personas." />
          <Button title="Enviar el pedido" icon="send" onPress={() => sendHelp()} loading={busy} disabled={help.trim().length < 3} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {links.whatsapp ? <Button title="Enviar y abrir WhatsApp" icon="message-circle" variant="outline" small style={{ flex: 1 }} disabled={busy || help.trim().length < 3} onPress={() => sendHelp('whatsapp')} /> : null}
            <Button title="Enviar y abrir el correo" icon="mail" variant="outline" small style={{ flex: 1 }} disabled={busy || help.trim().length < 3} onPress={() => sendHelp('mail')} />
          </View>
          <Text style={small}>Al equipo de La Mies le llega tu nombre, tu teléfono y tu correo para poder responderte. No le llega nada de las personas de tu iglesia.</Text>
        </Card>

        {mine.length ? (
          <>
            <SectionTitle>Tus pedidos</SectionTitle>
            {mine.map((h) => (
              <Card key={h.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Tag text={HELP_STATUS[h.status].label} tone={HELP_STATUS[h.status].tone === 'red' ? 'amber' : HELP_STATUS[h.status].tone} />
                  <Text style={small}>{fmtDayYear(h.created_at)}</Text>
                </View>
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{h.message ?? h.step ?? 'Pedido de ayuda'}</Text>
              </Card>
            ))}
          </>
        ) : null}

        {canIdea ? (
          <>
            <SectionTitle>Enviar una idea a La Mies</SectionTitle>
            <Card style={{ gap: 10 }}>
              <Field label="¿Qué le falta a la app o qué mejorarías?" value={idea} onChangeText={setIdea} multiline maxLength={2000} placeholder="Estaría bueno poder mandar el informe por correo." />
              <Button title="Enviar la idea" icon="zap" variant="outline" onPress={sendIdea} loading={busy} disabled={idea.trim().length < 5} />
              <Text style={small}>Esto va al equipo que hace la app. La caja de sugerencias de tu iglesia es otra cosa: esa la lee solo tu iglesia.</Text>
            </Card>
            {ideas.map((i) => (
              <Card key={i.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Tag text={i.status === 'new' ? 'Enviada' : IDEA_STATUS[i.status].label} tone={i.status === 'new' ? 'gray' : IDEA_STATUS[i.status].tone === 'red' ? 'gray' : IDEA_STATUS[i.status].tone} />
                  <Text style={small}>{fmtDayYear(i.created_at)}</Text>
                </View>
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{i.body}</Text>
                {i.reply ? <Text style={{ fontSize: 14, color: colors.greenText, lineHeight: 20 }}>{`La Mies respondió: ${i.reply}`}</Text> : null}
              </Card>
            ))}
          </>
        ) : null}
      </Screen>
    </View>
  );
}
