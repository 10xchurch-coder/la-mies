// Entrada y retiro de los chicos (guardería y clases): al dejarlo se da un código; solo con ese código se retira.
// Al registrar la entrada también se le toma la asistencia.
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Button, Card, Choice, Field, Loading, SectionTitle, Tag } from '@/components/ui';
import { checkInChild, checkOutChild, checkinsToday, searchPeople, type CheckinRow } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';

const ROOMS = ['Guardería (0 a 2)', 'Niños (2 a 6)', 'Clase de niños (6 a 12)'];

export default function Ninos() {
  const [rows, setRows] = useState<CheckinRow[] | null>(null);
  const [room, setRoom] = useState(ROOMS[0]);
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState<{ id: string; name: string; photo_path: string | null }[]>([]);
  const [brought, setBrought] = useState('');
  const [lastCode, setLastCode] = useState<{ name: string; code: string } | null>(null);
  const [outCode, setOutCode] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => { checkinsToday().then(setRows).catch((e) => { setRows([]); Alert.alert('No se pudo', errorMessage(e)); }); }, []);
  useFocusEffect(load);

  const onQ = (v: string) => {
    setQ(v);
    if (t.current) clearTimeout(t.current);
    if (v.trim().length < 2) { setSugg([]); return; }
    t.current = setTimeout(() => searchPeople(v.trim()).then((r) => setSugg(r.slice(0, 6))).catch(() => setSugg([])), 250);
  };

  const checkIn = async (p: { id: string; name: string }) => {
    try {
      const code = await checkInChild(p.id, room, brought.trim() || null);
      setLastCode({ name: p.name, code });
      setQ(''); setSugg([]);
      load();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    }
  };

  const checkOut = async () => {
    const code = outCode.trim();
    if (!/^\d{4}$/.test(code)) { Alert.alert('El código tiene 4 números'); return; }
    try {
      const out = await checkOutChild(code);
      setOutCode('');
      if (!out.length) Alert.alert('Ese código no corresponde', 'Revisá el número. No se entrega a nadie sin el código correcto.');
      else Alert.alert('Puede retirarlo', out.map((x) => x.name).join(', '));
      load();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    }
  };

  const inside = (rows ?? []).filter((r) => !r.out_at);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Entrada de los chicos" subtitle={rows ? `${inside.length} adentro ahora` : undefined} back />
      <Screen>
        <SectionTitle>Entrada</SectionTitle>
        <Choice columns={1} options={ROOMS.map((r) => ({ value: r, label: r }))} value={room} onChange={setRoom} />
        <Field label="Quién lo trae" hint="(opcional)" value={brought} onChangeText={setBrought} placeholder="Su mamá, su abuela…" />
        <Field label="Nombre del chico" value={q} onChangeText={onQ} placeholder="Buscar" autoCapitalize="words" />
        {sugg.length ? (
          <Card style={{ padding: 0 }}>
            {sugg.map((p, i) => (
              <Pressable key={p.id} onPress={() => checkIn(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Face name={p.name} path={p.photo_path} size={32} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{p.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.green }}>Entra</Text>
              </Pressable>
            ))}
          </Card>
        ) : q.trim().length >= 2 ? <Text style={{ fontSize: 12, color: colors.muted }}>Si no aparece, cargalo como hijo en la ficha de su papá o mamá (se le crea la ficha sola).</Text> : null}
        {lastCode ? (
          <Card style={{ alignItems: 'center', gap: 4, backgroundColor: colors.greenSoft, borderColor: colors.green }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.greenText }}>{lastCode.name} · código para retirarlo</Text>
            <Text style={{ fontSize: 48, fontWeight: '900', color: colors.green, letterSpacing: 8 }}>{lastCode.code}</Text>
            <Text style={{ fontSize: 12, color: colors.greenText, textAlign: 'center' }}>Dáselo a quien lo trajo (que le saque una foto o lo anote). Los hermanos que llegan juntos tienen el mismo código.</Text>
          </Card>
        ) : null}

        <SectionTitle>Retiro</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput value={outCode} onChangeText={(v) => setOutCode(v.replace(/\D/g, '').slice(0, 4))} placeholder="Código" placeholderTextColor={colors.muted} keyboardType="number-pad"
            style={{ flex: 1, height: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.input, paddingHorizontal: 16, fontSize: 24, fontWeight: '800', letterSpacing: 6, color: colors.text }} />
          <Button title="Entregar" icon="check" onPress={checkOut} />
        </View>

        <SectionTitle>Hoy</SectionTitle>
        {rows === null ? <Loading /> : (
          <Card style={{ padding: 0 }}>
            {rows.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, opacity: r.out_at ? 0.55 : 1 }}>
                <Face name={r.name} path={r.photo_path} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.name}{r.age != null ? ` (${r.age})` : ''}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{r.room} · entró {fmtTime(r.in_at)}{r.brought_by ? ` · lo trajo ${r.brought_by}` : ''}{r.out_at ? ` · salió ${fmtTime(r.out_at)}` : ''}</Text>
                </View>
                {r.out_at ? <Feather name="check" size={18} color={colors.green} /> : <Tag text={r.code} tone="amber" />}
              </View>
            ))}
            {!rows.length ? <Text style={{ padding: 12, color: colors.muted }}>Todavía no entró ningún chico hoy.</Text> : null}
          </Card>
        )}
      </Screen>
    </View>
  );
}
