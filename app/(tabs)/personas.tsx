// Personas: los contactos de la calle, las visitas y los miembros de la iglesia, con su cara.
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Choice, Empty, Segmented, Tag } from '@/components/ui';
import { listGroups, listPeople } from '@/lib/api';
import { INTEREST_LABEL, PROMISE_LABEL, STATUS_LABEL, allGroupsLabel, fmtRelativeDay, groupWord } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import { CONTENT_MAX_WIDTH, useLayout } from '@/lib/layout';
import type { Contact, Group } from '@/types';

type Scope = 'street' | 'visitor' | 'member' | 'all';
type Filter = 'all' | 'mine' | 'promised' | 'very' | 'week';
type MemberFilter = 'all' | 'unbaptized';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Personas() {
  const router = useRouter();
  const { session, church } = useAuth();
  const [rows, setRows] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [scope, setScope] = useState<Scope>('street');
  const [filter, setFilter] = useState<Filter>('all');
  const [mfilter, setMfilter] = useState<MemberFilter>('all');
  const [route, setRoute] = useState<string>('all');
  const [q, setQ] = useState('');
  const { isWide } = useLayout();
  const cols = isWide ? 2 : 1;

  useFocusEffect(
    useCallback(() => {
      listPeople().then(setRows).catch(() => undefined);
      listGroups().then(setGroups).catch(() => undefined);
    }, []),
  );

  const me = session?.user.id;
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const shown = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const s = norm(q.trim());
    return rows
      .filter((c) => {
        if (scope === 'street' && c.status !== 'contact') return false;
        if (scope === 'visitor' && c.status !== 'visitor') return false;
        if (scope === 'member' && c.status !== 'member') return false;
        if (route !== 'all' && c.group_id !== route) return false;
        if (scope === 'street') {
          if (filter === 'mine' && c.created_by !== me) return false;
          if (filter === 'promised' && !c.promise_day) return false;
          if (filter === 'very' && c.interest !== 'very') return false;
          if (filter === 'week' && new Date(c.created_at).getTime() < weekAgo) return false;
        }
        if (scope === 'member' || scope === 'visitor') {
          if (mfilter === 'unbaptized' && (c.baptized || c.baptized_on)) return false;
        }
        if (s && !norm(`${c.name} ${c.address_hint ?? ''} ${c.address ?? ''} ${c.phone ?? ''}`).includes(s)) return false;
        return true;
      })
      .sort((a, b) => (scope === 'street' ? b.created_at.localeCompare(a.created_at) : a.name.localeCompare(b.name)));
  }, [rows, scope, filter, mfilter, route, q, me]);

  const counts = useMemo(() => ({
    street: rows.filter((c) => c.status === 'contact').length,
    visitor: rows.filter((c) => c.status === 'visitor').length,
    member: rows.filter((c) => c.status === 'member').length,
  }), [rows]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="Personas"
        subtitle={`${counts.member} miembros · ${counts.visitor} visitas · ${counts.street} contactos`}
        right={
          <Pressable onPress={() => router.push('/persona/nueva')} accessibilityRole="button" accessibilityLabel="Agregar persona" style={styles.add}>
            <Feather name="user-plus" size={18} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>Agregar</Text>
          </Pressable>
        }
      />
      <View style={styles.filters}>
        <Segmented
          options={[{ value: 'street', label: 'Calle' }, { value: 'visitor', label: 'Visitas' }, { value: 'member', label: 'Miembros' }, { value: 'all', label: 'Todos' }]}
          value={scope}
          onChange={setScope}
        />
        <View style={styles.search}>
          <Feather name="search" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar por nombre, calle o teléfono" placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} accessibilityLabel="Buscar" />
        </View>
        {scope === 'street' ? (
          <Choice
            options={[{ value: 'all', label: 'Todos' }, { value: 'mine', label: 'Míos' }, { value: 'promised', label: 'Prometieron' }, { value: 'very', label: 'Muy interesados' }, { value: 'week', label: 'Esta semana' }]}
            value={filter}
            onChange={setFilter}
          />
        ) : (
          <>
            {groups.length ? (
              <Choice
                options={[{ value: 'all', label: allGroupsLabel(church?.grouping) }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                value={route}
                onChange={setRoute}
              />
            ) : null}
            {scope === 'member' || scope === 'visitor' ? (
              <Choice options={[{ value: 'all', label: 'Todos' }, { value: 'unbaptized', label: 'Sin bautizar' }]} value={mfilter} onChange={setMfilter} />
            ) : null}
          </>
        )}
      </View>
      <FlatList
        key={cols}
        data={shown}
        keyExtractor={(c) => c.id}
        numColumns={cols}
        columnWrapperStyle={cols > 1 ? { gap: 10 } : undefined}
        contentContainerStyle={styles.list}
        initialNumToRender={20}
        ListEmptyComponent={
          scope === 'street'
            ? <Empty icon="map-pin" title="Todavía no hay contactos acá" text="Cuando marques una casa durante una salida, aparece en esta lista." />
            : <Empty icon="users" title="No hay nadie acá todavía" text="Tocá Agregar para cargar a una persona. La secretaría puede marcarla como miembro." />
        }
        renderItem={({ item: c }) => (
          <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: c.id } })} accessibilityRole="button" style={({ pressed }) => [styles.card, cols > 1 && { maxWidth: '49.5%' }, pressed && { backgroundColor: colors.bgSoft }]}>
            <Face name={c.name} path={c.photo_path} size={48} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 }} numberOfLines={1}>{c.name}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {c.age ? `${c.age}` : ''}{c.age && c.sex ? ' · ' : ''}{c.sex === 'm' ? 'Hombre' : c.sex === 'f' ? 'Mujer' : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {c.status !== 'contact' ? <Tag text={STATUS_LABEL[c.status]} tone={c.status === 'member' ? 'green' : 'blue'} /> : <Tag text={INTEREST_LABEL[c.interest]} tone={c.interest === 'very' ? 'green' : c.interest === 'some' ? 'blue' : c.interest === 'none' ? 'red' : 'gray'} />}
                {c.promise_day && c.status === 'contact' ? <Tag text={`Prometió: ${PROMISE_LABEL[c.promise_day]}${c.pickup && c.pickup_time ? ` · buscarlo ${c.pickup_time}` : ''}`} tone="amber" /> : null}
                {c.baptized || c.baptized_on ? <Tag text="Bautizado" tone="blue" /> : c.discipleship_since ? <Tag text="En discipulado" tone="blue" /> : null}
                {c.group_id && groupName.get(c.group_id) ? <Tag text={groupName.get(c.group_id) as string} tone="gray" /> : null}
                {c.profile_id ? <Tag text="Usa la app" tone="gray" /> : null}
              </View>
              {c.status === 'contact' ? <Text style={{ fontSize: 12, color: colors.muted }}>{c.address_hint ?? 'Sin calle'} · {fmtRelativeDay(c.created_at)}</Text> : null}
            </View>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.green },
  filters: { paddingHorizontal: 16, gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  list: { padding: 16, gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.input },
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
}));
