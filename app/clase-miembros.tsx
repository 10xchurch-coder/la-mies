// Clase de miembros: quiénes la están haciendo, qué lecciones hizo cada uno y el último paso que marca el pastor.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Empty, Loading, SectionTitle, Tag } from '@/components/ui';
import { DEFAULT_MEMBER_FINAL, lessonProgress, memberLessons, showDay } from '@/lib/personas';
import {
  memberClassFinal, memberClassList, memberClassRemove, memberClassSet, peopleSettings, personChoices, recordDecision, type MemberClassRow, type PeopleSettings,
} from '@/lib/personasApi';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export default function ClaseMiembros() {
  const router = useRouter();
  const { isStaff, isLeader } = useAuth();
  const [rows, setRows] = useState<MemberClassRow[] | null>(null);
  const [cfg, setCfg] = useState<PeopleSettings | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string; photo_path: string | null; status: string }[]>([]);
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => {
    memberClassList().then(setRows).catch(() => setRows((r) => r ?? []));
    peopleSettings().then(setCfg).catch(() => undefined);
  }, []);
  useFocusEffect(load);
  const fail = (e: unknown) => Alert.alert(tx('No se pudo'), errorMessage(e));

  const names = memberLessons(cfg?.member_lessons);
  const finalLabel = cfg?.member_final?.trim() || tx(DEFAULT_MEMBER_FINAL);
  const doing = (rows ?? []).filter((r) => !r.final_on);
  const finished = (rows ?? []).filter((r) => r.final_on);

  const markFinal = (r: MemberClassRow) => {
    Alert.alert(`${finalLabel}`, tx('¿Marcamos este paso para {name} con la fecha de hoy?', { name: r.name }), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Sí'), onPress: () => {
        memberClassFinal(r.id).then(() => {
          load();
          if (r.status === 'member') return;
          // El paso final suele ser recibirlo como miembro: se ofrece dejar su ficha al día.
          Alert.alert(tx('¿Ya es miembro?'), tx('Si querés, {name} queda como miembro de la iglesia desde hoy.', { name: r.name }), [
            { text: tx('Todavía no'), style: 'cancel' },
            { text: tx('Sí, es miembro'), onPress: () => { recordDecision(r.id, 'member', null, '').then(load).catch(fail); } },
          ]);
        }).catch(fail);
      } },
    ]);
  };

  const card = (r: MemberClassRow) => {
    const p = lessonProgress(r.done, names.length);
    return (
      <Card key={r.id} style={{ padding: 12, gap: 10 }}>
        <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.id } })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Face name={r.name} path={r.photo_path} size={44} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{r.name}</Text>
            <View style={{ flexDirection: 'row' }}>
              <Tag text={r.final_on ? `${finalLabel} · ${showDay(r.final_on)}` : tx('{done} de {n} lecciones', { done: p.done, n: names.length })} tone={r.final_on ? 'green' : p.complete ? 'amber' : 'blue'} />
            </View>
          </View>
        </Pressable>
        {!r.final_on ? (
          <>
            {names.map((n, i) => {
              const on = !!r.done?.[String(i + 1)];
              return (
                <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${n}: ${on ? tx('hecha') : tx('sin hacer')}`}
                  onPress={() => { memberClassSet(r.id, i + 1, !on).then(load).catch(fail); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: on ? colors.greenSoft : colors.bgSoft }}>
                  <Feather name={on ? 'check-square' : 'square'} size={20} color={on ? colors.greenText : colors.muted} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: on ? '700' : '500', color: on ? colors.greenText : colors.text }}>{i + 1}. {n}</Text>
                  {on ? <Text style={{ fontSize: 12, color: colors.greenText }}>{showDay(r.done[String(i + 1)]).slice(0, 5)}</Text> : null}
                </Pressable>
              );
            })}
            {isStaff ? (
              <Button title={tx('Último paso: {finalLabel}', { finalLabel })} icon="award" small variant={p.complete ? 'primary' : 'outline'} onPress={() => markFinal(r)} />
            ) : p.complete ? <Text style={{ fontSize: 12, color: colors.muted }}>{tx('Terminó las lecciones. Falta el último paso, que lo marca el pastor: {finalLabel}.', { finalLabel })}</Text> : null}
            {isStaff ? (
              <Button title={tx('Sacar de la clase')} variant="ghost" small onPress={() => Alert.alert(tx('¿Sacar de la clase?'), tx('Se borra lo anotado de {name} en esta clase. Su ficha no cambia.', { name: r.name }), [
                { text: tx('Cancelar'), style: 'cancel' },
                { text: tx('Sacar'), style: 'destructive', onPress: () => { memberClassRemove(r.id).then(load).catch(fail); } },
              ])} />
            ) : null}
          </>
        ) : isStaff ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {r.status === 'member' ? <Button title={tx('Certificado')} icon="printer" variant="outline" small style={{ flex: 1 }} onPress={() => router.push({ pathname: '/certificado/imprimir', params: { id: r.id, tipo: 'miembro' } } as unknown as Href)} /> : null}
            <Button title={tx('Deshacer el último paso')} variant="ghost" small style={{ flex: 1 }} onPress={() => { memberClassFinal(r.id, true).then(load).catch(fail); }} />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Clase de miembros')} subtitle={rows ? tx('{n} haciendo la clase · {n2} terminaron', { n: doing.length, n2: finished.length }) : undefined} back />
      <Screen>
        {isLeader ? <Button title={tx('Anotar a alguien en la clase')} icon="plus" onPress={() => { personChoices().then(setPeople).catch(() => undefined); setPicking(true); }} /> : null}
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="users" title={tx('Nadie está en la clase de miembros')} text={tx('Tocá “Anotar a alguien en la clase” para empezar.')} /> : null}
        {doing.map(card)}
        {finished.length ? <SectionTitle>{tx('Terminaron')}</SectionTitle> : null}
        {finished.map(card)}
        {isStaff ? <Button title={tx('Cambiar las lecciones y el último paso')} icon="edit-2" variant="ghost" small onPress={() => router.push({ pathname: '/discipulado/lecciones', params: { de: 'miembros' } } as unknown as Href)} /> : null}
      </Screen>
      <PickerModal visible={picking} title={tx('¿Quién empieza la clase?')} onClose={() => setPicking(false)}
        items={people.filter((p) => !(rows ?? []).some((r) => r.id === p.id)).map((p) => ({ id: p.id, title: p.name, photo: p.photo_path }))}
        onPick={(id) => { setPicking(false); if (id) memberClassSet(id, null).then(load).catch(fail); }} />
    </View>
  );
}
