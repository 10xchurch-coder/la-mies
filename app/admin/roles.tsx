// Roles y permisos: acá se eligen las personas de cada rol (de la iglesia y de finanzas),
// se ve qué puede hacer cada uno, y a quién le llegan los avisos de ausencias y el informe semanal.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, SectionTitle } from '@/components/ui';
import { listProfiles, setChurchRecipients, setFinanceRole } from '@/lib/api';
import { errorMessage, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Profile } from '@/types';

type ChurchRole = 'admin' | 'secretary' | 'captain';
type FinRole = 'manager' | 'treasurer' | 'secretary' | 'viewer';

const CHURCH_ROLES: { role: ChurchRole; label: string; hint: string }[] = [
  { role: 'admin', label: 'Pastor / administrador', hint: 'Todo: nombra roles, ve todo, finanzas completas.' },
  { role: 'secretary', label: 'Secretaría', hint: 'Carga miembros, prédicas, eventos y zonas; arregla salidas; carga finanzas.' },
  { role: 'captain', label: 'Capitanes', hint: 'Toman asistencia, mandan anuncios, ven el panel, corrigen el mapa.' },
];
const FIN_ROLES: { role: FinRole; label: string; hint: string }[] = [
  { role: 'manager', label: 'Administrador de finanzas', hint: 'Todo en finanzas, también da los roles de finanzas.' },
  { role: 'treasurer', label: 'Tesorero', hint: 'Carga, corrige y anula; maneja fondos, categorías y pases automáticos.' },
  { role: 'secretary', label: 'Secretario de finanzas', hint: 'Carga ingresos, gastos y comprobantes; corrige lo suyo por 7 días.' },
  { role: 'viewer', label: 'Revisor de cuentas', hint: 'Solo mira saldos, movimientos y comprobantes.' },
];

function Picker({ visible, title, people, onPick, onClose }: { visible: boolean; title: string; people: Profile[]; onPick: (p: Profile) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = people.filter((p) => n(p.display_name).includes(n(q.trim())));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
      <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: insets.bottom + 12, maxHeight: '75%' }}>
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
  const { church, profile, isAdmin, isStaff, financeLevel, refreshProfile } = useAuth();
  const [people, setPeople] = useState<Profile[]>([]);
  const [absence, setAbsence] = useState<string[]>(church?.absence_recipients ?? []);
  const [report, setReport] = useState<string[]>(church?.report_recipients ?? []);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<{ kind: 'church'; role: ChurchRole; label: string } | { kind: 'fin'; role: FinRole; label: string } | null>(null);

  const load = useCallback(() => {
    listProfiles().then(setPeople).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const leaders = useMemo(() => people.filter((p) => p.role !== 'member'), [people]);

  const setRole = async (p: Profile, role: ChurchRole | 'member') => {
    const { error } = await supabase.rpc('set_member_role', { p_user: p.id, p_role: role, p_group: p.group_id ?? null });
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
      if (p.role === 'admin' && pk.role !== 'admin') {
        Alert.alert('Es pastor / administrador', `Para cambiar a ${p.display_name}, primero quitalo de administradores.`);
        return;
      }
      setRole(p, pk.role);
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

  const canChurch = (role: ChurchRole) => (role === 'admin' ? isAdmin : isStaff);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Roles y permisos" subtitle="Tocá Agregar para elegir a alguien" back />
      <Screen>
        <SectionTitle>Roles de la iglesia</SectionTitle>
        {CHURCH_ROLES.map((r) => (
          <RoleCard key={r.role} label={r.label} hint={r.hint}
            people={people.filter((p) => p.role === r.role)}
            canEdit={canChurch(r.role)}
            onAdd={() => setPicking({ kind: 'church', role: r.role, label: r.label })}
            onRemove={(p) => {
              if (p.id === profile?.id && r.role === 'admin') { Alert.alert('No te podés quitar a vos mismo'); return; }
              Alert.alert(`Quitar a ${p.display_name}`, `Deja de ser ${r.label.toLowerCase()} y queda como miembro.`, [
                { text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: () => setRole(p, 'member') },
              ]);
            }} />
        ))}
        <Text style={{ fontSize: 12, color: colors.muted }}>{people.filter((p) => p.role === 'member').length} miembros sin rol.</Text>

        <SectionTitle>Finanzas</SectionTitle>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: -8 }}>
          El pastor ve y hace todo en finanzas. La secretaría puede cargar movimientos, salvo que la quites abajo. Los demás no ven nada de finanzas si no tienen uno de estos roles.
        </Text>
        {FIN_ROLES.map((r) => (
          <RoleCard key={r.role} label={r.label} hint={r.hint}
            people={people.filter((p) => p.finance_role === r.role)}
            canEdit={financeLevel >= 4}
            onAdd={() => setPicking({ kind: 'fin', role: r.role, label: r.label })}
            onRemove={(p) => setFin(p, null)} />
        ))}
        {people.some((p) => p.role === 'secretary') && financeLevel >= 4 ? (
          <Card style={{ gap: 8, padding: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Secretaría sin acceso a finanzas</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {people.filter((p) => p.role === 'secretary').map((p) => {
                const off = p.finance_role === 'none';
                return (
                  <Pressable key={p.id} onPress={() => setFin(p, off ? null : ('none' as FinRole))} accessibilityRole="checkbox" accessibilityState={{ checked: off }}
                    style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, borderColor: off ? colors.red : colors.input, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: off ? colors.red : colors.text }}>{off ? `${p.display_name} · sin acceso` : `${p.display_name} · puede cargar`}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ) : null}

        <SectionTitle>¿A quién le llegan los avisos?</SectionTitle>
        <Recipients title="Ausencias del fin de semana" hint="Quiénes faltaron 1, 2 o 3+ semanas, con el mensaje de WhatsApp listo. Si no elegís a nadie, le llega al pastor y a la secretaría." people={leaders} value={absence} onChange={setAbsence} />
        <Recipients title="Informe semanal y mensual" hint="El domingo a la tarde (después de la asistencia) y el 1.º de cada mes. La parte de finanzas solo la ven los que tienen acceso a finanzas." people={leaders} value={report} onChange={setReport} />
        <Button title="Guardar avisos" onPress={saveRecipients} loading={busy} />
      </Screen>
      <Picker visible={!!picking} title={picking ? `Agregar a ${picking.label}` : ''}
        people={people.filter((p) => (picking?.kind === 'church' ? p.role !== picking.role : p.finance_role !== picking?.role))}
        onPick={pick} onClose={() => setPicking(null)} />
    </View>
  );
}
