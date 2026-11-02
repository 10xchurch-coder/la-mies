// Marcar una casa, paso 2: la visita (evangelio, respuesta, promesa, notas, compartir).
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Choice, Field, Segmented, Toggle } from '@/components/ui';
import { listProfiles } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { colors } from '@/theme';
import type { Profile } from '@/types';
import type { Step1 } from './nuevo';

export default function Visita() {
  const router = useRouter();
  const { data } = useLocalSearchParams<{ data: string }>();
  const step1 = useMemo(() => JSON.parse(data ?? '{}') as Step1, [data]);
  const { profile, group, church } = useAuth();
  const outing = useOuting();
  const [gospel, setGospel] = useState<'yes' | 'no'>('yes');
  const [interest, setInterest] = useState<'very' | 'some' | 'little' | 'none'>('some');
  const [promise, setPromise] = useState<'none' | 'sat' | 'sun'>('none');
  const [pickup, setPickup] = useState(false);
  const [pickupTime, setPickupTime] = useState('');
  const [notes, setNotes] = useState('');
  const [share, setShare] = useState<'group' | 'me' | 'custom'>(profile?.share_default === 'me' ? 'me' : 'group');
  const [people, setPeople] = useState<Profile[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (share === 'custom' && !people.length) listProfiles().then(setPeople).catch(() => undefined);
  }, [share, people.length]);

  const save = async () => {
    setBusy(true);
    try {
      const { data: c, error } = await supabase
        .from('contacts')
        .insert({
          name: step1.name,
          age: step1.age,
          sex: step1.sex,
          marital: step1.marital,
          phone: step1.phone || null,
          lat: step1.lat,
          lng: step1.lng,
          address_hint: step1.road_name ? `${step1.road_name}${step1.side_name ? ` · vereda ${step1.side_name}` : ''}` : null,
          road_id: step1.road_id,
          side: step1.side,
          interest,
          promise_day: promise === 'none' ? null : promise,
          pickup: promise !== 'none' && pickup,
          pickup_time: promise !== 'none' && pickup ? pickupTime || null : null,
          gospel_presented: gospel === 'yes',
          share_mode: share,
          session_id: outing.active?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      const contactId = (c as { id: string }).id;
      if (step1.children.length) {
        const { error: e2 } = await supabase.from('contact_children').insert(step1.children.map((k) => ({ contact_id: contactId, name: k.name, age: k.age })));
        if (e2) throw e2;
      }
      const { error: e3 } = await supabase.from('contact_visits').insert({
        contact_id: contactId,
        session_id: outing.active?.id ?? null,
        note: notes.trim() || null,
        gospel_presented: gospel === 'yes',
        promise_day: promise === 'none' ? null : promise,
      });
      if (e3) throw e3;
      if (share === 'custom' && chosen.length) {
        const { error: e4 } = await supabase.from('contact_shares').insert(chosen.map((uid) => ({ contact_id: contactId, user_id: uid })));
        if (e4) throw e4;
      }
      router.dismissAll();
      router.replace(outing.active ? '/salida' : '/(tabs)/personas');
    } catch (e) {
      Alert.alert('No se pudo guardar', `${errorMessage(e)}\n\nSi no tenés señal, anotá los datos y cargalos cuando vuelva.`);
    } finally {
      setBusy(false);
    }
  };

  const groupWord = church?.grouping === 'bus_routes' ? 'colectivo' : 'grupo';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={`${step1.name}${step1.age ? `, ${step1.age}` : ''}`} subtitle="Paso 2 de 2 · La visita" back />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={[styles.bar, { backgroundColor: colors.green }]} />
        <View style={[styles.bar, { backgroundColor: colors.green }]} />
      </View>
      <Screen style={{ gap: 18 }}>
        <View style={styles.rowQ}>
          <Text style={styles.q}>¿Le presentaste el evangelio?</Text>
          <Segmented style={{ width: 150 }} options={[{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }]} value={gospel} onChange={setGospel} />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>¿Cómo respondió?</Text>
          <Choice
            columns={2}
            options={[{ value: 'very', label: 'Muy interesado' }, { value: 'some', label: 'Interesado' }, { value: 'little', label: 'Poco interés' }, { value: 'none', label: 'No volver' }]}
            value={interest}
            onChange={setInterest}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>¿Se comprometió a venir a la iglesia?</Text>
          <Choice columns={3} options={[{ value: 'none', label: 'Todavía no' }, { value: 'sat', label: 'Sábado' }, { value: 'sun', label: 'Domingo' }]} value={promise} onChange={setPromise} />
          {promise !== 'none' ? (
            <View style={styles.pickup}>
              <View style={{ flex: 1 }}>
                <Toggle label={`Pasarlo a buscar con el ${groupWord}`} value={pickup} onChange={setPickup} />
              </View>
              {pickup ? <Field label="Hora" value={pickupTime} onChangeText={setPickupTime} placeholder="14:30" style={{ width: 90 }} /> : null}
            </View>
          ) : null}
        </View>

        <Field label="Notas" value={notes} onChangeText={setNotes} multiline placeholder="Vive con la mamá. Escuchó todo el plan de salvación…" />

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Compartir este contacto con</Text>
          <Choice
            options={[
              { value: 'group', label: group ? `Todo mi ${groupWord} (${group.name})` : `Toda la iglesia` },
              { value: 'me', label: 'Solo yo, por ahora' },
              { value: 'custom', label: 'Elegir personas' },
            ]}
            value={share}
            onChange={setShare}
          />
          {share === 'custom' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {people
                .filter((x) => x.id !== profile?.id)
                .map((x) => {
                  const on = chosen.includes(x.id);
                  return (
                    <Pressable
                      key={x.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setChosen((cur) => (on ? cur.filter((id) => id !== x.id) : [...cur, x.id]))}
                      style={[styles.person, on && styles.personOn]}
                    >
                      <Text style={{ fontSize: 14, fontWeight: on ? '700' : '600', color: on ? colors.greenText : colors.text }}>{x.display_name}</Text>
                    </Pressable>
                  );
                })}
            </View>
          ) : null}
          {share === 'custom' && chosen.length ? (
            <Text style={{ fontSize: 12, color: colors.muted }}>Compartido con: {people.filter((x) => chosen.includes(x.id)).map((x) => x.display_name).join(', ')}</Text>
          ) : null}
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Los administradores de la iglesia ven todos los contactos, sin importar esta opción.</Text>
        </View>

        <Button title="Guardar contacto" onPress={save} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flex: 1, height: 5, borderRadius: 3 },
  rowQ: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  q: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.label },
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgPage },
  person: { height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: colors.input, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  personOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
});
