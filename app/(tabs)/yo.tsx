// Yo: mi foto, mis ministerios resaltados, lo que me toca, avisos, ofrendar, mi progreso y ajustes.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Card, RowLink, SectionTitle } from '@/components/ui';
import { listMinistries, ministryMembers, myUpcoming, unreadCount, updateContact } from '@/lib/api';
import { pickAndUploadPhoto } from '@/lib/files';
import { errorMessage, supabase } from '@/lib/supabase';
import { ROLE_LABEL, STATUS_LABEL } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Ministry, UpcomingItem } from '@/types';
import { UpcomingList } from '@/components/Upcoming';

type IconName = React.ComponentProps<typeof Feather>['name'];

export default function Yo() {
  const router = useRouter();
  const { profile, church, group, me, isLeader, refreshProfile } = useAuth();
  const [mine, setMine] = useState<Ministry[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [certId, setCertId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      unreadCount().then(setUnread).catch(() => undefined);
      supabase.rpc('my_baptism_certificate_id').then(({ data }) => setCertId((data as string | null) ?? null));
      myUpcoming(21).then(setUpcoming).catch(() => undefined);
      Promise.all([listMinistries(), ministryMembers()]).then(([ms, mm]) => {
        const ids = new Set(mm.filter((x) => x.profile_id === profile?.id).map((x) => x.ministry_id));
        setMine(ms.filter((m) => ids.has(m.id) || m.leader_id === profile?.id));
      }).catch(() => undefined);
    }, [profile?.id]),
  );

  const changePhoto = async () => {
    if (!church || !me) return;
    try {
      const p = await pickAndUploadPhoto(church.id);
      if (p) {
        await updateContact(me.id, { photo_path: p });
        await refreshProfile();
      }
    } catch (e) {
      Alert.alert('No se pudo subir la foto', errorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="Yo"
        right={
          <Pressable onPress={() => router.push('/avisos')} accessibilityRole="button" accessibilityLabel={`Avisos, ${unread} sin leer`} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="bell" size={24} color={colors.text} />
            {unread ? (
              <View style={{ position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        }
      />
      <Screen>
        <Pressable
          disabled={!me}
          onPress={() => me && router.push({ pathname: '/persona/nueva', params: { id: me.id } })}
          accessibilityRole="button" accessibilityLabel="Ver y editar mis datos"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: colors.bgSoft }, pressed && me ? { opacity: 0.85 } : null]}>
          <Face name={profile?.display_name ?? '?'} path={me?.photo_path} size={72} editable onPress={changePhoto} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{profile?.display_name}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{ROLE_LABEL[profile?.role ?? 'member']}{group ? ` · ${group.name}` : ''}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{church?.name}{me ? ` · ${STATUS_LABEL[me.status]}` : ''}</Text>
          </View>
          {me ? <Feather name="chevron-right" size={22} color={colors.muted} /> : null}
        </Pressable>

        {mine.length ? (
          <>
            <SectionTitle>Mis ministerios</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {mine.map((m) => (
                <Pressable key={m.id} onPress={() => router.push({ pathname: '/ministerio/[id]', params: { id: m.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.green }}>
                  <Feather name={(m.icon as IconName) ?? 'star'} size={16} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>{m.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <SectionTitle>Lo que me toca</SectionTitle>
        <UpcomingList items={upcoming} />

        <Pressable onPress={() => router.push('/dar')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: colors.greenSoft, borderWidth: 1.5, borderColor: colors.green }}>
          <Feather name="gift" size={24} color={colors.greenText} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.greenText }}>Ofrendar</Text>
            <Text style={{ fontSize: 12, color: colors.greenText }}>Alias y CBU de la iglesia para copiar</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.greenText} />
        </Pressable>

        <Card style={{ padding: 0 }}>
          <RowLink title="Avisos" subtitle={unread ? `${unread} sin leer` : 'Recordatorios y anuncios'} icon="bell" onPress={() => router.push('/avisos')} />
          <RowLink title="Devocional y mi racha" subtitle="Versículo del día, lectura y premios" icon="book-open" onPress={() => router.push('/devocional')} />
          <RowLink title="Mi progreso y niveles" icon="award" onPress={() => router.push('/progreso')} />
          {certId ? <RowLink title="Mi certificado de bautismo" subtitle="Verlo, guardarlo o imprimirlo" icon="droplet" onPress={() => router.push(`/certificado/${certId}` as never)} /> : null}
          <RowLink title="Mis salidas" subtitle="Ver, arreglar o terminar una salida" icon="clock" onPress={() => router.push('/salidas')} />
          <RowLink title="Mis contactos para seguir" subtitle="Promesas, visitas y mensajes" icon="user-check" onPress={() => router.push('/seguimiento')} />
          <RowLink title="Zonas" subtitle="Barrios asignados y cuánto falta" icon="hexagon" onPress={() => router.push('/zonas')} />
          <RowLink title="Directorio" subtitle="Elegí si aparecés" icon="users" onPress={() => router.push('/directorio')} />
          {me ? <RowLink title="Mis datos" subtitle="Teléfono, dirección, hijos" icon="user" onPress={() => router.push({ pathname: '/persona/nueva', params: { id: me.id } })} /> : null}
          {isLeader ? <RowLink title="Panel del pastor" subtitle="Reportes, hermanos y código de la iglesia" icon="bar-chart-2" onPress={() => router.push('/panel')} /> : null}
          <RowLink title="Seguridad de mi cuenta" subtitle="Contraseña y verificación en dos pasos" icon="shield" onPress={() => router.push('/seguridad')} />
          <RowLink title="Ajustes" subtitle="Compartir, Face ID, cerrar sesión" icon="settings" onPress={() => router.push('/ajustes')} />
        </Card>
      </Screen>
    </View>
  );
}
