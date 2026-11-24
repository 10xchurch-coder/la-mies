// Reuniones de la iglesia (para la asistencia). "Cuenta para la fidelidad" = culto principal.
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Field, SectionTitle, Toggle } from '@/components/ui';
import { listAllServices } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { dayName } from '@/lib/format';
import { colors } from '@/theme';
import type { ChurchService } from '@/types';
import { tx } from '@/lib/i18n';

export default function Reuniones() {
  const [rows, setRows] = useState<ChurchService[]>([]);
  const [name, setName] = useState('');
  const [dow, setDow] = useState('6');
  const [time, setTime] = useState('19:00');
  const [main, setMain] = useState(true);

  const load = useCallback(() => {
    listAllServices().then(setRows).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const patch = async (id: string, p: Partial<ChurchService>) => {
    const { error } = await supabase.from('church_services').update(p).eq('id', id);
    if (error) Alert.alert(tx('No se pudo'), errorMessage(error));
    load();
  };

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from('church_services').insert({ name: name.trim(), dow: Number(dow), time: time.trim() || '10:00', main, sort_order: (rows.length + 1) * 10 });
    if (error) Alert.alert(tx('No se pudo'), errorMessage(error));
    else {
      setName('');
      load();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Reuniones')} subtitle={tx('Las que aparecen al tomar asistencia')} back />
      <Screen>
        {rows.map((s) => (
          <Card key={s.id} style={{ gap: 4, opacity: s.active ? 1 : 0.5 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{s.name}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{dayName(s.dow)} {s.time}</Text>
            <Toggle label={tx('Cuenta para la fidelidad')} hint={tx('Los cultos principales. Jóvenes u oración, mejor no.')} value={s.main} onChange={(v) => patch(s.id, { main: v })} />
            <Toggle label={tx('Activa')} value={s.active} onChange={(v) => patch(s.id, { active: v })} />
          </Card>
        ))}
        <SectionTitle>{tx('Agregar reunión')}</SectionTitle>
        <Card style={{ gap: 10 }}>
          <Field label={tx('Nombre')} placeholder={tx('Ej: Culto del miércoles')} value={name} onChangeText={setName} />
          <Choice options={[0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: dayName(d) }))} value={dow} onChange={setDow} />
          <Field label={tx('Hora')} value={time} onChangeText={setTime} placeholder="19:00" />
          <Toggle label={tx('Cuenta para la fidelidad')} value={main} onChange={setMain} />
          <Button title={tx('Agregar')} onPress={add} disabled={!name.trim()} />
        </Card>
      </Screen>
    </View>
  );
}
