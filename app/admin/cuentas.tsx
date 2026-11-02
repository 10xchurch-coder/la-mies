// Cuentas de la iglesia (pastor y secretaría): quién tiene verificación en dos pasos, cuándo entró por última vez,
// mandar el correo para cambiar la contraseña y, solo el pastor, desactivar una cuenta.
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, Tag } from '@/components/ui';
import { accountsOverview, setAccountDisabled } from '@/lib/api';
import { ROLE_LABEL, fmtRelativeDay } from '@/lib/format';
import { WEB_URL } from '@/lib/share';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { AccountRow } from '@/types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Cuentas() {
  const { isAdmin, profile } = useAuth();
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    accountsOverview().then(setRows).catch((e) => {
      Alert.alert('No se pudo cargar', errorMessage(e));
      setRows([]);
    });
  }, []);
  useFocusEffect(load);

  const sendReset = (r: AccountRow) =>
    Alert.alert('Cambiar contraseña', `Le mandamos a ${r.email} un correo con un link para poner una contraseña nueva. ¿Seguimos?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Mandar correo',
        onPress: async () => {
          const { error } = await supabase.auth.resetPasswordForEmail(r.email, { redirectTo: `${WEB_URL}/recuperar` });
          Alert.alert(error ? 'No se pudo' : 'Correo enviado', error ? errorMessage(error) : `Decile a ${r.display_name} que revise su correo (también la carpeta de spam) y abra el link.`);
        },
      },
    ]);

  const toggleDisabled = (r: AccountRow) => {
    const off = !r.disabled_at;
    Alert.alert(off ? 'Desactivar cuenta' : 'Reactivar cuenta',
      off ? `${r.display_name} no va a poder ver nada de la iglesia hasta que la reactives. Sus datos no se borran.` : `${r.display_name} vuelve a tener acceso normal.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: off ? 'Desactivar' : 'Reactivar', style: off ? 'destructive' : 'default',
        onPress: () => setAccountDisabled(r.id, off).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))),
      },
    ]);
  };

  if (!rows) return <Loading />;
  const s = norm(q.trim());
  const shown = rows.filter((r) => !s || norm(r.display_name).includes(s) || norm(r.email).includes(s));
  const with2fa = rows.filter((r) => r.has_mfa).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Cuentas" subtitle={`${rows.length} con cuenta · ${with2fa} con verificación en dos pasos`} back />
      <Screen>
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar por nombre o correo" placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} />
        </View>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Feather name="help-circle" size={20} color={colors.green} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 }}>
            Si alguien no puede entrar: mandale el correo para cambiar la contraseña. Si perdió el teléfono con la app de autenticación, pedile que entre con el correo nuevo y ahí la vuelva a activar; si no puede, avisá a La Mies.
            {isAdmin ? ' Desactivar una cuenta la deja sin acceso al instante (por ejemplo, un teléfono robado).' : ''}
          </Text>
        </Card>
        {!shown.length ? (
          <Empty icon="users" title="No hay cuentas" />
        ) : (
          shown.map((r) => (
            <Card key={r.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{r.display_name}{r.id === profile?.id ? ' (vos)' : ''}</Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>{r.email}</Text>
                </View>
                <Tag text={ROLE_LABEL[r.role]} tone={r.role === 'admin' ? 'green' : r.role === 'secretary' || r.role === 'captain' ? 'blue' : 'gray'} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Tag text={r.has_mfa ? 'Dos pasos: sí' : 'Dos pasos: no'} tone={r.has_mfa ? 'green' : 'amber'} />
                {r.disabled_at ? <Tag text="Desactivada" tone="red" /> : null}
                {r.deletion_requested_at ? <Tag text={`Pidió eliminar su cuenta ${fmtRelativeDay(r.deletion_requested_at)}`} tone="red" /> : null}
                <Tag text={r.last_sign_in ? `Entró ${fmtRelativeDay(r.last_sign_in)}` : 'Nunca entró'} tone="gray" />
              </View>
              {r.id !== profile?.id ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Correo para cambiar contraseña" small variant="outline" icon="mail" onPress={() => sendReset(r)} style={{ flex: 1 }} />
                  {isAdmin ? <Button title={r.disabled_at ? 'Reactivar' : 'Desactivar'} small variant={r.disabled_at ? 'primary' : 'danger'} onPress={() => toggleDisabled(r)} /> : null}
                </View>
              ) : null}
            </Card>
          ))
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSoft },
});
