// Una lección del estudio propio de un grupo pequeño: se lee, y los líderes la escriben o la cambian.
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading } from '@/components/ui';
import { classTeachers, getMaterial, listClasses } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ClassRow, Material } from '@/types';
import { tx } from '@/lib/i18n';
import { GuideView } from '@/components/GroupGuide';

export default function GrupoLeccion() {
  const router = useRouter();
  const { id, group, order } = useLocalSearchParams<{ id?: string; group: string; order?: string }>();
  const { profile, isStaff, can } = useAuth();
  const [k, setK] = useState<ClassRow | null>(null);
  const [m, setM] = useState<Material | null | undefined>(id ? undefined : null);
  const [leads, setLeads] = useState(false);
  const [editing, setEditing] = useState(!id);
  const [title, setTitle] = useState('');
  const [num, setNum] = useState(order ?? '1');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listClasses().then((cs) => setK(cs.find((c) => c.id === group) ?? null)).catch(() => undefined);
    classTeachers(group).then((t) => setLeads(isStaff || can('ens.editar') || t.some((x) => x.profile_id === profile?.id))).catch(() => undefined);
    if (id) getMaterial(id).then((x) => {
      setM(x);
      if (x) { setTitle(x.title); setNum(String(x.chapter_order)); setBody(x.body ?? ''); }
    }).catch(() => setM(null));
  }, [id, group, isStaff, can, profile?.id]);

  if (m === undefined) return <Loading />;

  const save = async () => {
    if (title.trim().length < 2) return Alert.alert(tx('Falta el título'), tx('Escribí el título de la lección.'));
    setBusy(true);
    const row = { title: title.trim(), chapter_order: Math.max(1, Number(num) || 1), body: body.trim() || null, series: k?.name ?? tx('Estudio del grupo'), class_id: group };
    const { error } = id ? await supabase.from('materials').update(row).eq('id', id) : await supabase.from('materials').insert(row);
    setBusy(false);
    if (error) return Alert.alert(tx('No se pudo guardar'), errorMessage(error));
    router.back();
  };
  const remove = () => Alert.alert(tx('Borrar la lección'), tx('¿Seguro? Se borra el texto de esta lección.'), [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Borrar'), style: 'destructive', onPress: async () => {
      const { error } = await supabase.from('materials').delete().eq('id', id ?? '');
      if (error) Alert.alert(tx('No se pudo'), errorMessage(error));
      else router.back();
    } },
  ]);

  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={id ? tx('Cambiar la lección') : tx('Nueva lección')} subtitle={k?.name} back />
        <Screen>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label={tx('N.º')} value={num} onChangeText={(t) => setNum(t.replace(/\D/g, ''))} keyboardType="number-pad" style={{ width: 70 }} />
            <Field label={tx('Título')} value={title} onChangeText={setTitle} placeholder={tx('Ej.: La oración que Jesús enseñó')} style={{ flex: 1 }} />
          </View>
          <Field label={tx('La lección')} value={body} onChangeText={setBody} multiline style={{ minHeight: 260 }}
            placeholder={tx('El pasaje, lo que se explica y las preguntas. Podés escribir "# Título" y "- pregunta" para que se vea ordenado.')} />
          <Button title={tx('Guardar')} icon="check" onPress={save} loading={busy} />
          {id ? <Button title={tx('Borrar la lección')} variant="ghost" onPress={remove} /> : null}
        </Screen>
      </View>
    );
  }

  if (!m) return <View style={{ flex: 1 }}><Header title={tx('Lección')} back /><Text style={{ padding: 24, color: colors.text }}>{tx('No se encontró.')}</Text></View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={m.title} subtitle={`${k?.name ?? ''} · ${tx('Lección {n}', { n: m.chapter_order })}`} back />
      <Screen>
        {m.body && /^\s*(#|[-•] )/m.test(m.body) ? <GuideView text={m.body} /> : m.body ? (
          <Card><Text style={{ fontSize: 16, lineHeight: 25, color: colors.text }} selectable>{m.body}</Text></Card>
        ) : <Text style={{ color: colors.muted }}>{tx('Esta lección todavía no tiene texto.')}</Text>}
        {leads ? <Button title={tx('Cambiar la lección')} icon="edit-3" variant="outline" onPress={() => setEditing(true)} /> : null}
      </Screen>
    </View>
  );
}
