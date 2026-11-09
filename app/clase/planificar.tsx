// Planificar el mes: arma una sugerencia de maestros y ayudantes para todas las clases a la vez.
// Solo para quien tiene el permiso de enseñanza (ens.editar): el pastor o el director de enseñanza.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Empty, Loading, SectionTitle, Tag, Toggle } from '@/components/ui';
import { classSchedule, classTeachers, listClasses, listMembers, listProfiles, saveSchedule } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtDateShort } from '@/lib/format';
import { planMonth, type RotaSlot } from '@/lib/rota';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ClassRow, ClassSchedule, ClassTeacher, Contact, Profile } from '@/types';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const LIMITS: { v: number | null; label: string }[] = [{ v: 1, label: '1' }, { v: 2, label: '2' }, { v: 3, label: '3' }, { v: 4, label: '4' }, { v: null, label: 'Sin límite' }];
const pad = (n: number) => String(n).padStart(2, '0');

export default function Planificar() {
  const router = useRouter();
  const { can, church } = useAuth();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), m: (now.getMonth() + 1) % 12 });
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [members, setMembers] = useState<Contact[]>([]);
  const [limits, setLimits] = useState<Record<string, number | null>>({});
  const [existing, setExisting] = useState<ClassSchedule[]>([]);
  const [replace, setReplace] = useState(false);
  const [plan, setPlan] = useState<RotaSlot[] | null>(null);
  const [edit, setEdit] = useState<{ i: number; who: 'teacher' | 'helper' } | null>(null);
  const [busy, setBusy] = useState(false);

  const from = `${ym.y}-${pad(ym.m + 1)}-01`;
  const to = `${ym.y}-${pad(ym.m + 1)}-${pad(new Date(ym.y, ym.m + 1, 0).getDate())}`;

  useEffect(() => {
    Promise.all([listClasses(), classTeachers(), listProfiles(), listMembers(), supabase.from('teacher_prefs').select('profile_id, per_month')])
      .then(([c, t, p, mem, prefs]) => {
        setClasses(c);
        setTeachers(t);
        setPeople(p);
        setMembers(mem);
        const l: Record<string, number | null> = {};
        for (const r of (prefs.data ?? []) as { profile_id: string; per_month: number | null }[]) l[r.profile_id] = r.per_month;
        setLimits(l);
      })
      .catch(() => setClasses([]));
  }, []);

  const loadExisting = useCallback(() => {
    classSchedule(null, from, to).then(setExisting).catch(() => setExisting([]));
  }, [from, to]);
  useEffect(() => { loadExisting(); setPlan(null); }, [loadExisting]);

  const nameOf = (pid: string | null) => (pid ? people.find((p) => p.id === pid)?.display_name ?? 'Sin nombre' : null);
  const pool = useMemo(() => [...new Set(teachers.map((t) => t.profile_id))].sort((a, b) => (nameOf(a) ?? '').localeCompare(nameOf(b) ?? '')), [teachers, people]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLimit = async (pid: string, v: number | null) => {
    setLimits((l) => ({ ...l, [pid]: v }));
    const { error } = await supabase.from('teacher_prefs').upsert({ profile_id: pid, church_id: church?.id, per_month: v, updated_at: new Date().toISOString() });
    if (error) Alert.alert('No se pudo guardar', errorMessage(error));
  };

  const build = () => {
    if (!classes) return;
    const rc = classes.map((k) => ({
      id: k.id,
      days: k.days ?? ['sat', 'sun'],
      teachers: teachers.filter((t) => t.class_id === k.id && !t.is_helper).map((t) => t.profile_id),
      helpers: teachers.filter((t) => t.class_id === k.id && t.is_helper).map((t) => t.profile_id),
    }));
    setPlan(planMonth({ year: ym.y, month: ym.m, classes: rc, limits, existing, replace }));
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of plan ?? []) for (const p of [s.teacher_id, s.helper_id]) if (p) c[p] = (c[p] ?? 0) + 1;
    return c;
  }, [plan]);

  const contactOf = (pid: string | null) => (pid ? members.find((c) => c.profile_id === pid)?.id ?? null : null);

  const save = () => {
    if (!plan) return;
    const todo = plan.filter((s) => !s.kept);
    Alert.alert('Guardar el mes', `Se van a guardar ${todo.length} turnos de ${MONTHS[ym.m]}. Cada maestro recibe el aviso el lunes de su semana.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar', onPress: async () => {
        setBusy(true);
        try {
          for (const s of todo) {
            const prev = existing.find((e) => e.class_id === s.class_id && e.on_date === s.on_date);
            await saveSchedule({
              class_id: s.class_id, on_date: s.on_date,
              teacher_id: s.teacher_id, helper_id: s.helper_id,
              teacher_contact_id: contactOf(s.teacher_id), helper_contact_id: contactOf(s.helper_id),
              material_id: prev?.material_id ?? null, note: prev?.note ?? null,
            });
          }
          Alert.alert('Listo', 'Los turnos del mes quedaron guardados.');
          router.back();
        } catch (e) {
          Alert.alert('No se pudo guardar', errorMessage(e));
        } finally {
          setBusy(false);
        }
      } },
    ]);
  };

  if (!can('ens.editar')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Planificar el mes" back />
        <Empty icon="lock" title="Sin permiso" text="Esto lo usa el pastor o el director de enseñanza." />
      </View>
    );
  }
  if (!classes) return <Loading />;

  const move = (d: number) => setYm(({ y, m }) => { const n = m + d; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });
  const editing = edit && plan ? plan[edit.i] : null;
  const editPool = editing ? teachers.filter((t) => t.class_id === editing.class_id && t.is_helper === (edit!.who === 'helper')).map((t) => t.profile_id) : [];
  const busyThatDay = (pid: string) => (plan ?? []).some((s, j) => j !== edit?.i && s.on_date === editing?.on_date && (s.teacher_id === pid || s.helper_id === pid));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Planificar el mes" subtitle="Sugerencia de maestros para todas las clases" back />
      <Screen>
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => move(-1)} accessibilityLabel="Mes anterior" hitSlop={12}><Feather name="chevron-left" size={24} color={colors.green} /></Pressable>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, textTransform: 'capitalize' }}>{MONTHS[ym.m]} {ym.y}</Text>
          <Pressable onPress={() => move(1)} accessibilityLabel="Mes siguiente" hitSlop={12}><Feather name="chevron-right" size={24} color={colors.green} /></Pressable>
        </Card>

        <SectionTitle>Cuántas veces por mes</SectionTitle>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>Elegí cuántos turnos puede tener cada maestro en el mes (sumando todas las clases). Se guarda solo.</Text>
        {!pool.length ? <Empty icon="users" title="Todavía no hay maestros" text="Agregalos en cada clase (Maestros → Agregar maestro)." /> : null}
        <Card style={{ padding: 0 }}>
          {pool.map((pid) => (
            <View key={pid} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{nameOf(pid)}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {LIMITS.map((o) => {
                  const on = (limits[pid] ?? null) === o.v;
                  return (
                    <Pressable key={o.label} onPress={() => setLimit(pid, o.v)} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? colors.green : colors.border, backgroundColor: on ? colors.greenSoft : colors.bg }}>
                      <Text style={{ fontSize: 13, fontWeight: on ? '800' : '500', color: on ? colors.greenText : colors.text }}>{o.label}{o.v ? (o.v === 1 ? ' vez' : ' veces') : ''}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </Card>

        <Toggle label="Reemplazar los turnos ya cargados" hint="Si está apagado, se respetan los que ya están y solo se llenan los vacíos." value={replace} onChange={(v) => { setReplace(v); setPlan(null); }} />
        <Button title="Armar sugerencia" icon="shuffle" onPress={build} />

        {plan ? (
          <>
            <SectionTitle>Sugerencia</SectionTitle>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>Tocá un nombre para cambiarlo. Nada se guarda hasta que toques "Guardar el mes".</Text>
            {classes.map((k) => {
              const rows = plan.map((s, i) => ({ s, i })).filter(({ s }) => s.class_id === k.id);
              if (!rows.length) return null;
              const hasHelpers = teachers.some((t) => t.class_id === k.id && t.is_helper);
              return (
                <Card key={k.id} style={{ padding: 0 }}>
                  <Text style={{ padding: 12, fontSize: 16, fontWeight: '800', color: colors.text }}>{k.name}</Text>
                  {rows.map(({ s, i }) => (
                    <View key={s.on_date} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
                      <Text style={{ width: 86, fontSize: 13, fontWeight: '700', color: colors.text }}>{fmtDateShort(s.on_date)}</Text>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Pressable onPress={() => setEdit({ i, who: 'teacher' })} accessibilityRole="button">
                          <Text style={{ fontSize: 14, color: s.teacher_id ? colors.text : colors.red, fontWeight: '600' }}>{nameOf(s.teacher_id) ?? 'Sin maestro disponible'}</Text>
                        </Pressable>
                        {hasHelpers ? (
                          <Pressable onPress={() => setEdit({ i, who: 'helper' })} accessibilityRole="button">
                            <Text style={{ fontSize: 13, color: colors.muted }}>Ayudante: {nameOf(s.helper_id) ?? 'nadie'}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {s.kept ? <Tag text="Ya cargado" /> : null}
                    </View>
                  ))}
                </Card>
              );
            })}
            <SectionTitle>Turnos por persona</SectionTitle>
            <Card style={{ gap: 4 }}>
              {pool.map((pid) => (
                <Text key={pid} style={{ fontSize: 14, color: colors.text }}>
                  {nameOf(pid)}: <Text style={{ fontWeight: '800' }}>{counts[pid] ?? 0}</Text>{limits[pid] ? ` de ${limits[pid]}` : ''}
                </Text>
              ))}
            </Card>
            <Button title="Guardar el mes" icon="check" onPress={save} loading={busy} />
          </>
        ) : null}
      </Screen>
      <PickerModal
        visible={!!edit}
        title={edit?.who === 'helper' ? 'Ayudante' : 'Maestro'}
        allowNone
        items={editPool.map((pid) => ({ id: pid, title: nameOf(pid) ?? '', subtitle: busyThatDay(pid) ? 'Ya tiene otra clase ese día' : `${counts[pid] ?? 0} turnos este mes`, face: false }))}
        onClose={() => setEdit(null)}
        onPick={(v) => {
          if (plan && edit) {
            const next = [...plan];
            next[edit.i] = { ...next[edit.i], [edit.who === 'helper' ? 'helper_id' : 'teacher_id']: v, kept: false };
            setPlan(next);
          }
          setEdit(null);
        }}
      />
    </View>
  );
}

