// Cargar o cambiar un turno: fecha, quién, qué tarea y a qué hora llegar.
// Se elige a la persona por su ficha; si usa la app, el lunes le llega el aviso.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { DateChips, PickerModal } from '@/components/Picker';
import { Button, Card, Field, RowLink } from '@/components/ui';
import { listPeople, listProfiles, listServices, ministryPeopleRows } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtDateShort, upcomingDates } from '@/lib/format';
import { colors } from '@/theme';
import type { ChurchService, Contact, Duty, Profile } from '@/types';

export default function TurnoMinisterio() {
  const router = useRouter();
  const { ministry, duty } = useLocalSearchParams<{ ministry: string; duty?: string }>();
  const [services, setServices] = useState<ChurchService[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inMinistry, setInMinistry] = useState<Set<string>>(new Set());
  const [date, setDate] = useState('');
  const [who, setWho] = useState<{ profile?: string; contact?: string } | null>(null);
  const [task, setTask] = useState('');
  const [arrive, setArrive] = useState('');
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [repeat, setRepeat] = useState(1);

  useEffect(() => {
    Promise.all([listServices(), listProfiles(), listPeople(), ministryPeopleRows({ ministryId: ministry })]).then(([s, p, c, mp]) => {
      setServices(s);
      setPeople(p);
      setContacts(c);
      setInMinistry(new Set(mp.map((x) => x.contact_id)));
    }).catch(() => undefined);
    if (duty) {
      supabase.from('duties').select('*').eq('id', duty).maybeSingle().then(({ data }) => {
        const d = data as Duty | null;
        if (!d) return;
        setDate(d.on_date);
        setWho({ profile: d.profile_id ?? undefined, contact: d.contact_id ?? undefined });
        setTask(d.task);
        setArrive(d.arrive_time ?? '');
        setNote(d.note ?? '');
      });
    }
  }, [ministry, duty]);

  const dates = useMemo(() => {
    const dows = [...new Set(services.map((s) => s.dow))];
    const list = upcomingDates(dows.length ? dows : [6, 0], 16);
    return date && !list.includes(date) ? [date, ...list] : list;
  }, [services, date]);

  useEffect(() => {
    if (!date && dates.length) setDate(dates[0]);
  }, [dates, date]);

  const whoContact = who?.contact ? contacts.find((c) => c.id === who.contact) : who?.profile ? contacts.find((c) => c.profile_id === who.profile) : undefined;
  const whoName = whoContact?.name ?? (who?.profile ? people.find((p) => p.id === who.profile)?.display_name : null);
  const whoHasApp = !!(who?.profile || whoContact?.profile_id);

  const save = async () => {
    if (!who || !task.trim() || !date) {
      Alert.alert('Faltan datos', 'Elegí la fecha, la persona y la tarea.');
      return;
    }
    setBusy(true);
    try {
      // La ficha siempre; la cuenta si la persona usa la app (para que le llegue el aviso del lunes).
      const card = whoContact;
      const base = {
        ministry_id: ministry,
        contact_id: card?.id ?? who.contact ?? null,
        profile_id: card?.profile_id ?? who.profile ?? null,
        task: task.trim(), arrive_time: arrive.trim() || null, note: note.trim() || null,
      };
      if (duty) {
        const { error } = await supabase.from('duties').update({ ...base, on_date: date }).eq('id', duty);
        if (error) throw error;
      } else {
        // "Repetir": la misma tarea, el mismo día de la semana, las semanas siguientes.
        const dow = new Date(`${date}T12:00:00`).getDay();
        const sameDow = [date, ...upcomingDates([dow], 60).filter((d) => d > date)].slice(0, repeat);
        const { error } = await supabase.from('duties').insert(sameDow.map((d) => ({ ...base, on_date: d })));
        if (error) throw error;
      }
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!duty) return;
    await supabase.from('duties').delete().eq('id', duty);
    router.back();
  };

  // Primero los del ministerio, después el resto de los miembros y visitas.
  const items = contacts
    .filter((c) => c.status !== 'contact')
    .sort((a, b) => Number(inMinistry.has(b.id)) - Number(inMinistry.has(a.id)) || Number(b.status === 'member') - Number(a.status === 'member') || a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id, title: c.name, photo: c.photo_path,
      subtitle: [inMinistry.has(c.id) ? 'Del ministerio' : null, c.profile_id ? null : 'sin la app'].filter(Boolean).join(' · ') || undefined,
    }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={duty ? 'Cambiar turno' : 'Nuevo turno'} back />
      <Screen>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Fecha</Text>
        <DateChips dates={dates} value={date} onChange={setDate} format={fmtDateShort} />
        <Card style={{ padding: 0 }}>
          <RowLink
            icon="user"
            title={whoName ?? 'Elegir persona'}
            subtitle={!who ? 'Del ministerio o de la iglesia' : whoHasApp ? 'Usa la app: le llega el aviso el lunes' : 'No usa la app: avisale vos'}
            onPress={() => setPicker(true)}
          />
        </Card>
        <Field label="Tarea" placeholder="Ej: recepción en la puerta, café, limpiar baños" value={task} onChangeText={setTask} />
        <Field label="Hora de llegada" hint="(opcional)" placeholder="Ej: 18:00" value={arrive} onChangeText={setArrive} />
        <Field label="Nota" hint="(opcional)" value={note} onChangeText={setNote} multiline />
        {!duty ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Repetir las semanas siguientes</Text>
            <DateChips dates={['1', '2', '4', '8']} value={String(repeat)} onChange={(v) => setRepeat(Number(v))} format={(v) => (v === '1' ? 'Solo esta vez' : `${v} semanas`)} />
          </View>
        ) : null}
        <Button title="Guardar turno" onPress={save} loading={busy} />
        {duty ? <Button title="Borrar turno" variant="danger" onPress={remove} /> : null}
      </Screen>
      <PickerModal visible={picker} title="¿Quién?" items={items} onClose={() => setPicker(false)}
        onPick={(v) => { setPicker(false); if (v) setWho({ contact: v }); }} />
    </View>
  );
}
