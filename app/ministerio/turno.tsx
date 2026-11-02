// Cargar o cambiar un turno: fecha, quién, qué tarea y a qué hora llegar.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { DateChips, PickerModal } from '@/components/Picker';
import { Button, Card, Field, RowLink } from '@/components/ui';
import { listPeople, listProfiles, listServices, ministryMembers } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtDateShort, upcomingDates } from '@/lib/format';
import { colors } from '@/theme';
import type { ChurchService, Contact, Duty, MinistryMember, Profile } from '@/types';

export default function TurnoMinisterio() {
  const router = useRouter();
  const { ministry, duty } = useLocalSearchParams<{ ministry: string; duty?: string }>();
  const [services, setServices] = useState<ChurchService[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<MinistryMember[]>([]);
  const [date, setDate] = useState('');
  const [who, setWho] = useState<{ profile?: string; contact?: string } | null>(null);
  const [task, setTask] = useState('');
  const [arrive, setArrive] = useState('');
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState<null | 'app' | 'noapp'>(null);
  const [busy, setBusy] = useState(false);
  const [repeat, setRepeat] = useState(1);

  useEffect(() => {
    Promise.all([listServices(), listProfiles(), listPeople(), ministryMembers(ministry)]).then(([s, p, c, mm]) => {
      setServices(s);
      setPeople(p);
      setContacts(c);
      setMembers(mm);
    }).catch(() => undefined);
    if (duty) {
      supabase.from('duties').select('*').eq('id', duty).maybeSingle().then(({ data }) => {
        const d = data as Duty | null;
        if (!d) return;
        setDate(d.on_date);
        setWho(d.profile_id ? { profile: d.profile_id } : { contact: d.contact_id ?? undefined });
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

  const whoName = who?.profile ? people.find((p) => p.id === who.profile)?.display_name : who?.contact ? contacts.find((c) => c.id === who.contact)?.name : null;

  const save = async () => {
    if (!who || !task.trim() || !date) {
      Alert.alert('Faltan datos', 'Elegí la fecha, la persona y la tarea.');
      return;
    }
    setBusy(true);
    try {
      const base = { ministry_id: ministry, profile_id: who.profile ?? null, contact_id: who.contact ?? null, task: task.trim(), arrive_time: arrive.trim() || null, note: note.trim() || null };
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

  const memberIds = new Set(members.map((m) => m.profile_id));
  const appItems = [...people].sort((a, b) => Number(memberIds.has(b.id)) - Number(memberIds.has(a.id)))
    .map((p) => ({ id: p.id, title: p.display_name, subtitle: memberIds.has(p.id) ? 'Del ministerio' : undefined, photo: contacts.find((c) => c.profile_id === p.id)?.photo_path }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={duty ? 'Cambiar turno' : 'Nuevo turno'} back />
      <Screen>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Fecha</Text>
        <DateChips dates={dates} value={date} onChange={setDate} format={fmtDateShort} />
        <Card style={{ padding: 0 }}>
          <RowLink icon="user" title={whoName ?? 'Elegir persona (usa la app)'} subtitle="Le llega el recordatorio el lunes" onPress={() => setPicker('app')} />
          <RowLink icon="user-x" title="Alguien que no usa la app" subtitle="Queda en la lista; avisale vos" onPress={() => setPicker('noapp')} />
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
      <PickerModal visible={picker === 'app'} title="¿Quién?" items={appItems} onClose={() => setPicker(null)} onPick={(v) => { setPicker(null); if (v) setWho({ profile: v }); }} />
      <PickerModal visible={picker === 'noapp'} title="¿Quién?" items={contacts.filter((c) => !c.profile_id && c.status !== 'contact').map((c) => ({ id: c.id, title: c.name, photo: c.photo_path }))}
        onClose={() => setPicker(null)} onPick={(v) => { setPicker(null); if (v) setWho({ contact: v }); }} />
    </View>
  );
}
