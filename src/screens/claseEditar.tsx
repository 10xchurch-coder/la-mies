// Crear o cambiar una clase de la escuela dominical o un grupo pequeño: nombre, días, hora, lugar y cómo estudian.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, Loading, SectionTitle } from '@/components/ui';
import { listClasses } from '@/lib/api';
import { DAY_KEYS } from '@/lib/groupGuide';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ClassRow } from '@/types';
import { tx } from '@/lib/i18n';

const dayLabel = (d: string) => ({ mon: tx('Lun'), tue: tx('Mar'), wed: tx('Mié'), thu: tx('Jue'), fri: tx('Vie'), sat: tx('Sáb'), sun: tx('Dom') } as Record<string, string>)[d] ?? d;

function Option({ on, icon, title, text, onPress }: { on: boolean; icon: React.ComponentProps<typeof Feather>['name']; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <Card style={[{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, on && { borderColor: colors.green, borderWidth: 2 }]}>
        <Feather name={icon} size={22} color={on ? colors.green : colors.muted} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{title}</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, color: colors.muted }}>{text}</Text>
        </View>
        <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? colors.green : colors.muted} />
      </Card>
    </Pressable>
  );
}

export default function ClaseEditar({ kind }: { kind: 'escuela' | 'grupo' }) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { can, isStaff } = useAuth();
  const grupo = kind === 'grupo';
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [days, setDays] = useState<string[]>(grupo ? ['wed'] : ['sun']);
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [about, setAbout] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [study, setStudy] = useState<'predica' | 'material'>('predica');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    listClasses().then((cs) => {
      const k = cs.find((c) => c.id === id);
      if (k) {
        setName(k.name); setDays(k.days ?? []); setTime(k.meet_time ?? ''); setPlace(k.place ?? ''); setAbout(k.about ?? '');
        setAgeMin(k.age_min != null ? String(k.age_min) : ''); setAgeMax(k.age_max != null ? String(k.age_max) : ''); setStudy(k.study ?? 'predica');
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [id]);

  if (!(isStaff || can('ens.editar'))) {
    return <View style={{ flex: 1 }}><Header title={grupo ? tx('Grupo pequeño') : tx('Clase')} back /><Text style={{ padding: 24, color: colors.text }}>{tx('Solo el pastor o quien arma las clases puede cambiar esto.')}</Text></View>;
  }
  if (!loaded) return <Loading />;

  const toggleDay = (d: string) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));
  const num = (s: string) => (s.trim() && !Number.isNaN(Number(s)) ? Math.max(0, Math.round(Number(s))) : null);

  const save = async () => {
    if (name.trim().length < 2) return Alert.alert(tx('Falta el nombre'), grupo ? tx('Escribí cómo se llama el grupo.') : tx('Escribí cómo se llama la clase.'));
    if (!days.length) return Alert.alert(tx('Faltan los días'), tx('Elegí al menos un día de reunión.'));
    setBusy(true);
    const row: Partial<ClassRow> = {
      name: name.trim(), days, kind, meet_time: time.trim() || null, place: place.trim() || null, about: about.trim() || null,
      age_min: grupo ? null : num(ageMin), age_max: grupo ? null : num(ageMax), study: grupo ? study : 'predica',
    };
    const res = id
      ? await supabase.from('classes').update(row).eq('id', id).select('id').single()
      : await supabase.from('classes').insert({ ...row, sort_order: grupo ? 500 : 200 }).select('id').single();
    setBusy(false);
    if (res.error) return Alert.alert(tx('No se pudo guardar'), errorMessage(res.error));
    const newId = (res.data as { id: string }).id;
    if (id) router.back();
    else router.replace({ pathname: grupo ? '/grupo/[id]' : '/clase/[id]', params: { id: newId } } as never);
  };

  const archive = () => Alert.alert(grupo ? tx('Cerrar el grupo') : tx('Cerrar la clase'),
    tx('Deja de verse en la lista. No se borra nada: la asistencia y las personas quedan guardadas.'), [
      { text: tx('Cancelar'), style: 'cancel' },
      { text: tx('Cerrar'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('classes').update({ active: false }).eq('id', id ?? '');
        if (error) Alert.alert(tx('No se pudo'), errorMessage(error));
        else router.replace((grupo ? '/grupos' : '/clases') as never);
      } },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={id ? (grupo ? tx('Cambiar el grupo') : tx('Cambiar la clase')) : (grupo ? tx('Nuevo grupo pequeño') : tx('Nueva clase'))} back />
      <Screen>
        <Field label={tx('Nombre')} value={name} onChangeText={setName}
          placeholder={grupo ? tx('Ej.: Grupo del barrio Centro') : tx('Ej.: Jóvenes, Adultos, Niños de 6 a 12')} />
        <SectionTitle>{tx('Qué días se reúnen')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DAY_KEYS.map((d) => {
            const on = days.includes(d);
            return (
              <Pressable key={d} onPress={() => toggleDay(d)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ minWidth: 54, paddingHorizontal: 12, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.green : colors.bgSoft }}>
                <Text style={{ fontWeight: '800', color: on ? '#FFF' : colors.text }}>{dayLabel(d)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label={tx('Hora')} hint={tx('(opcional)')} value={time} onChangeText={setTime} placeholder={grupo ? tx('Ej.: 20:00') : tx('Ej.: 10:00')} />
        {grupo ? (
          <Field label={tx('Dónde se reúnen')} hint={tx('(opcional)')} value={place} onChangeText={setPlace} placeholder={tx('Ej.: en una casa del barrio Centro')} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label={tx('Edad desde')} hint={tx('(opcional)')} value={ageMin} onChangeText={setAgeMin} keyboardType="number-pad" style={{ flex: 1 }} />
            <Field label={tx('hasta')} value={ageMax} onChangeText={setAgeMax} keyboardType="number-pad" style={{ flex: 1 }} />
          </View>
        )}
        {grupo ? (
          <>
            <SectionTitle>{tx('Qué estudian')}</SectionTitle>
            <Option on={study === 'predica'} icon="play-circle" title={tx('Repasan la prédica del domingo')}
              text={tx('Lo más simple. El líder abre el grupo y tiene la prédica (video, audio y bosquejo) y las preguntas que preparó el pastor.')}
              onPress={() => setStudy('predica')} />
            <Option on={study === 'material'} icon="book" title={tx('Estudio propio')}
              text={tx('El grupo sigue sus propias lecciones, una por semana. El líder o el pastor las carga.')}
              onPress={() => setStudy('material')} />
          </>
        ) : null}
        <Field label={grupo ? tx('Sobre el grupo') : tx('Sobre la clase')} hint={tx('(opcional)')} value={about} onChangeText={setAbout} multiline
          placeholder={grupo ? tx('Ej.: Para matrimonios jóvenes. Hay lugar para los chicos.') : tx('Ej.: Para jóvenes de 13 a 18 años.')} />
        <Button title={tx('Guardar')} icon="check" onPress={save} loading={busy} />
        {id ? <Button title={grupo ? tx('Cerrar el grupo') : tx('Cerrar la clase')} variant="ghost" onPress={archive} /> : null}
      </Screen>
    </View>
  );
}
