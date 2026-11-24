// Para el equipo de La Mies (administrador de la red): las iglesias que se anotaron solas.
// Muestra los datos de contacto del pastor, cómo va con los primeros pasos y cuándo se movió por última vez.
// Desde acá se marca "revisada", se suspende y se ayuda con la importación. Nunca se ven las personas de esa iglesia.
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Button, Card, Field, Loading, SectionTitle, Tag } from '@/components/ui';
import { activityLabel, progress, SIGNUP_STATUS_LABEL, SIZES, STEPS, stepState, COUNTRIES } from '@/lib/alta';
import { netSetStatus, netSignups, type NetSignup } from '@/lib/altaData';
import { fmtDayYear } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

const TONE = { pending: 'amber', reviewed: 'green', suspended: 'red' } as const;

export function AltaSignups() {
  const router = useRouter();
  const [rows, setRows] = useState<NetSignup[] | null>(null);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => { netSignups().then(setRows).catch(() => setRows([])); }, []);
  useFocusEffect(load);

  const change = (c: NetSignup, status: NetSignup['status'], why?: string) =>
    netSetStatus(c.church_id, status, why).then(() => { setSuspending(null); setReason(''); load(); }).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));

  const small = { fontSize: 13, color: colors.muted, lineHeight: 18 } as const;
  const text = { fontSize: 13, color: colors.text, lineHeight: 19 } as const;

  return (
    <>
      <SectionTitle>{tx('Iglesias que se anotaron solas')}</SectionTitle>
      {rows === null ? <Loading /> : !rows.length ? <Text style={small}>{tx('Todavía no se anotó ninguna. Cuando una iglesia llene la hoja de "Empezar", aparece acá y te llega un aviso.')}</Text> : null}
      {(rows ?? []).map((c) => {
        const prog = progress(c.steps, c.facts);
        const missing = STEPS.filter((s) => stepState(s.key, c.steps, c.facts) === 'todo').map((s) => s.title);
        const helpOn = !!c.import_help_at && Date.now() - new Date(c.import_help_at).getTime() < 30 * 86400000;
        const wa = c.whatsapp.replace(/\D/g, '');
        return (
          <Card key={c.church_id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ flexShrink: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{c.name}</Text>
              <Tag text={SIGNUP_STATUS_LABEL[c.status]} tone={TONE[c.status]} />
              {helpOn ? <Tag text={tx('Pide ayuda con la lista')} tone="blue" /> : null}
            </View>
            <Text style={small}>
              {tx('{filter} · se anotó el {fmtDayYear}{v1}', { filter: [c.city, c.province, COUNTRIES.find((x) => x.code === c.country)?.label ?? c.country].filter(Boolean).join(', '), fmtDayYear: fmtDayYear(c.created_at), v1: c.size_hint ? tx(' · {label} personas', { label: SIZES.find((s) => s.value === c.size_hint)?.label ?? c.size_hint }) : '' })}
            </Text>
            <Text selectable style={text}>{tx('Pastor: {pastor_name} · {email} · {whatsapp}', { pastor_name: c.pastor_name, email: c.email, whatsapp: c.whatsapp })}</Text>
            <Text style={text}>
              {tx('Primeros pasos: {v1}. {people} personas cargadas, {accounts} {pl}. Último movimiento: {activityLabel}.', { v1: prog.finished ? tx('terminó') : prog.label, people: c.facts.people, accounts: c.facts.accounts, pl: c.facts.accounts === 1 ? tx('cuenta') : tx('cuentas'), activityLabel: activityLabel(c.facts.last_activity) })}
            </Text>
            {missing.length ? <Text style={small}>{tx('Le falta: {missing}', { missing: missing.join(' · ') })}</Text> : null}
            {c.status === 'suspended' ? <Text style={{ fontSize: 13, color: colors.red }}>{tx('Suspendida{v1}. Sus miembros no pueden usar la app.', { v1: c.suspend_reason ? `: ${c.suspend_reason}` : '' })}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {wa.length >= 8 ? <Button title={tx('WhatsApp')} icon="message-circle" variant="outline" small onPress={() => { Linking.openURL(`https://wa.me/${wa}`).catch(() => undefined); }} /> : null}
              <Button title={tx('Correo')} icon="mail" variant="outline" small onPress={() => { Linking.openURL(`mailto:${c.email}`).catch(() => undefined); }} />
              {c.status === 'pending' ? <Button title={tx('Marcar revisada')} icon="check" small onPress={() => change(c, 'reviewed')} /> : null}
              {c.status === 'suspended'
                ? <Button title={tx('Sacar la suspensión')} variant="outline" small onPress={() => change(c, 'reviewed')} />
                : <Button title={tx('Suspender')} variant="danger" small onPress={() => { setSuspending(suspending === c.church_id ? null : c.church_id); setReason(''); }} />}
            </View>
            {suspending === c.church_id ? (
              <View style={{ gap: 8 }}>
                <Field label={tx('Motivo de la suspensión')} hint={tx('(queda anotado; el pastor lo ve al entrar)')} value={reason} onChangeText={setReason} maxLength={300} />
                <Text style={small}>{tx('Al suspender, nadie de esa iglesia puede usar la app hasta que saques la suspensión. No se borra nada.')}</Text>
                <Button title={tx('Suspender esta iglesia')} variant="danger" small disabled={reason.trim().length < 3} onPress={() => change(c, 'suspended', reason.trim())} />
              </View>
            ) : null}
            {helpOn
              ? <Button title={tx('Ayudar con la importación')} icon="upload" small onPress={() => router.push(`/admin/importar?iglesia=${c.church_id}&nombre=${encodeURIComponent(c.name)}&pais=${c.country}` as Href)} />
              : <Text style={small}>{tx('Para cargarle la lista, el pastor tiene que pedirlo desde su app: Primeros pasos → Traé a tu gente → "Que la cargue el equipo de La Mies".')}</Text>}
          </Card>
        );
      })}
    </>
  );
}
