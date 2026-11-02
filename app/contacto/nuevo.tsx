// Marcar una casa, paso 1: la persona.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Choice, Field, Segmented } from '@/components/ui';
import { colors } from '@/theme';

export type Step1 = {
  lat: number;
  lng: number;
  road_id: number | null;
  road_name: string;
  side: 1 | -1 | null;
  side_name: string;
  name: string;
  age: number | null;
  sex: 'm' | 'f' | null;
  marital: 'single' | 'married' | 'partner' | 'widowed' | null;
  children: { name: string; age: number | null }[];
  phone: string;
};

export default function NuevoContacto() {
  const router = useRouter();
  const p = useLocalSearchParams<{ lat: string; lng: string; road: string; roadName: string; side: string; sideName: string }>();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'m' | 'f' | null>(null);
  const [marital, setMarital] = useState<Step1['marital']>(null);
  const [hasChildren, setHasChildren] = useState<'no' | 'yes'>('no');
  const [children, setChildren] = useState<{ name: string; age: string }[]>([{ name: '', age: '' }]);
  const [phone, setPhone] = useState('');

  const next = () => {
    const data: Step1 = {
      lat: Number(p.lat),
      lng: Number(p.lng),
      road_id: p.road ? Number(p.road) : null,
      road_name: p.roadName ?? '',
      side: p.side === '1' ? 1 : p.side === '-1' ? -1 : null,
      side_name: p.sideName ?? '',
      name: name.trim(),
      age: age ? Number(age) : null,
      sex,
      marital,
      children: hasChildren === 'yes' ? children.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), age: c.age ? Number(c.age) : null })) : [],
      phone: phone.trim(),
    };
    router.push({ pathname: '/contacto/visita', params: { data: JSON.stringify(data) } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Nuevo contacto" subtitle="Paso 1 de 2 · La persona" back />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={[styles.bar, { backgroundColor: colors.green }]} />
        <View style={[styles.bar, { backgroundColor: colors.border }]} />
      </View>
      <Screen style={{ gap: 16 }}>
        <View style={styles.where}>
          <Feather name="map-pin" size={24} color={colors.greenText} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.greenText }}>Marcado donde estás parado ahora</Text>
            <Text style={{ fontSize: 12, fontWeight: '500', color: colors.greenText }}>
              {p.roadName ? `${p.roadName}${p.sideName ? ` · vereda ${p.sideName}` : ''}` : 'Calle sin identificar todavía'}
            </Text>
          </View>
        </View>

        <Field label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" autoFocus />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field label="Edad" value={age} onChangeText={(v) => setAge(v.replace(/\D/g, ''))} keyboardType="number-pad" style={{ width: 104 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.label}>Sexo</Text>
            <Segmented options={[{ value: 'm', label: 'Hombre' }, { value: 'f', label: 'Mujer' }]} value={(sex ?? '') as 'm' | 'f' | ''} onChange={(v) => setSex(v as 'm' | 'f')} />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Estado civil</Text>
          <Choice
            columns={2}
            options={[{ value: 'single', label: 'Soltero/a' }, { value: 'married', label: 'Casado/a' }, { value: 'partner', label: 'En pareja' }, { value: 'widowed', label: 'Viudo/a' }]}
            value={marital}
            onChange={setMarital}
          />
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.label}>¿Tiene hijos?</Text>
            <Segmented style={{ width: 150 }} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Sí' }]} value={hasChildren} onChange={setHasChildren} />
          </View>
          {hasChildren === 'yes' ? (
            <View style={styles.kids}>
              {children.map((c, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <Field label={`Hijo ${i + 1}`} value={c.name} onChangeText={(v) => setChildren(children.map((x, j) => (j === i ? { ...x, name: v } : x)))} placeholder="Nombre" style={{ flex: 1 }} autoCapitalize="words" />
                  <Field label="Edad" value={c.age} onChangeText={(v) => setChildren(children.map((x, j) => (j === i ? { ...x, age: v.replace(/\D/g, '') } : x)))} keyboardType="number-pad" style={{ width: 84 }} />
                </View>
              ))}
              <Pressable onPress={() => setChildren([...children, { name: '', age: '' }])} accessibilityRole="button" style={styles.addKid}>
                <Feather name="plus" size={18} color={colors.green} />
                <Text style={{ color: colors.green, fontWeight: '700' }}>Agregar otro hijo</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Field label="Teléfono" hint="(si te lo dio)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="376 ..." />
        <Button title="Siguiente: la visita" icon="arrow-right" onPress={next} disabled={!name.trim()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flex: 1, height: 5, borderRadius: 3 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.greenSoft },
  label: { fontSize: 13, fontWeight: '600', color: colors.label },
  kids: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.bgPage },
  addKid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9AA19B' },
});
