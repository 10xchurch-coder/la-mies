// Administración: rol y grupo de un hermano.
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Avatar, Button, Card, Choice, Loading, SectionTitle, Toggle } from '@/components/ui';
import { listGroups } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { groupWord } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Group, Profile, Role } from '@/types';

export default function Miembro() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { church, isAdmin } = useAuth();
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [groups, setGroups] = useState<Group[]>([]);
  const [role, setRole] = useState<Role>('member');
  const [group, setGroup] = useState<string>('none');
  const [takes, setTakes] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      const prof = (data as Profile | null) ?? null;
      setP(prof);
      if (prof) {
        setRole(prof.role);
        setGroup(prof.group_id ?? 'none');
        setTakes(!!prof.takes_attendance);
      }
    });
    listGroups().then(setGroups).catch(() => undefined);
  }, [id]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('set_member_role', { p_user: id, p_role: role, p_group: group === 'none' ? null : group });
    if (!error && takes !== !!p?.takes_attendance) {
      const r = await supabase.rpc('set_takes_attendance', { p_user: id, p_value: takes });
      if (r.error) Alert.alert('No se pudo guardar el permiso de asistencia', errorMessage(r.error));
    }
    // El capitán de un colectivo recibe el reporte de quiénes de su colectivo faltaron.
    if (!error && role === 'captain' && group !== 'none') {
      await supabase.from('groups').update({ captain_id: id }).eq('id', group);
    }
    setBusy(false);
    if (error) Alert.alert('No se pudo', errorMessage(error));
    else router.back();
  };

  if (p === undefined) return <Loading />;
  if (!p) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Hermano" back />
        <Text style={{ padding: 24, color: colors.muted }}>No se encontró.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={p.display_name} subtitle={p.phone ?? ''} back />
      <Screen>
        <View style={{ alignItems: 'center' }}>
          <Avatar name={p.display_name} size={64} color={colors.green} textColor="#FFFFFF" />
        </View>
        <SectionTitle>Rol</SectionTitle>
        <Choice
          options={[
            { value: 'member', label: 'Miembro' },
            { value: 'captain', label: 'Capitán' },
            { value: 'secretary', label: 'Secretaría' },
            ...(isAdmin || p.role === 'admin' ? [{ value: 'admin' as const, label: 'Pastor / admin' }] : []),
          ]}
          value={role}
          onChange={setRole}
        />
        <Card style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
            <Text style={{ fontWeight: '700' }}>Miembro:</Text> sale, marca casas, ve lo de su grupo.{'\n'}
            <Text style={{ fontWeight: '700' }}>Capitán:</Text> además toma asistencia, marca discipulado y bautismos, ve el panel y recibe quiénes de su colectivo faltaron.{'\n'}
            <Text style={{ fontWeight: '700' }}>Secretaría:</Text> carga y marca miembros, vincula cuentas, arma clases, turnos, prédicas y datos para ofrendar.{'\n'}
            <Text style={{ fontWeight: '700' }}>Pastor / admin:</Text> todo lo anterior, nombra administradores y recibe el reporte de ausencias del domingo.
          </Text>
        </Card>
        <SectionTitle>{groupWord(church?.grouping)}</SectionTitle>
        <Choice
          options={[{ value: 'none', label: `Sin ${groupWord(church?.grouping).toLowerCase()}` }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
          value={group}
          onChange={setGroup}
        />
        <SectionTitle>Permisos</SectionTitle>
        <Card>
          <Toggle
            label="Puede tomar asistencia"
            hint="Para quien recibe en la puerta o ayuda en secretaría. Capitanes, secretaría y pastor ya pueden sin esta marca."
            value={takes || role !== 'member'}
            onChange={setTakes}
          />
        </Card>
        <Button title="Guardar" onPress={save} loading={busy} />
      </Screen>
    </View>
  );
}
