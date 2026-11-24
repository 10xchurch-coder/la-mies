// La Mies Central · Equipo: quién puede entrar a Central. Solo el dueño de la red da y saca el acceso; todo queda anotado.
import React, { useMemo, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { LoadError, PrivacyBox, useCentralLoad } from '@/components/central/CentralUI';
import { DeskPage, Panel } from '@/components/desk/DeskShell';
import { Avatar, Button, Loading, Tag } from '@/components/ui';
import { centralTeam, staffGrant, staffRevoke } from '@/lib/centralData';
import { norm } from '@/lib/desk';
import { fmtDayYear, ROLE_LABEL } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function CentralTeamPage() {
  const { data, error, reload } = useCentralLoad(centralTeam);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const found = useMemo(() => {
    const s = norm(q.trim());
    return (data?.candidates ?? []).filter((c) => !s || norm(c.name ?? '').includes(s)).slice(0, s ? 30 : 8);
  }, [data, q]);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); reload(); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); } finally { setBusy(false); } };

  if (error && !data) return <DeskPage title={tx('Equipo de La Mies')}><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data) return <DeskPage title={tx('Equipo de La Mies')}><Loading /></DeskPage>;
  const owner = data.role === 'owner';

  const grant = (id: string, name: string) => Alert.alert(tx('Dar acceso a La Mies Central'), tx('{name} va a ver en su computadora el panel de todas las iglesias: números, pedidos de ayuda, ideas y errores. No va a ver las personas ni la plata de otras iglesias. Le podés sacar el acceso cuando quieras.', { name }), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Dar acceso'), onPress: () => { run(() => staffGrant(id)); } },
  ]);
  const revoke = (id: string, name: string) => Alert.alert(tx('Sacar el acceso'), tx('{name} deja de ver La Mies Central ahora mismo.', { name }), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Sacar el acceso'), style: 'destructive', onPress: () => { run(() => staffRevoke(id)); } },
  ]);

  return (
    <DeskPage title={tx('Equipo de La Mies')} subtitle={tx('Quién puede entrar a La Mies Central.')}>
      <Panel title={tx('Con acceso · {n}', { n: data.team.length })}>
        {data.team.map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Avatar name={t.name ?? '?'} size={36} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{t.name}</Text>
                <Tag text={t.role === 'owner' ? tx('Dueño de la red') : tx('Equipo')} tone={t.role === 'owner' ? 'green' : 'blue'} />
              </View>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {t.role === 'owner' ? tx('Ve todo, da y saca accesos, crea iglesias, invita pastores y puede suspender.')
                  : tx('{ROLE_LABEL} en la iglesia{v1}{v2}', { ROLE_LABEL: ROLE_LABEL[t.church_role] ?? t.church_role, v1: t.granted_at ? tx(' · tiene acceso desde el {fmtDayYear}', { fmtDayYear: fmtDayYear(t.granted_at) }) : '', v2: t.granted_by ? tx(' · se lo dio {granted_by}', { granted_by: t.granted_by }) : '' })}
              </Text>
            </View>
            {owner && t.role === 'staff' ? <Button title={tx('Sacar el acceso')} variant="danger" small disabled={busy} onPress={() => revoke(t.id, t.name)} /> : null}
          </View>
        ))}
      </Panel>

      <Panel title={tx('Qué puede hacer cada uno')}>
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 21 }}>
          <Text style={{ fontWeight: '800' }}>{tx('Dueño de la red:')} </Text>{tx('ve todo Central, da y saca el acceso al equipo, crea iglesias, invita pastores, suspende una iglesia y le sugiere funciones a un pastor.')}
        </Text>
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 21 }}>
          <Text style={{ fontWeight: '800' }}>{tx('Equipo:')} </Text>{tx('ve todo Central, responde pedidos de ayuda, anota ideas y notas, y carga la lista de personas de una iglesia solo si su pastor lo pidió. No puede dar accesos, crear ni suspender iglesias.')}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>{tx('Estos permisos los decide la base de datos, no la pantalla. El equipo tiene que ser gente con cuenta en nuestra iglesia.')}</Text>
      </Panel>

      {owner ? (
        <Panel title={tx('Dar acceso a alguien de nuestra iglesia')} hint={tx('Buscá a la persona por su nombre. Tiene que tener cuenta en la app.')}>
          <TextInput value={q} onChangeText={setQ} placeholder={tx('Buscar por nombre')} placeholderTextColor={colors.muted} accessibilityLabel={tx('Buscar por nombre')} autoCorrect={false}
            style={{ height: 42, maxWidth: 420, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bg, fontSize: 14, color: colors.text }} />
          {found.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
              <Avatar name={p.name ?? '?'} size={32} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{p.name}<Text style={{ color: colors.muted }}>{`  ·  ${ROLE_LABEL[p.church_role] ?? p.church_role}`}</Text></Text>
              <Button title={tx('Dar acceso')} icon="plus" variant="outline" small disabled={busy} onPress={() => grant(p.id, p.name)} />
            </View>
          ))}
          {!found.length ? <Text style={{ fontSize: 13, color: colors.muted }}>{tx('No hay nadie con ese nombre que todavía no tenga acceso.')}</Text>
            : !q.trim() && data.candidates.length > found.length ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Hay {n} personas con cuenta. Escribí un nombre para buscar.', { n: data.candidates.length })}</Text> : null}
        </Panel>
      ) : null}

      {owner && data.log.length ? (
        <Panel title={tx('Registro de accesos')} hint={tx('Cada vez que se dio o se sacó un acceso.')}>
          {data.log.map((l, i) => (
            <Text key={`${l.at}-${i}`} style={{ fontSize: 13, color: colors.text }}>{`${fmtDayYear(l.at)} · ${l.action === 'central_staff:grant' ? tx('Se le dio acceso a') : tx('Se le sacó el acceso a')} ${l.who ?? tx('una cuenta que ya no está')}`}</Text>
          ))}
        </Panel>
      ) : null}
      <PrivacyBox startOpen />
    </DeskPage>
  );
}
