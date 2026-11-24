// Iglesias de la red: solo para el administrador de la red. Crea una iglesia nueva y arma la invitación de su pastor.
// Todo lo decide la base: quien no es administrador de la red no puede crear iglesias ni invitar pastores.
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { AltaSignups } from '@/components/AltaSignups';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading, SectionTitle, Tag } from '@/components/ui';
import { inviteLink, inviteMessage, joinCodeProblem, suggestJoinCode, TIMEZONES, timezoneLabel } from '@/lib/churchSetup';
import { createChurch, createPastorInvite, networkChurches, revokePastorInvites, type NetworkChurch } from '@/lib/churchSetupData';
import { fmtDayYear } from '@/lib/format';
import { shareText, WEB_URL } from '@/lib/share';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

const DAYS = 14;

export default function Red() {
  const { profile } = useAuth();
  const isNet = !!profile?.is_network_admin;
  const [rows, setRows] = useState<NetworkChurch[] | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [tz, setTz] = useState(TIMEZONES[0].value);
  const [otherTz, setOtherTz] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // La invitación recién hecha: el código se ve solo ahora.
  const [invite, setInvite] = useState<{ churchId: string; church: string; token: string } | null>(null);

  const load = useCallback(() => {
    if (!isNet) return;
    networkChurches().then(setRows).catch((e) => { Alert.alert(tx('No se pudo'), errorMessage(e)); setRows([]); });
  }, [isNet]);
  useFocusEffect(load);

  const makeInvite = async (churchId: string, church: string) => {
    try {
      const token = await createPastorInvite(churchId, DAYS);
      setInvite({ churchId, church, token });
      load();
    } catch (e) {
      Alert.alert(tx('No se pudo'), errorMessage(e));
    }
  };
  const askInvite = (c: NetworkChurch) => {
    if (!c.invite_expires_at && !c.pastors) { makeInvite(c.id, c.name); return; }
    Alert.alert(tx('Invitación nueva'), c.pastors ? tx('{name} ya tiene pastor en la app. Quien use esta invitación también va a quedar como pastor, con todos los permisos.', { name: c.name }) : tx('La invitación anterior deja de servir.'), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Hacer la invitación'), onPress: () => makeInvite(c.id, c.name) },
    ]);
  };
  const revoke = (c: NetworkChurch) => Alert.alert(tx('Anular la invitación'), tx('El código que mandaste deja de servir.'), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Anular'), style: 'destructive', onPress: () => revokePastorInvites(c.id).then(() => { if (invite?.churchId === c.id) setInvite(null); load(); }).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) },
  ]);

  const create = async () => {
    const problem = joinCodeProblem(code);
    if (name.trim().length < 3) { Alert.alert(tx('Falta el nombre'), tx('Escribí el nombre de la iglesia.')); return; }
    if (problem) { Alert.alert(tx('Revisá el código'), problem); return; }
    setBusy(true);
    try {
      const made = await createChurch({ name: name.trim(), city: city.trim(), timezone: otherTz.trim() || tz, joinCode: code.trim() });
      const church = name.trim();
      setName(''); setCity(''); setCode(''); setOtherTz('');
      await makeInvite(made.church_id, church);
      Alert.alert(tx('Iglesia creada'), tx('{church} ya existe en la app. Abajo está la invitación para su pastor. El código para los hermanos es {join_code}.', { church, join_code: made.join_code }));
    } catch (e) {
      Alert.alert(tx('No se pudo crear'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isNet) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={tx('Iglesias de la red')} back />
        <Empty icon="lock" title={tx('Solo para el administrador de la red')} text={tx('Desde acá se suman iglesias nuevas a la app.')} />
      </View>
    );
  }

  const link = invite ? inviteLink(WEB_URL, invite.token) : '';
  const message = invite ? inviteMessage({ church: invite.church, token: invite.token, link, days: DAYS }) : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Iglesias de la red')} subtitle={tx('Sumar una iglesia nueva a la app')} back />
      <Screen>
        {invite ? (
          <Card style={{ gap: 8, backgroundColor: colors.pinkSoft, borderColor: colors.pinkSoft }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.pinkText }}>{tx('INVITACIÓN DEL PASTOR · {church}', { church: invite.church })}</Text>
            <Text selectable style={{ fontSize: 22, fontWeight: '800', letterSpacing: 1, color: colors.text, textAlign: 'center' }}>{invite.token}</Text>
            <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>
              {tx('Mandásela solo al pastor. Sirve una sola vez y vence en {DAYS} días. Quien la use queda como pastor de esa iglesia, con todos los permisos.', { DAYS })}
            </Text>
            <Text style={{ fontSize: 13, color: colors.pinkText, lineHeight: 19, fontWeight: '700' }}>{tx('Copiala ahora: cuando salgas de esta pantalla no se vuelve a mostrar.')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={tx('Copiar el mensaje')} icon="copy" variant="outline" small style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(message).then(() => Alert.alert(tx('Copiado'), tx('Pegalo en WhatsApp o en un correo para el pastor.')))} />
              <Button title={tx('Compartir')} icon="share-2" small style={{ flex: 1 }} onPress={() => { shareText(message, tx('Invitación de pastor')).catch(() => undefined); }} />
            </View>
          </Card>
        ) : null}

        <AltaSignups />

        <SectionTitle>{tx('Iglesias')}</SectionTitle>
        {rows === null ? <Loading /> : rows.map((c) => (
          <Card key={c.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ flexShrink: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{c.name}</Text>
              {!c.pastors ? <Tag text={tx('Sin pastor todavía')} tone="amber" /> : c.setup_pending ? <Tag text={tx('Haciendo los primeros pasos')} tone="blue" /> : <Tag text={tx('En marcha')} tone="green" />}
            </View>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {[c.city, timezoneLabel(c.timezone), `${c.accounts} ${c.accounts === 1 ? tx('cuenta') : tx('cuentas')}`, tx('desde {fmtDayYear}', { fmtDayYear: fmtDayYear(c.created_at) })].filter(Boolean).join(' · ')}
            </Text>
            {c.join_code ? <Text selectable style={{ fontSize: 13, color: colors.text }}>{tx('Código para los hermanos:')} <Text style={{ fontWeight: '800' }}>{c.join_code}</Text></Text> : null}
            {c.invite_expires_at ? <Text style={{ fontSize: 13, color: colors.amberText }}>{tx('Hay una invitación de pastor sin usar. Vence el {fmtDayYear}.', { fmtDayYear: fmtDayYear(c.invite_expires_at) })}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={c.invite_expires_at ? tx('Hacer otra invitación') : tx('Invitar al pastor')} icon="user-plus" variant="outline" small style={{ flex: 1 }} onPress={() => askInvite(c)} />
              {c.invite_expires_at ? <Button title={tx('Anular')} variant="danger" small onPress={() => revoke(c)} /> : null}
            </View>
          </Card>
        ))}

        <SectionTitle>{tx('Crear una iglesia nueva')}</SectionTitle>
        <Card style={{ gap: 10 }}>
          <Field label={tx('Nombre de la iglesia')} value={name} onChangeText={setName} autoCapitalize="words" placeholder={tx('Iglesia Bautista Esperanza')} />
          <Field label={tx('Ciudad')} value={city} onChangeText={setCity} autoCapitalize="words" placeholder={tx('Oberá')} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>{tx('Dónde está (para la hora)')}</Text>
          <Choice options={TIMEZONES} value={otherTz.trim() ? null : tz} onChange={(v) => { setTz(v); setOtherTz(''); }} columns={2} />
          <Field label={tx('Otra zona horaria')} hint={tx('(solo si no está arriba)')} value={otherTz} onChangeText={setOtherTz} autoCapitalize="none" autoCorrect={false} placeholder={tx('America/Guayaquil')} />
          <Field label={tx('Código para los hermanos')} hint={tx('(con este código se unen los miembros; vacío: la app inventa uno)')} value={code} onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters" autoCorrect={false} placeholder={suggestJoinCode(name || tx('Iglesia'))} />
          {name.trim().length >= 3 && !code ? <Button title={tx('Usar {suggestJoinCode}', { suggestJoinCode: suggestJoinCode(name) })} variant="ghost" small onPress={() => setCode(suggestJoinCode(name))} /> : null}
          {code && joinCodeProblem(code) ? <Text style={{ fontSize: 12, color: colors.red }}>{joinCodeProblem(code)}</Text> : null}
          <Button title={tx('Crear la iglesia e invitar al pastor')} icon="plus-circle" onPress={create} loading={busy} disabled={name.trim().length < 3} />
        </Card>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          {tx('La iglesia nueva empieza vacía, con dos reuniones y los fondos de inicio. Vos no ves sus personas ni su plata: cada iglesia ve solo lo suyo. Cuando el pastor crea su cuenta con la invitación, la app lo lleva por los primeros pasos.')}
        </Text>
      </Screen>
    </View>
  );
}
