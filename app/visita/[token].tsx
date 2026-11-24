// Tarjeta de visita: la página que abre el QR de la puerta. Se usa sin la app y sin cuenta.
// La visita escribe su nombre y su celular, cómo nos conoció y, si quiere, un pedido de oración.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { PhoneField } from '@/components/PhoneField';
import { HEARD_OPTIONS, PRAYER_MAX, nameProblem } from '@/lib/personas';
import { visitCardPublic, visitCardSubmit } from '@/lib/personasApi';
import { formatPhone, phoneProblem } from '@/lib/phone';
import { errorMessage } from '@/lib/supabase';

// Colores propios y fijos (claros): la página la ve gente de afuera, con o sin modo oscuro.
const C = { bg: '#F6F7F5', card: '#FFFFFF', text: '#17201A', muted: '#5F6B63', line: '#E3E7E2', green: '#1F6B45', greenSoft: '#E3F1E8', red: '#B3261E' };

export default function TarjetaDeVisita() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [church, setChurch] = useState<{ church: string; city: string | null; logo: string | null } | null | undefined>(undefined);
  const [form, setForm] = useState({ name: '', phone: '', heard: '', prayer: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    visitCardPublic(token).then(setChurch).catch(() => setChurch(null));
  }, [token]);

  const submit = async () => {
    setErr(null);
    const bad = nameProblem(form.name) ?? phoneProblem(form.phone, true);
    if (bad) return setErr(bad);
    setBusy(true);
    try {
      await visitCardSubmit(token, { name: form.name.trim(), phone: formatPhone(form.phone), heard: form.heard, prayer: form.prayer });
      setSent(true);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  if (church === undefined) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.green} size="large" /></View>;
  if (!church) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30, backgroundColor: C.bg }}>
      <Feather name="alert-circle" size={40} color={C.muted} />
      <Text style={{ fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center' }}>Este código ya no sirve</Text>
      <Text style={{ fontSize: 15, color: C.muted, textAlign: 'center' }}>Pedí ayuda en la entrada. ¡Gracias por venir!</Text>
    </View>
  );

  const label = { fontSize: 14, fontWeight: '700', color: C.muted } as const;
  const input = { minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, fontSize: 17, color: C.text, backgroundColor: C.card } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignSelf: 'stretch', backgroundColor: C.green, paddingTop: 34, paddingBottom: 26, paddingHorizontal: 20, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {church.logo ? <Image source={{ uri: church.logo }} style={{ width: 34, height: 34 }} contentFit="contain" /> : null}
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.92)' }}>{church.church}</Text>
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36, fontWeight: '900', color: '#FFFFFF' }}>{sent ? '¡Gracias por venir!' : '¡Bienvenido!'}</Text>
          {!sent ? <Text style={{ fontSize: 16, lineHeight: 22, color: '#FFFFFF' }}>Qué alegría que estés acá. Dejanos tus datos para conocerte.</Text> : null}
        </View>
      </View>

      <View style={{ width: '100%', maxWidth: 560, padding: 16 }}>
        {sent ? (
          <View style={{ backgroundColor: C.greenSoft, borderRadius: 18, padding: 20, gap: 10, alignItems: 'center' }}>
            <Feather name="check-circle" size={44} color={C.green} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' }}>Ya recibimos tus datos</Text>
            <Text style={{ fontSize: 16, lineHeight: 23, color: C.text, textAlign: 'center' }}>En estos días te vamos a escribir para saludarte. Ya podés cerrar esta página.</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 16, gap: 16, borderWidth: 1, borderColor: C.line }}>
            <View style={{ gap: 6 }}>
              <Text style={label}>Tu nombre y apellido</Text>
              <TextInput value={form.name} onChangeText={(name) => setForm({ ...form, name })} autoComplete="name" autoCapitalize="words" maxLength={80} accessibilityLabel="Tu nombre y apellido" style={input} />
            </View>
            <PhoneField label="Tu celular" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} required />
            <View style={{ gap: 8 }}>
              <Text style={label}>¿Cómo nos conociste?</Text>
              {HEARD_OPTIONS.map((o) => {
                const on = form.heard === o;
                return (
                  <Pressable key={o} onPress={() => setForm({ ...form, heard: on ? '' : o })} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, borderColor: on ? C.green : C.line, backgroundColor: on ? C.greenSoft : C.card }}>
                    <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? C.green : C.muted} />
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: on ? '800' : '500', color: C.text }}>{o}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={label}>¿Podemos orar por algo? <Text style={{ fontWeight: '500' }}>(si querés)</Text></Text>
              <TextInput value={form.prayer} onChangeText={(prayer) => setForm({ ...form, prayer })} multiline maxLength={PRAYER_MAX} accessibilityLabel="Pedido de oración"
                style={[input, { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }]} />
              <Text style={{ fontSize: 12, color: C.muted }}>Solo lo ven el pastor y los líderes.</Text>
            </View>
            {err ? <Text accessibilityRole="alert" style={{ fontSize: 15, fontWeight: '700', color: C.red }}>{err}</Text> : null}
            <Pressable onPress={submit} disabled={busy} accessibilityRole="button"
              style={{ height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, opacity: busy ? 0.6 : 1 }}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF' }}>Enviar</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
