// Ofrendar: los datos de la cuenta de la iglesia con botones para copiar. El pastor o la secretaría los cargan.
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, RowLink } from '@/components/ui';
import { useRouter, type Href } from 'expo-router';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Giving } from '@/types';

const FIELDS: { key: keyof Giving; label: string; hint?: string }[] = [
  { key: 'alias', label: 'Alias' },
  { key: 'cbu', label: 'CBU / CVU' },
  { key: 'titular', label: 'Titular' },
  { key: 'cuit', label: 'CUIT' },
  { key: 'banco', label: 'Banco' },
];

export default function Dar() {
  const router = useRouter();
  const { church, isStaff, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Giving>(church?.giving ?? {});
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const g = church?.giving ?? {};
  const has = FIELDS.some((f) => g[f.key]);

  const copy = async (k: string, v: string) => {
    await Clipboard.setStringAsync(v);
    setCopied(k);
    setTimeout(() => setCopied(null), 1800);
  };

  const save = async () => {
    if (!church) return;
    setBusy(true);
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v));
    const { error } = await supabase.from('churches').update({ giving: clean }).eq('id', church.id);
    setBusy(false);
    if (error) Alert.alert('No se pudo guardar', errorMessage(error));
    else {
      await refreshProfile();
      setEditing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ofrendar" subtitle={church?.name} back />
      <Screen>
        {!editing ? <RowLink icon="bar-chart-2" title="Finanzas de la iglesia" subtitle="Informe por trimestre y por año, para los miembros" onPress={() => router.push('/informe-iglesia' as Href)} /> : null}
        {editing ? (
          <>
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} value={form[f.key] ?? ''} onChangeText={(t) => setForm({ ...form, [f.key]: t })} autoCapitalize={f.key === 'titular' || f.key === 'banco' ? 'words' : 'none'} />
            ))}
            <Field label="Nota" hint="(opcional, ej: poné tu nombre en la referencia)" value={form.nota ?? ''} onChangeText={(t) => setForm({ ...form, nota: t })} multiline />
            <Button title="Guardar" onPress={save} loading={busy} />
            <Button title="Cancelar" variant="ghost" onPress={() => setEditing(false)} />
          </>
        ) : has ? (
          <>
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>
              Podés ofrendar por transferencia. Tocá un dato para copiarlo y pegalo en la app de tu banco o billetera.
            </Text>
            <Card style={{ padding: 0 }}>
              {FIELDS.filter((f) => g[f.key]).map((f, i, arr) => {
                // El nombre del titular solo se muestra (no hace falta copiarlo).
                const copyable = f.key !== 'titular';
                const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border };
                const value = (
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>{f.label}</Text>
                    <Text selectable style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{g[f.key]}</Text>
                  </View>
                );
                if (!copyable) return <View key={f.key} style={[rowStyle, { backgroundColor: colors.bg }]}>{value}</View>;
                return (
                  <Pressable key={f.key} onPress={() => copy(f.key, g[f.key] as string)} accessibilityRole="button" accessibilityLabel={`Copiar ${f.label}`}
                    style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? colors.bgSoft : colors.bg }]}>
                    {value}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: copied === f.key ? colors.green : colors.greenSoft }}>
                      <Feather name={copied === f.key ? 'check' : 'copy'} size={16} color={copied === f.key ? '#FFF' : colors.greenText} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: copied === f.key ? '#FFF' : colors.greenText }}>{copied === f.key ? 'Copiado' : 'Copiar'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
            {g.nota ? <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>{g.nota}</Text> : null}
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19, fontStyle: 'italic' }}>
              “Cada uno dé como propuso en su corazón: no con tristeza, ni por necesidad, porque Dios ama al dador alegre.” 2 Corintios 9:7
            </Text>
          </>
        ) : (
          <Empty icon="gift" title="Todavía no están los datos" text={isStaff ? 'Tocá Cargar datos para poner el alias y el CBU de la iglesia.' : 'El pastor o la secretaría los van a cargar pronto.'} />
        )}
        {isStaff && !editing ? <Button title={has ? 'Cambiar datos' : 'Cargar datos'} variant="outline" icon="edit-2" onPress={() => { setForm(church?.giving ?? {}); setEditing(true); }} /> : null}
      </Screen>
    </View>
  );
}
