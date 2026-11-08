// Roles y permisos: las personas de cada rol (de la iglesia y de finanzas), los permisos sueltos
// de cada persona y a quién le llegan los avisos de ausencias y el informe semanal.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, SectionTitle } from '@/components/ui';
import { listProfiles, setChurchRecipients, setFinanceRole } from '@/lib/api';
import { FIN_ROLES, ROLES, hasRole, isTopRole, roleLabel, rolesLabel, type RoleKey } from '@/lib/perms';
import { useRouter } from 'expo-router';
import { errorMessage, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useKeyboardHeight } from '@/lib/keyboard';
import { colors } from '@/theme';
import type { Profile } from '@/types';

type ChurchRole = Exclude<RoleKey, 'member'>;
type FinRole = 'treasurer' | 'secretary' | 'viewer';
const CHURCH_ROLES = ROLES.filter((r) => r.key !== 'member');

function Picker({ visible, title, people, onPick, onClose }: { visible: boolean; title: string; people: Profile[]; onPick: (p: Profile) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const [q, setQ] = useState('');
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = people.filter((p) => n(p.display_name).includes(n(q.trim())));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
      <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: kb ? 12 : insets.bottom + 12, marginBottom: kb, height: kb ? '55%' : '75%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.text }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><Feather name="x" size={20} color={colors.text} /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: colors.bgSoft, paddingHorizontal: 12, marginBottom: 8 }}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar" placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 16, color: colors.text }} autoFocus />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {shown.map((p) => (
            <Pressable key={p.id} onPress={() => onPick(p)} accessibilityRole="button" style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{p.display_name}</Text>
            </Pressable>
          ))}
          {!shown.length ? <Text style={{ color: colors.muted, padding: 12 }}>Nadie con ese nombre. Solo aparecen los que ya tienen cuenta en la app.</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function RoleCard({ label, hint, people, canEdit, onAdd, onRemove }: { label: string; hint: string; people: Profile[]; canEdit: boolean; onAdd: () => void; onRemove: (p: Profile) => void }) {
  return (
    <Card style={{ gap: 8, padding: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{label} <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '600' }}>({people.length})</Text></Text>
      <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{hint}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {people.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 12, paddingRight: canEdit ? 6 : 12, borderRadius: 18, backgroundColor: colors.greenSoft }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.greenText }}>{p.display_name}</Text>
            {canEdit ? (
              <Pressable onPress={() => onRemove(p)} hitSlop={8} accessibilityLabel={`Quitar a ${p.display_name}`} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="x" size={15} color={colors.greenText} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {canEdit ? (
          <Pressable onPress={onAdd} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, borderColor: colors.green, borderStyle: 'dashed' }}>
            <Feather name="plus" size={15} color={colors.green} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.green }}>Agregar</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

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
  const { church, profile, isAdmin, financeLevel, refreshProfile } = useAuth();
  const router = useRouter();
  const iAmTop = isTopRole(profile?.role);
  const [people, setPeople] = useState<Profile[]>([]);
  const [absence, setAbsence] = useState<string[]>(church?.absence_recipients ?? []);
  const [report, setReport] = useState<string[]>(church?.report_recipients ?? []);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<{ kind: 'church'; role: ChurchRole; label: string } | { kind: 'fin'; role: FinRole; label: string } | null>(null);

  const load = useCallback(() => {
    listProfiles().then(setPeople).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const leaders = useMemo(() => people.filter((p) => p.role !== 'member' || (p.extra_roles ?? []).length > 0), [people]);

  const changeRole = async (p: Profile, role: ChurchRole, add: boolean) => {
    const { error } = await supabase.rpc(add ? 'add_member_role' : 'remove_member_role', { p_user: p.id, p_role: role });
    if (error) Alert.alert('No se pudo', errorMessage(error));
    load();
    if (p.id === profile?.id) refreshProfile();
  };
  const setFin = async (p: Profile, role: FinRole | null) => {
    try {
      await setFinanceRole(p.id, role);
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    }
    load();
    if (p.id === profile?.id) refreshProfile();
  };

  const pick = (p: Profile) => {
    const pk = picking;
    setPicking(null);
    if (!pk) return;
    if (pk.kind === 'church') {
      if (isTopRole(p.role) && !iAmTop) {
        Alert.alert(`${p.display_name} es ${roleLabel(p.role).toLowerCase()}`, 'Solo otro pastor o administrador de la app lo puede cambiar.');
        return;
      }
      changeRole(p, pk.role, true);
    } else {
      setFin(p, pk.role);
    }
  };

  const saveRecipients = async () => {
    setBusy(true);
    try {
      await setChurchRecipients(absence, report);
      await refreshProfile();
      Alert.alert('Guardado');
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const canChurch = (role: ChurchRole) => isAdmin && (!isTopRole(role) || iAmTop);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Roles y permisos" subtitle="Tocá Agregar para elegir a alguien" back />
      <Screen>
        <SectionTitle>Roles de la iglesia</SectionTitle>
        {!isAdmin ? <Text style={{ fontSize: 13, color: colors.muted }}>Solo el pastor y el administrador de la app dan roles y permisos. Acá podés ver quién tiene cada uno.</Text> : null}
        {CHURCH_ROLES.map((r) => (
          <RoleCard key={r.key} label={r.label} hint={r.hint}
            people={people.filter((p) => hasRole(p, r.key))}
            canEdit={canChurch(r.key as ChurchRole)}
            onAdd={() => setPicking({ kind: 'church', role: r.key as ChurchRole, label: r.label })}
            onRemove={(p) => {
              if (p.id === profile?.id && isTopRole(r.key)) { Alert.alert('No te podés quitar a vos mismo'); return; }
              Alert.alert(`Quitar a ${p.display_name}`, `Deja de ser ${r.label.toLowerCase()}. Si tiene otros roles, los conserva.`, [
                { text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: () => changeRole(p, r.key as ChurchRole, false) },
              ]);
            }} />
        ))}
        <Text style={{ fontSize: 12, color: colors.muted }}>{people.filter((p) => p.role === 'member' && !(p.extra_roles ?? []).length).length} miembros sin rol. Una persona puede tener varios roles: agregala en cada uno.</Text>

        <SectionTitle>Finanzas</SectionTitle>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: -8 }}>
          El pastor y el administrador de la app ven y hacen todo en finanzas. La secretaría puede ver y cargar movimientos (se lo podés sacar en sus permisos). Los demás no ven nada de finanzas si no tienen uno de estos roles.
        </Text>
        {FIN_ROLES.map((r) => (
          <RoleCard key={r.key} label={r.label} hint={r.hint}
            people={people.filter((p) => p.finance_role === r.key || (r.key === 'treasurer' && p.finance_role === 'manager'))}
            canEdit={isAdmin || financeLevel >= 4}
            onAdd={() => setPicking({ kind: 'fin', role: r.key, label: r.label })}
            onRemove={(p) => setFin(p, null)} />
        ))}
        <SectionTitle>Permisos por persona</SectionTitle>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: -8 }}>
          Cada rol trae sus permisos, pero a cualquiera le podés dar o sacar uno suelto. Por ejemplo: que alguien sin rol pueda editar el calendario, o que una secretaría no vea finanzas.
        </Text>
        <Card style={{ padding: 0 }}>
          {people.map((p, i) => (
            <Pressable key={p.id} onPress={() => router.push({ pathname: '/admin/permisos', params: { id: p.id } })} accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{p.display_name}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{rolesLabel(p)}{p.finance_role && p.finance_role !== 'none' ? ` · ${FIN_ROLES.find((f) => f.key === (p.finance_role === 'manager' ? 'treasurer' : p.finance_role))?.label ?? ''}` : ''}</Text>
              </View>
              <Feather name="sliders" size={18} color={colors.green} />
            </Pressable>
          ))}
        </Card>

        <SectionTitle>¿A quién le llegan los avisos?</SectionTitle>
        <Recipients title="Ausencias del fin de semana" hint="Quiénes faltaron 1, 2 o 3+ semanas, con el mensaje de WhatsApp listo. Pueden ser jefes de ruta o cualquiera con un rol: a todos les llega el mismo informe. Si no elegís a nadie, le llega al pastor y a la secretaría." people={leaders} value={absence} onChange={setAbsence} />
        <Recipients title="Informe semanal y mensual" hint="El domingo a la tarde (después de la asistencia) y el 1.º de cada mes. La parte de finanzas solo la ven los que tienen acceso a finanzas." people={leaders} value={report} onChange={setReport} />
        {isAdmin ? <Button title="Guardar avisos" onPress={saveRecipients} loading={busy} /> : null}
      </Screen>
      <Picker visible={!!picking} title={picking ? `Agregar a ${picking.label}` : ''}
        people={people.filter((p) => (picking?.kind === 'church' ? !hasRole(p, picking.role) : p.finance_role !== picking?.role))}
        onPick={pick} onClose={() => setPicking(null)} />
    </View>
  );
}
