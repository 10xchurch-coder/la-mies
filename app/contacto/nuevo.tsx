// Marcar una casa: todo en una pantalla.
// Arriba lo rápido (nombre, ¿evangelio?, ¿prometió venir?, nota). Abajo, si hay tiempo, el resto de los datos.
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Choice, Field, Segmented, Toggle } from '@/components/ui';
import { listProfiles } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useOuting } from '@/store/outing';
import { colors, themed } from '@/theme';
import type { Profile } from '@/types';

type Marital = 'single' | 'married' | 'partner' | 'widowed' | null;

/** Casilla grande para marcar con el pulgar. */
function BigCheck({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon: React.ComponentProps<typeof Feather>['name'] }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={[styles.check, on && styles.checkOn]}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <Feather name="check" size={18} color="#FFFFFF" /> : null}</View>
      <Feather name={icon} size={16} color={on ? colors.greenText : colors.muted} />
      <Text style={[styles.checkText, on && { color: colors.greenText }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export default function NuevoContacto() {
  const router = useRouter();
  const p = useLocalSearchParams<{ lat: string; lng: string; road: string; roadName: string; side: string; sideName: string }>();
  const { profile, group, church } = useAuth();
  const outing = useOuting();

  const [name, setName] = useState('');
  const [gospel, setGospel] = useState(false);
  const [promised, setPromised] = useState(false);
  const [promiseDay, setPromiseDay] = useState<'sat' | 'sun'>('sun');
  const [pickup, setPickup] = useState(false);
  const [pickupTime, setPickupTime] = useState('');
  const [notes, setNotes] = useState('');

  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'m' | 'f' | null>(null);
  const [marital, setMarital] = useState<Marital>(null);
  const [hasChildren, setHasChildren] = useState<'no' | 'yes'>('no');
  const [children, setChildren] = useState<{ name: string; age: string }[]>([{ name: '', age: '' }]);
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState<'very' | 'some' | 'little' | 'none'>('some');
  const [share, setShare] = useState<'group' | 'me' | 'custom'>(profile?.share_default === 'me' ? 'me' : 'group');
  const [people, setPeople] = useState<Profile[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (share === 'custom' && !people.length) listProfiles().then(setPeople).catch(() => undefined);
  }, [share, people.length]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const day = promised ? promiseDay : null;
      const { data: c, error } = await supabase
        .from('contacts')
        .insert({
          name: name.trim(),
          age: age ? Number(age) : null,
          sex,
          marital,
          phone: phone.trim() || null,
          lat: Number(p.lat),
          lng: Number(p.lng),
          address_hint: p.roadName ? `${p.roadName}${p.sideName ? ` · vereda ${p.sideName}` : ''}` : null,
          road_id: p.road ? Number(p.road) : null,
          side: p.side === '1' ? 1 : p.side === '-1' ? -1 : null,
          interest,
          promise_day: day,
          pickup: !!day && pickup,
          pickup_time: day && pickup ? pickupTime || null : null,
          gospel_presented: gospel,
          share_mode: share,
          session_id: outing.active?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      const contactId = (c as { id: string }).id;
      const kids = hasChildren === 'yes' ? children.filter((k) => k.name.trim()).map((k) => ({ contact_id: contactId, name: k.name.trim(), age: k.age ? Number(k.age) : null })) : [];
      if (kids.length) {
        const { error: e2 } = await supabase.from('contact_children').insert(kids);
        if (e2) throw e2;
      }
      const { error: e3 } = await supabase.from('contact_visits').insert({
        contact_id: contactId,
        session_id: outing.active?.id ?? null,
        note: notes.trim() || null,
        gospel_presented: gospel,
        promise_day: day,
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

  const gw = church?.grouping === 'bus_routes' ? 'ruta' : 'grupo';
  const art = church?.grouping === 'bus_routes' ? 'la' : 'el';
  const todo = church?.grouping === 'bus_routes' ? 'Toda' : 'Todo';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Nuevo contacto" subtitle={p.roadName ? `${p.roadName}${p.sideName ? ` · vereda ${p.sideName}` : ''}` : 'Marcado donde estás parado'} back />
      <Screen style={{ gap: 14 }}>
        <Field label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" autoFocus />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <BigCheck label="Le presenté el evangelio" icon="book-open" on={gospel} onPress={() => setGospel(!gospel)} />
          <BigCheck label="Prometió venir" icon="calendar" on={promised} onPress={() => setPromised(!promised)} />
        </View>
        {promised ? (
          <View style={styles.promise}>
            <Segmented options={[{ value: 'sat', label: 'Sábado' }, { value: 'sun', label: 'Domingo' }]} value={promiseDay} onChange={setPromiseDay} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Toggle label={`Pasarlo a buscar con ${art} ${gw}`} value={pickup} onChange={setPickup} />
              </View>
              {pickup ? <Field label="Hora" value={pickupTime} onChangeText={setPickupTime} placeholder="14:30" style={{ width: 90 }} /> : null}
            </View>
          </View>
        ) : null}

        <Field label="Nota rápida" value={notes} onChangeText={setNotes} multiline placeholder="Vive con la mamá. Escuchó todo el plan de salvación…" />

        <Button title="Guardar contacto" onPress={save} loading={busy} disabled={!name.trim()} />

        <Text style={styles.more}>Más datos (opcional)</Text>
        <Field label="Teléfono" hint="(si te lo dio)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="376 ..." />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Edad" value={age} onChangeText={(v) => setAge(v.replace(/\D/g, ''))} keyboardType="number-pad" style={{ width: 104 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.label}>Sexo</Text>
            <Segmented options={[{ value: 'm', label: 'Hombre' }, { value: 'f', label: 'Mujer' }]} value={sex ?? ('' as 'm')} onChange={setSex} />
          </View>
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
          <Text style={styles.label}>Estado civil</Text>
          <Choice
            columns={2}
            options={[{ value: 'single', label: 'Soltero/a' }, { value: 'married', label: 'Casado/a' }, { value: 'partner', label: 'En pareja' }, { value: 'widowed', label: 'Viudo/a' }]}
            value={(marital ?? '') as 'single'}
            onChange={(v) => setMarital(v)}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>¿Tiene hijos?</Text>
          <Segmented options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Sí' }]} value={hasChildren} onChange={setHasChildren} />
          {hasChildren === 'yes' ? (
            <View style={styles.kids}>
              {children.map((c, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <Field label={`Hijo ${i + 1}`} value={c.name} onChangeText={(v) => setChildren(children.map((x, j) => (j === i ? { ...x, name: v } : x)))} placeholder="Nombre" style={{ flex: 1 }} autoCapitalize="words" />
                  <Field label="Edad" value={c.age} onChangeText={(v) => setChildren(children.map((x, j) => (j === i ? { ...x, age: v.replace(/\D/g, '') } : x)))} keyboardType="number-pad" style={{ width: 84 }} />
                </View>
              ))}
              <Pressable onPress={() => setChildren([...children, { name: '', age: '' }])} style={styles.addKid} accessibilityRole="button">
                <Feather name="plus" size={16} color={colors.muted} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.muted }}>Agregar otro</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Compartir este contacto con</Text>
          <Choice
            options={[
              { value: 'group', label: group ? `${todo} mi ${gw} (${group.name})` : 'Toda la iglesia' },
              { value: 'me', label: 'Solo yo, por ahora' },
              { value: 'custom', label: 'Elegir personas' },
            ]}
            value={share}
            onChange={setShare}
          />
          {share === 'custom' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {people.filter((x) => x.id !== profile?.id).map((x) => {
                const on = chosen.includes(x.id);
                return (
                  <Pressable key={x.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setChosen((cur) => (on ? cur.filter((id) => id !== x.id) : [...cur, x.id]))} style={[styles.person, on && styles.personOn]}>
                    <Text style={{ fontSize: 14, fontWeight: on ? '700' : '600', color: on ? colors.greenText : colors.text }}>{x.display_name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Los administradores de la iglesia ven todos los contactos, sin importar esta opción.</Text>
        </View>
        <Button title="Guardar contacto" onPress={save} loading={busy} disabled={!name.trim()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.input, backgroundColor: colors.bg },
  checkOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.green, borderColor: colors.green },
  checkText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  promise: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: colors.bgPage },
  more: { marginTop: 8, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.label },
  kids: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.bgPage },
  addKid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9AA19B' },
  person: { height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: colors.input, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  personOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
}));
