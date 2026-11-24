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
import { colors, themed } from '@/theme';
import type { AccountRow } from '@/types';
import { tx } from '@/lib/i18n';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Cuentas() {
  const { isAdmin, profile } = useAuth();
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    accountsOverview().then(setRows).catch((e) => {
      Alert.alert(tx('No se pudo cargar'), errorMessage(e));
      setRows([]);
    });
  }, []);
  useFocusEffect(load);

  const sendReset = (r: AccountRow) =>
    Alert.alert(tx('Cambiar contraseña'), tx('Le mandamos a {email} un correo con un link para poner una contraseña nueva. ¿Seguimos?', { email: r.email }), [
      { text: tx('Cancelar'), style: 'cancel' },
      {
        text: tx('Mandar correo'),
        onPress: async () => {
          const { error } = await supabase.auth.resetPasswordForEmail(r.email, { redirectTo: `${WEB_URL}/recuperar` });
          Alert.alert(error ? tx('No se pudo') : tx('Correo enviado'), error ? errorMessage(error) : tx('Decile a {display_name} que revise su correo (también la carpeta de spam) y abra el link.', { display_name: r.display_name }));
        },
      },
    ]);

  const toggleDisabled = (r: AccountRow) => {
    const off = !r.disabled_at;
    Alert.alert(off ? tx('Desactivar cuenta') : tx('Reactivar cuenta'),
      off ? tx('{display_name} no va a poder ver nada de la iglesia hasta que la reactives. Sus datos no se borran.', { display_name: r.display_name }) : tx('{display_name} vuelve a tener acceso normal.', { display_name: r.display_name }), [
      { text: tx('Cancelar'), style: 'cancel' },
      {
        text: off ? tx('Desactivar') : tx('Reactivar'), style: off ? 'destructive' : 'default',
        onPress: () => setAccountDisabled(r.id, off).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))),
      },
    ]);
  };

  if (!rows) return <Loading />;
  const s = norm(q.trim());
  const shown = rows.filter((r) => !s || norm(r.display_name).includes(s) || norm(r.email).includes(s));
  const with2fa = rows.filter((r) => r.has_mfa).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Cuentas')} subtitle={tx('{n} con cuenta · {with2fa} con verificación en dos pasos', { n: rows.length, with2fa })} back />
      <Screen>
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={tx('Buscar por nombre o correo')} placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} />
        </View>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Feather name="help-circle" size={20} color={colors.green} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 }}>
            {tx('Si alguien no puede entrar: mandale el correo para cambiar la contraseña. Si perdió el teléfono con la app de autenticación, pedile que entre con el correo nuevo y ahí la vuelva a activar; si no puede, avisá a La Mies.{pl}', { pl: isAdmin ? tx(' Desactivar una cuenta la deja sin acceso al instante (por ejemplo, un teléfono robado).') : '' })}
          </Text>
        </Card>
        {!shown.length ? (
          <Empty icon="users" title={tx('No hay cuentas')} />
        ) : (
          shown.map((r) => (
            <Card key={r.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{r.display_name}{r.id === profile?.id ? tx(' (vos)') : ''}</Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>{r.email}</Text>
                </View>
                <Tag text={ROLE_LABEL[r.role]} tone={r.role === 'admin' ? 'green' : r.role === 'secretary' || r.role === 'captain' ? 'blue' : 'gray'} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Tag text={r.has_mfa ? tx('Dos pasos: sí') : tx('Dos pasos: no')} tone={r.has_mfa ? 'green' : 'amber'} />
                {r.disabled_at ? <Tag text={tx('Desactivada')} tone="red" /> : null}
                {r.deletion_requested_at ? <Tag text={tx('Pidió eliminar su cuenta {fmtRelativeDay}', { fmtRelativeDay: fmtRelativeDay(r.deletion_requested_at) })} tone="red" /> : null}
                <Tag text={r.last_sign_in ? tx('Entró {fmtRelativeDay}', { fmtRelativeDay: fmtRelativeDay(r.last_sign_in) }) : tx('Nunca entró')} tone="gray" />
              </View>
              {r.id !== profile?.id ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={tx('Correo para cambiar contraseña')} small variant="outline" icon="mail" onPress={() => sendReset(r)} style={{ flex: 1 }} />
                  {isAdmin ? <Button title={r.disabled_at ? tx('Reactivar') : tx('Desactivar')} small variant={r.disabled_at ? 'primary' : 'danger'} onPress={() => toggleDisabled(r)} /> : null}
                </View>
              ) : null}
            </Card>
          ))
        )}
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSoft },
}));
