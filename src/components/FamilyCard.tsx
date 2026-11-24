// La familia de una persona: quiénes son sus parientes, qué lugar ocupa cada uno y quién puede retirar a los chicos.
// Una familia es solo un vínculo: que uno venga no quiere decir que vino la familia. La asistencia es de cada persona.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Face } from './Face';
import { Button, Card, Choice, Field, Tag, Toggle } from './ui';
import {
  householdFamily, removeHouseholdMember, renameHousehold, saveHouseholdMember, searchHouseholds, searchPeople, type HouseholdHit,
} from '../lib/api';
import { FAMILY_ROLES, familyNameFor, isChildRole, roleLabel, sortFamily, suggestRole, type FamilyMember, type FamilyRole } from '../lib/families';
import { errorMessage } from '../lib/supabase';
import { colors } from '../theme';

type Person = { id: string; name: string; photo_path: string | null };

export function FamilyCard({
  contactId, person, canEdit, canSetPickup, onChanged,
}: {
  contactId: string;
  person: { name: string; sex?: 'm' | 'f' | null; age?: number | null };
  /** Puede editar la ficha de esta persona. */
  canEdit: boolean;
  /** Puede marcar quién retira a los chicos (el pastor o la secretaría). */
  canSetPickup: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [mode, setMode] = useState<null | 'join' | 'add' | 'rename'>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Sumarse a una familia
  const [myRole, setMyRole] = useState<FamilyRole>(suggestRole(person));
  const [famQ, setFamQ] = useState('');
  const [famHits, setFamHits] = useState<HouseholdHit[]>([]);
  const [newName, setNewName] = useState(familyNameFor(person.name));
  // Agregar a otra persona
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const [pickedRole, setPickedRole] = useState<FamilyRole>('otro');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    householdFamily(contactId).then((m) => setMembers(sortFamily(m))).catch(() => setMembers([]));
  }, [contactId]);
  useEffect(load, [load]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);

  const family = members?.[0] ?? null;
  const canManage = !!family?.can_manage;
  const first = person.name.trim().split(/\s+/)[0] ?? person.name;

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      after?.();
      load();
      onChanged?.();
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const later = (fn: () => void) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(fn, 250);
  };
  const onFamQ = (v: string) => {
    setFamQ(v);
    if (v.trim().length < 2) { setFamHits([]); return; }
    later(() => searchHouseholds(v.trim()).then(setFamHits).catch(() => setFamHits([])));
  };
  const onQ = (v: string) => {
    setQ(v);
    setPicked(null);
    if (v.trim().length < 2) { setHits([]); return; }
    const inFamily = new Set((members ?? []).map((m) => m.contact_id));
    later(() => searchPeople(v.trim()).then((r) => setHits(r.filter((p) => !inFamily.has(p.id)).slice(0, 6))).catch(() => setHits([])));
  };

  const close = () => { setMode(null); setFamQ(''); setFamHits([]); setQ(''); setHits([]); setPicked(null); };

  const remove = (m: FamilyMember) => {
    Alert.alert(`¿Sacar a ${m.name} de la familia?`, 'Solo se quita el vínculo. Su ficha y su asistencia quedan igual.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sacar', style: 'destructive', onPress: () => run(() => removeHouseholdMember(m.contact_id, m.household_id), () => setEditing(null)) },
    ]);
  };

  if (members === null) return null;
  // Sin familia y sin permiso para armar una: no hay nada que mostrar.
  if (!family && !canEdit) return null;

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="users" size={18} color={colors.amber} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{family ? family.household_name : 'Familia'}</Text>
        {family && canManage && mode === null ? (
          <Text onPress={() => { setNewName(family.household_name); setMode('rename'); }} accessibilityRole="button" style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>Cambiar nombre</Text>
        ) : null}
      </View>

      {mode === 'rename' && family ? (
        <View style={{ gap: 8 }}>
          <Field label="Nombre de la familia" value={newName} onChangeText={setNewName} autoCapitalize="words" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cancelar" variant="ghost" small onPress={close} style={{ flex: 1 }} />
            <Button title="Guardar" small loading={busy} onPress={() => run(() => renameHousehold(family.household_id, newName), close)} style={{ flex: 2 }} />
          </View>
        </View>
      ) : null}

      {!family ? (
        mode === 'join' ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>¿Qué es {first} en la familia?</Text>
            <Choice columns={3} options={FAMILY_ROLES} value={myRole} onChange={setMyRole} />
            <Field label="Buscar una familia que ya está cargada" value={famQ} onChangeText={onFamQ} placeholder="Apellido o nombre de un familiar" autoCapitalize="words" />
            {famHits.map((h) => (
              <Pressable key={h.id} disabled={busy || !h.can_manage} accessibilityRole="button"
                onPress={() => run(() => saveHouseholdMember(contactId, { household: h.id, role: myRole }), close)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: h.can_manage ? 1 : 0.5 }}>
                <Feather name="users" size={18} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{h.name}</Text>
                  {h.members ? <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{h.members}</Text> : null}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.green }}>{h.can_manage ? 'Sumar acá' : 'Pedile al pastor'}</Text>
              </Pressable>
            ))}
            {famQ.trim().length >= 2 && !famHits.length ? <Text style={{ fontSize: 12, color: colors.muted }}>No hay una familia con ese nombre. Podés armar una nueva acá abajo.</Text> : null}
            <Field label="O armar una familia nueva" value={newName} onChangeText={setNewName} placeholder="Familia…" autoCapitalize="words" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Cancelar" variant="ghost" small onPress={close} style={{ flex: 1 }} />
              <Button title="Crear la familia" small loading={busy} disabled={newName.trim().length < 3}
                onPress={() => run(() => saveHouseholdMember(contactId, { newName: newName.trim(), role: myRole }), close)} style={{ flex: 2 }} />
            </View>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>Todavía no está en ninguna familia. Unila con su esposo o esposa y sus hijos para verlos juntos.</Text>
            <Button title="Agregar a una familia" icon="user-plus" variant="outline" small onPress={() => setMode('join')} />
          </>
        )
      ) : (
        <>
          {members.map((m) => {
            const me = m.contact_id === contactId;
            const open = editing === m.contact_id;
            const mayEdit = canManage || (me && canEdit);
            return (
              <View key={m.contact_id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable disabled={me || !m.can_open} accessibilityRole="button" accessibilityLabel={`Abrir a ${m.name}`}
                    onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: m.contact_id } })}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Face name={m.name} path={m.photo_path} size={36} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: me || !m.can_open ? colors.text : colors.green }} numberOfLines={1}>
                        {m.name}{m.age != null ? ` (${m.age})` : ''}{me ? ' · esta ficha' : ''}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        <Tag text={roleLabel(m.role)} tone={isChildRole(m.role) ? 'blue' : 'amber'} />
                        {m.can_pickup ? <Tag text="Puede retirar a los chicos" tone="green" /> : null}
                      </View>
                    </View>
                  </Pressable>
                  {mayEdit ? (
                    <Pressable onPress={() => setEditing(open ? null : m.contact_id)} accessibilityRole="button" accessibilityLabel={`Cambiar a ${m.name}`} style={{ padding: 8 }}>
                      <Feather name={open ? 'chevron-up' : 'edit-2'} size={18} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </View>
                {open ? (
                  <View style={{ gap: 8, paddingBottom: 4 }}>
                    <Choice columns={3} options={FAMILY_ROLES} value={m.role}
                      onChange={(role) => run(() => saveHouseholdMember(m.contact_id, { household: m.household_id, role }))} />
                    {!isChildRole(m.role) ? (
                      <Toggle label="Puede retirar a los chicos" disabled={!canSetPickup || busy} value={m.can_pickup}
                        hint={canSetPickup ? 'Sale en la entrada de los chicos, para saber a quién se los entregan.' : 'Solo el pastor o la secretaría lo pueden cambiar.'}
                        onChange={(v) => run(() => saveHouseholdMember(m.contact_id, { household: m.household_id, role: m.role, canPickup: v }))} />
                    ) : null}
                    <Button title="Sacar de la familia" icon="user-minus" variant="danger" small onPress={() => remove(m)} />
                  </View>
                ) : null}
              </View>
            );
          })}

          {mode === 'add' ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
              <Field label="¿A quién agregamos?" value={picked ? picked.name : q} onChangeText={onQ} placeholder="Buscar por nombre" autoCapitalize="words" />
              {!picked ? hits.map((p) => (
                <Pressable key={p.id} onPress={() => { setPicked(p); setHits([]); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                  <Face name={p.name} path={p.photo_path} size={30} />
                  <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{p.name}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.green }}>Elegir</Text>
                </Pressable>
              )) : null}
              {!picked && q.trim().length >= 2 && !hits.length ? <Text style={{ fontSize: 12, color: colors.muted }}>Si no aparece, primero cargá su ficha en Personas.</Text> : null}
              {picked ? (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>¿Qué es {picked.name.split(' ')[0]} en la familia?</Text>
                  <Choice columns={3} options={FAMILY_ROLES} value={pickedRole} onChange={setPickedRole} />
                </>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Cancelar" variant="ghost" small onPress={close} style={{ flex: 1 }} />
                <Button title="Agregar" small loading={busy} disabled={!picked}
                  onPress={() => picked && run(() => saveHouseholdMember(picked.id, { household: family.household_id, role: pickedRole }), () => { setQ(''); setPicked(null); setPickedRole('otro'); })}
                  style={{ flex: 2 }} />
              </View>
            </View>
          ) : canManage && mode === null ? (
            <Button title="Agregar a otra persona" icon="user-plus" variant="outline" small onPress={() => setMode('add')} />
          ) : null}
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            La familia es solo para verlos juntos. La asistencia se toma a cada uno por separado.
          </Text>
        </>
      )}
    </Card>
  );
}
