// Roles y permisos: quién tiene cada rol, qué puede hacer cada uno, y a quién le llegan
// el aviso de ausencias del fin de semana y el informe semanal de los lunes.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, SectionTitle } from '@/components/ui';
import { listProfiles, setChurchRecipients } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Profile } from '@/types';

const ORDER = ['admin', 'secretary', 'captain', 'member'] as const;

const CAN: { what: string; roles: (typeof ORDER)[number][] }[] = [
  { what: 'Salir a evangelizar y cargar contactos', roles: ['member', 'captain', 'secretary', 'admin'] },
  { what: 'Pedir oración, sugerencias, eventos, directorio', roles: ['member', 'captain', 'secretary', 'admin'] },
  { what: 'Tomar asistencia', roles: ['captain', 'secretary', 'admin'] },
  { what: 'Mandar anuncios', roles: ['captain', 'secretary', 'admin'] },
  { what: 'Ver el panel del equipo', roles: ['captain', 'secretary', 'admin'] },
  { what: 'Arreglar o cerrar la salida de otro', roles: ['secretary', 'admin'] },
  { what: 'Cargar miembros, prédicas, eventos y zonas', roles: ['secretary', 'admin'] },
  { what: 'Ver pedidos "solo pastor" y las sugerencias', roles: ['admin'] },
  { what: 'Nombrar administradores', roles: ['admin'] },
];

function Recipients({ title, hint, people, value, onChange }: { title: string; hint: string; people: Profile[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Card style={{ gap: 8 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{hint}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {people.map((p) => {
          const on = value.includes(p.id);
          return (
            <Pressable key={p.id} onPress={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              style={{ height: 38, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.greenSoft : colors.bg, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {on ? <Feather name="check" size={14} color={colors.greenText} /> : null}
              <Text style={{ fontSize: 13, fontWeight: on ? '800' : '600', color: on ? colors.greenText : colors.text }}>{p.display_name}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

export default function Roles() {
  const router = useRouter();
  const { church, refreshProfile } = useAuth();
  const [people, setPeople] = useState<Profile[]>([]);
  const [absence, setAbsence] = useState<string[]>(church?.absence_recipients ?? []);
  const [report, setReport] = useState<string[]>(church?.report_recipients ?? []);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listProfiles().then(setPeople).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const leaders = people.filter((p) => p.role !== 'member');

  const save = async () => {
    setBusy(true);
    try {
      await setChurchRecipients(absence, report);
      await refreshProfile();
      Alert.alert('Guardado', 'Listo.');
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Roles y permisos" back />
      <Screen>
        {ORDER.filter((r) => r !== 'member').map((r) => {
          const list = people.filter((p) => p.role === r);
          return (
            <View key={r} style={{ gap: 6 }}>
              <SectionTitle>{`${ROLE_LABEL[r]} (${list.length})`}</SectionTitle>
              {list.length ? list.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/admin/miembro?id=${p.id}` as Href)} accessibilityRole="button">
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{p.display_name}</Text>
                      {p.title ? <Text style={{ fontSize: 12, color: colors.greenText, fontWeight: '700' }}>{p.title}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.muted} />
                  </Card>
                </Pressable>
              )) : <Text style={{ fontSize: 13, color: colors.muted }}>Nadie todavía.</Text>}
            </View>
          );
        })}
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {people.filter((p) => p.role === 'member').length} miembros. Para cambiar el rol o el cargo de alguien, abrilo en Administración → Hermanos.
        </Text>

        <SectionTitle>Qué puede hacer cada rol</SectionTitle>
        <Card style={{ padding: 0 }}>
          <View style={{ flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ flex: 3, fontSize: 11, fontWeight: '800', color: colors.muted }}> </Text>
            {['Miem.', 'Capit.', 'Secre.', 'Pastor'].map((h) => <Text key={h} style={{ flex: 1, fontSize: 10, fontWeight: '800', color: colors.muted, textAlign: 'center' }}>{h}</Text>)}
          </View>
          {CAN.map((c) => (
            <View key={c.what} style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ flex: 3, fontSize: 12, color: colors.text }}>{c.what}</Text>
              {(['member', 'captain', 'secretary', 'admin'] as const).map((r) => (
                <View key={r} style={{ flex: 1, alignItems: 'center' }}>
                  {c.roles.includes(r) ? <Feather name="check" size={16} color={colors.green} /> : <Text style={{ color: colors.muted }}>·</Text>}
                </View>
              ))}
            </View>
          ))}
        </Card>

        <SectionTitle>¿A quién le llegan los avisos?</SectionTitle>
        <Recipients title="Ausencias del fin de semana" hint="Los lunes a la mañana: quiénes faltaron 1, 2 o 3+ semanas, con el mensaje de WhatsApp listo. Si no elegís a nadie, le llega al pastor y a la secretaría." people={leaders} value={absence} onChange={setAbsence} />
        <Recipients title="Informe semanal" hint="Los lunes a las 8: salidas, casas, contactos, asistencia y bautismos de la semana." people={leaders} value={report} onChange={setReport} />
        <Button title="Guardar" onPress={save} loading={busy} />
      </Screen>
    </View>
  );
}
