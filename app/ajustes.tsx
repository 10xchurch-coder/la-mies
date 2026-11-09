// Ajustes: perfil, cómo comparto, Face ID, ubicación, cuenta.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Avatar, Card, Choice, RowLink, SectionTitle, Toggle } from '@/components/ui';
import { biometricsAvailable } from '@/components/LockGate';
import { setLockOptIn, useLockOptIn } from '@/lib/lockPref';
import { needsAppLock } from '@/lib/perms';
import { requestAccountDeletion, updateProfile } from '@/lib/api';
import { groupWord } from '@/lib/format';
import { rolesLabel } from '@/lib/perms';
import { useAuth } from '@/store/auth';
import { colors, themed, useThemeMode } from '@/theme';
import { saveThemeMode } from '@/lib/themeStore';
import { APP_VERSION } from '@/components/ErrorScreen';
import { updateLabel } from '@/lib/otaUpdates';
import { blockedPeople, unblockUser } from '@/lib/moderation';
import { RULES } from '@/components/RulesGate';

export default function Ajustes() {
  const router = useRouter();
  const { profile, church, group, refreshProfile, signOut, can, perms } = useAuth();
  const mustLock = needsAppLock(perms);
  const optIn = useLockOptIn();
  const isStaff = can('com.moderar');
  const [bio, setBio] = useState<{ available: boolean; label: string }>({ available: true, label: 'Face ID' });
  const mode = useThemeMode();

  const [blocked, setBlocked] = useState<{ id: string; name: string }[]>([]);
  const loadBlocked = useCallback(() => { blockedPeople().then(setBlocked).catch(() => undefined); }, []);
  useEffect(() => {
    biometricsAvailable().then(setBio);
    loadBlocked();
  }, [loadBlocked]);

  const set = async (patch: Parameters<typeof updateProfile>[0]) => {
    try {
      await updateProfile(patch);
      await refreshProfile();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : 'Probá de nuevo');
    }
  };

  const roleLabel = rolesLabel(profile);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ajustes" back />
      <Screen>
        <View style={styles.profile}>
          <Avatar name={profile?.display_name ?? '?'} size={52} color={colors.green} textColor="#FFFFFF" />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{profile?.display_name}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {roleLabel}{group ? ` · ${group.name}` : ''}{church ? ` · ${church.name}` : ''}
            </Text>
          </View>
        </View>

        <SectionTitle>Compartir mis contactos</SectionTitle>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Cuando marco una casa nueva, compartirla con</Text>
          <Choice
            options={[
              { value: 'group', label: group ? `${church?.grouping === 'bus_routes' ? 'Toda' : 'Todo'} mi ${groupWord(church?.grouping).toLowerCase()}` : 'Toda la iglesia' },
              { value: 'me', label: 'Solo yo' },
              { value: 'ask', label: 'Preguntarme cada vez' },
            ]}
            value={profile?.share_default ?? 'group'}
            onChange={(v) => set({ share_default: v })}
          />
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Podés cambiarlo para un contacto puntual al momento de guardarlo. Los administradores de la iglesia ven todos los contactos.</Text>
        </Card>

        <SectionTitle>Apariencia</SectionTitle>
        <Card>
          <Toggle
            label="Modo oscuro"
            hint={mode === 'dark' ? 'Fondo oscuro, descansa la vista de noche.' : 'Fondo claro. Activalo para usar la app con fondo oscuro.'}
            value={mode === 'dark'}
            onChange={(v) => saveThemeMode(v ? 'dark' : 'light')}
          />
        </Card>

        <SectionTitle>Seguridad y ubicación</SectionTitle>
        <Card>
          <Toggle
            label={`Pedir ${bio.label} para abrir la app`}
            hint={!bio.available ? 'Tu teléfono no tiene Face ID, huella ni código configurado.'
              : mustLock ? 'Obligatorio porque podés ver finanzas o datos de administración. También se pide si la app estuvo cerrada más de 2 minutos.'
              : 'Opcional. Si lo activás, también se pide si la app estuvo cerrada más de 2 minutos.'}
            value={mustLock || !!optIn}
            disabled={mustLock}
            onChange={(v) => { setLockOptIn(v); }}
          />
          <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Feather name="lock" size={22} color={colors.green} />
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text }}>
              Tu ubicación en vivo se comparte con el equipo <Text style={{ fontWeight: '700' }}>solo mientras una salida está activa</Text>. Al terminar, queda guardado el recorrido para el mapa de veredas, no dónde estás.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Feather name="truck" size={22} color={colors.green} />
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text }}>
              Si la app detecta velocidad de vehículo durante una salida, la corta sola en el último punto en que caminabas, para que no queden líneas por toda la ciudad.
            </Text>
          </View>
        </Card>

        <SectionTitle>Cuenta</SectionTitle>
        <Card style={{ padding: 0 }}>
          {isStaff ? <RowLink title="Denuncias" subtitle="Comentarios o pedidos que alguien denunció" icon="flag" onPress={() => router.push('/admin/denuncias' as never)} /> : null}
          <RowLink title="Normas de la comunidad" subtitle="Respeto, privacidad y denuncias" icon="book" onPress={() => Alert.alert('Normas de la comunidad', RULES.map((r, i) => `${i + 1}. ${r}`).join('\n\n'))} />
          <RowLink
            title="Personas bloqueadas"
            subtitle={blocked.length ? blocked.map((b) => b.name).join(', ') : 'No bloqueaste a nadie'}
            icon="slash"
            onPress={() => blocked.length
              ? Alert.alert('Desbloquear', 'Elegí a quién volver a ver.', [...blocked.slice(0, 3).map((b) => ({ text: b.name, onPress: () => { unblockUser(b.id).then(loadBlocked); } })), { text: 'Cancelar', style: 'cancel' as const }])
              : undefined}
          />
          <RowLink title="Seguridad de mi cuenta" subtitle="Contraseña y verificación en dos pasos" icon="shield" onPress={() => router.push('/seguridad')} />
          <RowLink
            title="Cerrar sesión"
            icon="log-out"
            danger
            onPress={() => Alert.alert('Cerrar sesión', '¿Salir de la app en este teléfono?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Salir', style: 'destructive', onPress: () => signOut().then(() => router.replace('/login')) }])}
          />
          <RowLink
            title="Eliminar mi cuenta"
            subtitle="Borra tu cuenta y tus datos personales"
            icon="trash-2"
            danger
            onPress={() =>
              Alert.alert(
                'Eliminar mi cuenta',
                'Vamos a borrar tu cuenta y tus datos personales (foto, teléfono, dirección, DNI) dentro de los 10 días hábiles. Las fichas de las personas que visitaste quedan en la iglesia para su seguimiento. ¿Seguro?',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Eliminar', style: 'destructive',
                    onPress: async () => {
                      try {
                        await requestAccountDeletion();
                        await signOut();
                        router.replace('/login');
                        Alert.alert('Pedido recibido', 'La iglesia va a borrar tu cuenta dentro de los 10 días hábiles. Si cambiás de idea, escribí a info@iglesiavictoria.com.');
                      } catch (e) {
                        Alert.alert('No se pudo', e instanceof Error ? e.message : 'Probá de nuevo');
                      }
                    },
                  },
                ],
              )
            }
          />
        </Card>
        <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>La Mies · versión {APP_VERSION} · {updateLabel()} · {church?.name ?? ''}</Text>
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: colors.bgSoft },
}));
