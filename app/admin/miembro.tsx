// Administración: rol y grupo de un hermano.
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Avatar, Button, Card, Choice, Field, Loading, SectionTitle, Toggle } from '@/components/ui';
import { getProfile, listGroups, setFinanceRole, setProfileTitle } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { groupWord } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { FIN_ROLES, ROLES, isTopRole } from '@/lib/perms';
import { colors } from '@/theme';
import type { Group, Profile, Role } from '@/types';

export default function Miembro() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { church, isAdmin, financeLevel, profile: me } = useAuth();
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [groups, setGroups] = useState<Group[]>([]);
  const [role, setRole] = useState<Role>('member');
  const [group, setGroup] = useState<string>('none');
  const [takes, setTakes] = useState(false);
  const [title, setTitle] = useState('');
  const [fin, setFin] = useState<string>('default');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProfile(id).then((prof) => {
      setP(prof);
      if (prof) {
        setRole(prof.role);
        setGroup(prof.group_id ?? 'none');
        setTakes(!!prof.takes_attendance);
        setTitle(prof.title ?? '');
        setFin(prof.finance_role ?? 'default');
      }
    });
    listGroups().then(setGroups).catch(() => undefined);
  }, [id]);

  const save = async () => {
    setBusy(true);
    const { error } = role === p?.role && (group === 'none' ? null : group) === (p?.group_id ?? null) ? { error: null } : await supabase.rpc('set_member_role', { p_user: id, p_role: role, p_group: group === 'none' ? null : group });
    if (!error && takes !== !!p?.takes_attendance) {
      const r = await supabase.rpc('set_takes_attendance', { p_user: id, p_value: takes });
      if (r.error) Alert.alert('No se pudo guardar el permiso de asistencia', errorMessage(r.error));
    }
    if (!error && title.trim() !== (p?.title ?? '')) {
      try { await setProfileTitle(id, title.trim()); } catch (e) { Alert.alert('No se pudo guardar el cargo', errorMessage(e)); }
    }
    if (!error && (financeLevel >= 4 || isAdmin) && fin !== (p?.finance_role ?? 'default')) {
      try { await setFinanceRole(id, fin === 'default' ? null : fin); } catch (e) { Alert.alert('No se pudo guardar el rol de finanzas', errorMessage(e)); }
    }
    // El jefe de ruta recibe el reporte de quiénes de su colectivo faltaron.
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
          columns={2}
          options={ROLES.filter((r) => !isTopRole(r.key) || isTopRole(me?.role) || r.key === p.role).map((r) => ({ value: r.key, label: r.label }))}
          value={role}
          onChange={(v) => isAdmin ? setRole(v as Role) : Alert.alert('Solo el pastor o el administrador de la app dan roles')}
        />
        <Card style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
            <Text style={{ fontWeight: '700' }}>{ROLES.find((r) => r.key === role)?.label}:</Text> {ROLES.find((r) => r.key === role)?.hint}
          </Text>
          <Button title="Ver y ajustar sus permisos" icon="sliders" variant="ghost" small onPress={() => router.push({ pathname: '/admin/permisos', params: { id: p.id } })} />
        </Card>
        <Field label="Cargo (opcional)" value={title} onChangeText={setTitle} placeholder="Diácono, maestra de niños, tesorero…" hint="Se muestra en el directorio y en su perfil" />
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
            hint="Para quien recibe en la puerta o ayuda en secretaría. Los jefes de ruta, diáconos, secretaría y pastores ya pueden sin esta marca."
            value={takes || ['captain', 'deacon', 'secretary', 'assistant_pastor', 'admin', 'app_admin'].includes(role)}
            onChange={setTakes}
          />
        </Card>
        {financeLevel >= 4 || isAdmin ? (
          <>
            <SectionTitle>Finanzas</SectionTitle>
            <Choice
              columns={2}
              options={[
                { value: 'default', label: isTopRole(role) ? 'Según su rol (todo)' : role === 'secretary' ? 'Según su rol (ver y cargar)' : 'Sin acceso' },
                ...FIN_ROLES.map((f) => ({ value: f.key as string, label: f.label })),
              ]}
              value={fin === 'manager' ? 'treasurer' : fin === 'none' ? 'default' : fin}
              onChange={setFin}
            />
            <Card style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
                {FIN_ROLES.map((f) => `${f.label}: ${f.hint}`).join('\n')}
              </Text>
            </Card>
          </>
        ) : null}
        <Button title="Guardar" onPress={save} loading={busy} />
      </Screen>
    </View>
  );
}
