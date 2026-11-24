// La Mies Central · Ideas y recomendaciones: lo que los pastores y administradores le mandan a La Mies desde "Enviar una idea a La Mies".
// No es la caja de sugerencias de cada iglesia: esa es privada de cada una y acá no se ve.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Chips, LoadError, useCentralLoad } from '@/components/central/CentralUI';
import { DeskPage, Panel } from '@/components/desk/DeskShell';
import { Button, Field, Loading, Tag } from '@/components/ui';
import { IDEA_STATUS, type IdeaStatus } from '@/lib/central';
import { ideasList, ideaUpdate, type Idea } from '@/lib/centralData';
import { fmtDayYear } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

const ORDER: IdeaStatus[] = ['new', 'seen', 'planned', 'done', 'no'];

export default function CentralIdeas() {
  const router = useRouter();
  const { data, error, reload } = useCentralLoad(ideasList);
  const [filter, setFilter] = useState<'all' | IdeaStatus>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [teamNote, setTeamNote] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (data ?? []).filter((i) => filter === 'all' || i.status === filter), [data, filter]);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); reload(); } catch (e) { Alert.alert(tx('No se pudo'), errorMessage(e)); } finally { setBusy(false); } };

  if (error && !data) return <DeskPage title={tx('Ideas para La Mies')}><LoadError text={error} onRetry={reload} /></DeskPage>;
  if (!data) return <DeskPage title={tx('Ideas para La Mies')}><Loading /></DeskPage>;

  const card = (i: Idea) => {
    const st = IDEA_STATUS[i.status];
    const open = openId === i.id;
    return (
      <Panel key={i.id} title={i.church} hint={`${i.author_name ?? tx('Pastor o administrador')} · ${fmtDayYear(i.created_at)}`}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tag text={st.label} tone={st.tone} />
          <Pressable accessibilityRole="link" onPress={() => router.push(`/central/iglesia/${i.church_id}` as Href)}><Text style={{ fontSize: 13, fontWeight: '700', color: colors.pink }}>{tx('Ver la ficha de la iglesia')}</Text></Pressable>
        </View>
        <Text selectable style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>{i.body}</Text>
        {i.reply ? <Text style={{ fontSize: 13, color: colors.text }}><Text style={{ fontWeight: '800' }}>{tx('Le respondimos:')} </Text>{i.reply}</Text> : null}
        {i.team_note ? <Text style={{ fontSize: 13, color: colors.muted }}><Text style={{ fontWeight: '800' }}>{tx('Nota del equipo:')} </Text>{i.team_note}</Text> : null}
        <Chips<IdeaStatus> value={i.status} onChange={(v) => { run(() => ideaUpdate(i.id, { status: v })); }} options={ORDER.map((s) => ({ value: s, label: IDEA_STATUS[s].label }))} />
        <View style={{ flexDirection: 'row' }}>
          <Button title={open ? tx('Cerrar') : tx('Responder o anotar')} variant="ghost" small onPress={() => { setOpenId(open ? null : i.id); setReply(i.reply ?? ''); setTeamNote(i.team_note ?? ''); }} />
        </View>
        {open ? (
          <View style={{ gap: 10 }}>
            <Field label={tx('Respuesta para la iglesia')} hint={tx('(la ve quien mandó la idea, y le llega un aviso)')} value={reply} onChangeText={setReply} multiline maxLength={1000} placeholder={tx('Gracias por la idea. La anotamos para más adelante.')} />
            <Field label={tx('Nota del equipo')} hint={tx('(solo la ve el equipo de La Mies)')} value={teamNote} onChangeText={setTeamNote} multiline maxLength={1000} />
            <Button title={tx('Guardar')} icon="check" small disabled={busy} onPress={() => run(async () => { await ideaUpdate(i.id, { reply, teamNote, status: i.status === 'new' ? 'seen' : undefined }); setOpenId(null); })} />
          </View>
        ) : null}
      </Panel>
    );
  };

  return (
    <DeskPage title={tx('Ideas para La Mies')} subtitle={tx('Lo que los pastores nos mandan para mejorar la app. La caja de sugerencias de cada iglesia es privada y acá no se ve.')}>
      <Chips<'all' | IdeaStatus> value={filter} onChange={setFilter}
        options={[{ value: 'all', label: tx('Todas'), count: data.length }, ...ORDER.map((s) => ({ value: s, label: IDEA_STATUS[s].label, count: data.filter((i) => i.status === s).length }))]} />
      {rows.length ? rows.map(card) : <Text style={{ fontSize: 14, color: colors.muted, paddingVertical: 20 }}>{tx('Todavía no llegó ninguna idea. Los pastores las mandan desde Administración → Pedir ayuda a La Mies.')}</Text>}
    </DeskPage>
  );
}
