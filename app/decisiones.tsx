// Decisiones: una sola pantalla para anotar que alguien fue salvo, se bautizó, se hizo miembro o se reconcilió.
// Al guardar se actualiza la ficha de la persona y se ofrece el paso que sigue (discipulado, seguimiento, certificado).
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Choice, Field, SectionTitle } from '@/components/ui';
import { listProfiles, updateContact } from '@/lib/api';
import { DECISION_KINDS, DECISION_LABEL, nextSteps, parseDay, showDay, type DecisionKind, type NextStep } from '@/lib/personas';
import { discStart, memberClassSet, personChoices, recentDecisions, recordDecision, removeDecision, teacherChoices, type DecisionRow } from '@/lib/personasApi';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Profile } from '@/types';
import { tx } from '@/lib/i18n';

type Choice_ = { id: string; name: string; photo_path: string | null };

export default function Decisiones() {
  const router = useRouter();
  const { persona } = useLocalSearchParams<{ persona?: string }>();
  const { isStaff } = useAuth();
  const [people, setPeople] = useState<Choice_[]>([]);
  const [who, setWho] = useState<Choice_ | null>(null);
  const [kind, setKind] = useState<DecisionKind | null>(null);
  const [day, setDay] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<null | 'person' | 'teacher' | 'followup'>(null);
  const [teachers, setTeachers] = useState<Choice_[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // Después de guardar: la persona, lo que se anotó y los pasos que faltan.
  const [after, setAfter] = useState<{ who: Choice_; kind: DecisionKind; steps: NextStep[] } | null>(null);
  const [recent, setRecent] = useState<DecisionRow[]>([]);

  const loadRecent = useCallback(() => { recentDecisions().then(setRecent).catch(() => undefined); }, []);
  useFocusEffect(loadRecent);
  useEffect(() => {
    personChoices().then((l) => {
      setPeople(l);
      if (persona) setWho((w) => w ?? l.find((p) => p.id === persona) ?? null);
    }).catch(() => undefined);
  }, [persona]);

  // Miembros nuevos: solo los anota el pastor o la secretaría (como en la ficha).
  const kinds = DECISION_KINDS.filter((k) => k !== 'member' || isStaff);

  const save = async () => {
    if (!who) return Alert.alert(tx('Falta la persona'), tx('Tocá “Elegir persona”.'));
    if (!kind) return Alert.alert(tx('Falta la decisión'), tx('Elegí qué decisión tomó.'));
    const on = parseDay(day);
    if (on === undefined) return Alert.alert(tx('Revisá la fecha'), tx('Escribila así: 15/03/2026. Si fue hoy, dejala vacía.'));
    setBusy(true);
    try {
      const state = await recordDecision(who.id, kind, on, note);
      setAfter({ who, kind, steps: nextSteps(kind, state) });
      setKind(null); setDay(''); setNote('');
      if (!persona) setWho(null);
      loadRecent();
    } catch (e) {
      Alert.alert(tx('No se pudo guardar'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const done = (step: NextStep) => setAfter((a) => (a ? { ...a, steps: a.steps.filter((s) => s !== step) } : a));
  const fail = (e: unknown) => Alert.alert(tx('No se pudo'), errorMessage(e));
  const stepButton = (step: NextStep) => {
    if (!after) return null;
    const id = after.who.id;
    switch (step) {
      case 'discipleship':
        return <Button key={step} title={tx('Empezar discipulado')} icon="book-open" small onPress={() => { teacherChoices().then((l) => setTeachers(l.filter((t) => t.id !== id))).catch(() => undefined); setPicker('teacher'); }} />;
      case 'followup':
        return <Button key={step} title={tx('Elegir quién lo sigue')} icon="user-check" variant="outline" small onPress={() => { listProfiles().then(setProfiles).catch(() => undefined); setPicker('followup'); }} />;
      case 'member_class':
        return <Button key={step} title={tx('Anotarlo en la clase de miembros')} icon="users" variant="outline" small onPress={() => { memberClassSet(id, null).then(() => done(step)).catch(fail); }} />;
      case 'certificate_baptism':
        return isStaff ? <Button key={step} title={tx('Imprimir el certificado de bautismo')} icon="printer" variant="outline" small onPress={() => router.push({ pathname: '/certificado/imprimir', params: { id, tipo: 'bautismo' } } as unknown as Href)} /> : null;
      case 'certificate_member':
        return isStaff ? <Button key={step} title={tx('Imprimir el certificado de miembro')} icon="printer" variant="outline" small onPress={() => router.push({ pathname: '/certificado/imprimir', params: { id, tipo: 'miembro' } } as unknown as Href)} /> : null;
      default:
        return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Decisiones')} subtitle={tx('Anotá lo que Dios hizo')} back />
      <Screen>
        {after ? (
          <Card style={{ gap: 10, borderColor: colors.green, borderWidth: 2, backgroundColor: colors.greenSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="check-circle" size={20} color={colors.greenText} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.greenText }}>{tx('Anotado: {name} · {DECISION_LABEL}', { name: after.who.name, DECISION_LABEL: DECISION_LABEL[after.kind].toLowerCase() })}</Text>
            </View>
            {after.steps.length ? <Text style={{ fontSize: 14, color: colors.text }}>{tx('¿Qué sigue?')}</Text> : <Text style={{ fontSize: 14, color: colors.text }}>{tx('Su ficha ya quedó al día.')}</Text>}
            {after.steps.map(stepButton)}
            <Button title={tx('Ver su ficha')} icon="user" variant="ghost" small onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: after.who.id } })} />
          </Card>
        ) : null}

        <Card style={{ gap: 12 }}>
          <SectionTitle>{tx('1. ¿Quién?')}</SectionTitle>
          <Button title={who ? who.name : tx('Elegir persona')} icon={who ? 'user' : 'search'} variant="outline" onPress={() => setPicker('person')} />
          <SectionTitle>{tx('2. ¿Qué decisión tomó?')}</SectionTitle>
          <Choice columns={2} options={kinds.map((k) => ({ value: k, label: DECISION_LABEL[k] }))} value={kind} onChange={setKind} />
          <Field label={tx('3. ¿Qué día?')} hint={tx('(vacío = hoy)')} value={day} onChangeText={setDay} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" maxLength={10} />
          <Field label={tx('Nota')} hint={tx('(si querés)')} value={note} onChangeText={setNote} multiline maxLength={500} placeholder={tx('Ej: después del culto, con su mamá')} />
          <Button title={tx('Guardar')} icon="check" onPress={save} loading={busy} />
        </Card>

        {recent.length ? <SectionTitle>{tx('Últimas decisiones')}</SectionTitle> : null}
        {recent.map((d) => (
          <Card key={d.id} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable style={{ flex: 1, gap: 2 }} accessibilityRole="button" onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: d.contact_id } })}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{d.name}</Text>
              <Text style={{ fontSize: 13, color: colors.text }}>{DECISION_LABEL[d.kind]} · {showDay(d.on_date)}</Text>
              {d.note ? <Text style={{ fontSize: 12, color: colors.muted }}>{d.note}</Text> : null}
            </Pressable>
            {isStaff || d.mine ? (
              <Pressable accessibilityRole="button" accessibilityLabel={tx('Borrar de la lista')} hitSlop={8} style={{ padding: 8 }}
                onPress={() => Alert.alert(tx('¿Borrar de la lista?'), tx('Sale de esta lista. La ficha de la persona no cambia: si la fecha quedó mal, corregila desde su ficha.'), [
                  { text: tx('Cancelar'), style: 'cancel' },
                  { text: tx('Borrar'), style: 'destructive', onPress: () => { removeDecision(d.id).then(loadRecent).catch(fail); } },
                ])}>
                <Feather name="trash-2" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </Card>
        ))}
      </Screen>

      <PickerModal visible={picker === 'person'} title={tx('¿Quién tomó la decisión?')} items={people.map((p) => ({ id: p.id, title: p.name, photo: p.photo_path }))}
        onClose={() => setPicker(null)} onPick={(id) => { setPicker(null); setWho(people.find((p) => p.id === id) ?? null); }} />
      <PickerModal visible={picker === 'teacher'} title={tx('¿Quién le enseña?')} items={teachers.map((t) => ({ id: t.id, title: t.name, photo: t.photo_path }))}
        allowNone noneLabel={tx('Todavía no sé quién')} onClose={() => setPicker(null)}
        onPick={(tid) => { setPicker(null); if (after) discStart(after.who.id, tid).then(() => done('discipleship')).catch(fail); }} />
      <PickerModal visible={picker === 'followup'} title={tx('¿Quién hace el seguimiento?')} items={profiles.map((p) => ({ id: p.id, title: p.display_name }))}
        onClose={() => setPicker(null)}
        onPick={(pid) => { setPicker(null); if (after && pid) updateContact(after.who.id, { follow_up_user_id: pid }).then(() => done('followup')).catch(fail); }} />
    </View>
  );
}
