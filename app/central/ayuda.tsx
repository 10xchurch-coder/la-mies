// La Mies Central · Pedidos de ayuda: la bandeja con cada "Necesito ayuda" de todas las iglesias.
// Se ve quién pidió (porque nos escribió a nosotros), en qué paso estaba y qué escribió. Estados: abierto, en curso, resuelto.
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Chips, LoadError, useCentralLoad } from '@/components/central/CentralUI';
import { DeskPage, Panel } from '@/components/desk/DeskShell';
import { Button, Field, Loading, Tag } from '@/components/ui';
import { activityLabel } from '@/lib/alta';
import { HELP_STATUS, replyMail, replyWhatsApp, type HelpStatus } from '@/lib/central';
import { centralTeam, helpList, helpNote, helpUpdate, type HelpRequest } from '@/lib/centralData';
import { fmtDayYear, fmtTime, ROLE_LABEL } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

type Filter = 'pending' | HelpStatus | 'all';

export default function CentralHelp() {
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { data, error, reload } = useCentralLoad(async () => {
    const [list, team] = await Promise.all([helpList(), centralTeam()]);
    return { list, team: team.team };
  });
  const [filter, setFilter] = useState<Filter>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (data?.list ?? []).filter((h) => filter === 'all' || (filter === 'pending' ? h.status !== 'done' : h.status === filter)), [data, filter]);
  const count = (s: HelpStatus) => (data?.list ?? []).filter((h) => h.status === s).length;
  const run = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); reload(); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); } finally { setBusy(false); } };

  if (error && !data) return <DeskPage title={tx('Pedidos de ayuda')}><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data) return <DeskPage title={tx('Pedidos de ayuda')}><Loading /></DeskPage>;

  const card = (h: HelpRequest) => {
    const st = HELP_STATUS[h.status];
    const wa = replyWhatsApp(h.asker_phone, h.church, h.step);
    const mail = replyMail(h.asker_email, h.step);
    const open = openId === h.id;
    return (
      <Panel key={h.id} title={h.church} hint={tx('{fmtDayYear} a las {fmtTime} · {activityLabel}', { fmtDayYear: fmtDayYear(h.created_at), fmtTime: fmtTime(h.created_at), activityLabel: activityLabel(h.created_at) })}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Tag text={st.label} tone={st.tone} />
          {h.assignee_name ? <Tag text={tx('Lo atiende {v1}', { v1: h.assignee === me ? tx('vos') : h.assignee_name })} tone="blue" /> : <Tag text={tx('Sin asignar')} />}
          {h.church_id ? <Pressable accessibilityRole="link" onPress={() => router.push(`/central/iglesia/${h.church_id}` as Href)}><Text style={{ fontSize: 13, fontWeight: '700', color: colors.pink }}>{tx('Ver la ficha de la iglesia')}</Text></Pressable> : null}
        </View>
        <Text selectable style={{ fontSize: 14, color: colors.text }}>
          {tx('Pidió: {asker_name}{v1}{v2}{v3}', { asker_name: h.asker_name ?? tx('alguien sin nombre'), v1: h.asker_role ? ` (${ROLE_LABEL[h.asker_role] ?? h.asker_role})` : '', v2: h.asker_phone ? ` · ${h.asker_phone}` : '', v3: h.asker_email ? ` · ${h.asker_email}` : '' })}
        </Text>
        {h.step ? <Text style={{ fontSize: 14, color: colors.text }}><Text style={{ fontWeight: '800' }}>{tx('En qué estaba:')} </Text>{h.step}{h.screen ? `  (${h.screen})` : ''}</Text> : null}
        {h.message ? <Text selectable style={{ fontSize: 15, color: colors.text, lineHeight: 21, backgroundColor: colors.bgSoft, padding: 10, borderRadius: 10 }}>{h.message}</Text>
          : <Text style={{ fontSize: 13, color: colors.muted }}>{tx('No escribió un mensaje: tocó "Necesito ayuda" y la app le abrió WhatsApp o el correo.')}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {wa ? <Button title={tx('Responder por WhatsApp')} icon="message-circle" small onPress={() => { Linking.openURL(wa).catch(() => undefined); }} /> : null}
          {mail ? <Button title={tx('Responder por correo')} icon="mail" variant="outline" small onPress={() => { Linking.openURL(mail).catch(() => undefined); }} /> : null}
          {h.assignee !== me ? <Button title={tx('Lo atiendo yo')} icon="user-check" variant="outline" small disabled={busy} onPress={() => run(() => helpUpdate(h.id, { assignee: me, status: h.status === 'open' ? 'progress' : undefined }))} /> : null}
          {h.status !== 'progress' ? <Button title={tx('Pasar a en curso')} variant="outline" small disabled={busy} onPress={() => run(() => helpUpdate(h.id, { status: 'progress' }))} /> : null}
          {h.status !== 'done' ? <Button title={tx('Marcar resuelto')} icon="check" variant="outline" small disabled={busy} onPress={() => run(() => helpUpdate(h.id, { status: 'done' }))} />
            : <Button title={tx('Volver a abrir')} variant="outline" small disabled={busy} onPress={() => run(() => helpUpdate(h.id, { status: 'open' }))} />}
          <Button title={open ? tx('Cerrar') : tx('Notas y asignar{v1}', { v1: h.notes.length ? ` (${h.notes.length})` : '' })} variant="ghost" small onPress={() => { setOpenId(open ? null : h.id); setNote(''); }} />
        </View>
        {open ? (
          <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{tx('A QUIÉN LE TOCA')}</Text>
            <Chips value={h.assignee ?? 'none'} onChange={(v) => { run(() => helpUpdate(h.id, { assignee: v === 'none' ? null : v })); }}
              options={[{ value: 'none', label: tx('Nadie') }, ...data.team.map((t) => ({ value: t.id, label: t.id === me ? tx('Yo') : t.name }))]} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{tx('NOTAS INTERNAS (la iglesia no las ve)')}</Text>
            {h.notes.map((n) => (
              <View key={n.id} style={{ gap: 1 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>{`${n.author ?? tx('Equipo')} · ${fmtDayYear(n.at)}`}</Text>
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{n.body}</Text>
              </View>
            ))}
            <Field label={tx('Nota nueva')} value={note} onChangeText={setNote} multiline maxLength={2000} placeholder={tx('Le respondí por WhatsApp. Faltaba poner el día de la reunión.')} />
            <Button title={tx('Guardar la nota')} icon="plus" small disabled={busy || note.trim().length < 1} onPress={() => run(async () => { await helpNote(h.id, note.trim()); setNote(''); })} />
          </View>
        ) : null}
      </Panel>
    );
  };

  return (
    <DeskPage title={tx('Pedidos de ayuda')} subtitle={tx('Cada "Necesito ayuda" de las iglesias llega acá. {count} abiertos · {count2} en curso.', { count: count('open'), count2: count('progress') })}>
      <Chips<Filter> value={filter} onChange={setFilter} options={[
        { value: 'pending', label: tx('Sin resolver'), count: count('open') + count('progress') },
        { value: 'open', label: tx('Abiertos'), count: count('open') },
        { value: 'progress', label: tx('En curso'), count: count('progress') },
        { value: 'done', label: tx('Resueltos'), count: count('done') },
        { value: 'all', label: tx('Todos'), count: data.list.length },
      ]} />
      {rows.length ? rows.map(card) : <Text style={{ fontSize: 14, color: colors.muted, paddingVertical: 20 }}>{filter === 'pending' ? tx('No hay pedidos sin resolver. Todo al día.') : tx('No hay pedidos con ese filtro.')}</Text>}
    </DeskPage>
  );
}
