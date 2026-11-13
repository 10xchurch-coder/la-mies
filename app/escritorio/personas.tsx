// Tabla de personas del escritorio: buscar, filtrar, ordenar, corregir un dato sin salir de la tabla y bajar la lista a Excel.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DeskButton, DeskPage } from '@/components/desk/DeskShell';
import { Face } from '@/components/Face';
import { listGroups, listPeople, peopleEngagement, updateContact } from '@/lib/api';
import { ageOf, daysSince, filterPeople, sortPeople, toCsv, type PersonFilter, type PersonSort } from '@/lib/desk';
import { FAITH_LABEL, STATUS_LABEL, fmtDateAR, fmtDateShort, groupWord, maskDateAR, parseDateAR } from '@/lib/format';
import { useLayout } from '@/lib/layout';
import { openWhatsApp } from '@/lib/messages';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { Contact, Engagement, Group, PersonStatus } from '@/types';

type Opt = { value: string; label: string };

/** Lista desplegable. En la computadora es la del navegador (se maneja con el teclado); en el teléfono va pasando de opción. */
function Select({ value, options, onChange, label, width }: { value: string; options: Opt[]; onChange: (v: string) => void; label: string; width?: number }) {
  if (Platform.OS === 'web') {
    return React.createElement('select', {
      'aria-label': label, value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: { height: 36, width, maxWidth: '100%', borderRadius: 9, border: `1px solid ${colors.input}`, background: colors.bg, color: colors.text, padding: '0 8px', fontSize: 13, fontWeight: 600, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    }, options.map((o) => React.createElement('option', { key: o.value, value: o.value }, o.label)));
  }
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => onChange(options[(i + 1) % options.length].value)}
      style={{ height: 36, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.input, justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{options[i]?.label}</Text>
    </Pressable>
  );
}

// "min" es el ancho que tiene que tener la tabla para que la columna entre sin apretar a las demás.
const COLS: { key: PersonSort | 'phone' | 'baptized'; label: string; width?: number; flex?: number; sort?: PersonSort; min?: number }[] = [
  { key: 'name', label: 'Nombre', flex: 2.4, sort: 'name' },
  { key: 'status', label: 'Estado', width: 92, sort: 'status' },
  { key: 'group', label: 'Grupo', flex: 1.2, sort: 'group', min: 800 },
  { key: 'phone', label: 'Teléfono', flex: 1.2, min: 520 },
  { key: 'age', label: 'Edad', width: 64, sort: 'age', min: 900 },
  { key: 'baptized', label: 'Bautizado', width: 96, min: 1000 },
  { key: 'last', label: 'Última vez', width: 112, sort: 'last' },
  { key: 'pct', label: 'Asistencia', width: 150, sort: 'pct', min: 660 },
];

export default function DeskPeople() {
  const router = useRouter();
  const { church, isStaff, can } = useAuth();
  const { width } = useLayout();
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [eng, setEng] = useState<Engagement[]>([]);
  const [filter, setFilter] = useState<PersonFilter>({ q: '', status: 'member', group: 'all', extra: 'all' });
  const [sort, setSort] = useState<{ by: PersonSort; dir: 1 | -1 }>({ by: 'name', dir: 1 });
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    listPeople().then(setRows).catch(() => setRows([]));
    listGroups().then(setGroups).catch(() => undefined);
    peopleEngagement(12).then(setEng).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const gw = groupWord(church?.grouping);
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const engOf = useMemo(() => new Map(eng.map((e) => [e.contact_id, e])), [eng]);
  const last = useMemo(() => new Map<string, string | null>(eng.map((e) => [e.contact_id, e.last_attended])), [eng]);
  const pct = useMemo(() => new Map(eng.filter((e) => e.possible > 0).map((e) => [e.contact_id, Number(e.pct)])), [eng]);

  const all = rows ?? [];
  const shown = useMemo(
    () => sortPeople(filterPeople(all, filter, last), sort.by, sort.dir, { groupName, last, pct }),
    [all, filter, sort, groupName, last, pct],
  );
  const counts = useMemo(() => ({
    all: all.length,
    member: all.filter((c) => c.status === 'member').length,
    visitor: all.filter((c) => c.status === 'visitor').length,
    contact: all.filter((c) => c.status === 'contact').length,
  }), [all]);

  const open = openId ? all.find((c) => c.id === openId) ?? null : null;
  // El panel del costado va al lado de la tabla si hay lugar; si no, flota encima.
  const floating = width < 1280;
  const tableWidth = width - (width < 900 ? 0 : 252) - 56 - (open && !floating ? 376 : 0);
  const cols = COLS.filter((c) => !c.min || tableWidth >= c.min).filter((c) => c.key !== 'group' || church?.grouping !== 'none')
    .map((c) => (c.key === 'group' ? { ...c, label: gw } : c));

  const exportCsv = () => {
    const csv = toCsv(
      ['Nombre', 'Estado', gw, 'Teléfono', 'Correo', 'Domicilio', 'Nacimiento', 'Edad', 'Bautizado', 'Miembro desde', 'Última vez que vino', 'Asistencia % (12 semanas)'],
      shown.map((c) => [c.name, STATUS_LABEL[c.status] ?? c.status, groupName.get(c.group_id ?? '') ?? '', c.phone, c.email, c.address ?? c.address_hint,
        fmtDateAR(c.birthdate), ageOf(c), c.baptized || c.baptized_on ? 'Sí' : 'No', fmtDateAR(c.member_since), fmtDateAR(last.get(c.id) ?? null), pct.has(c.id) ? Math.round(pct.get(c.id)!) : '']),
    );
    if (Platform.OS !== 'web') return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `personas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const toggleSort = (by: PersonSort) => setSort((s) => (s.by === by ? { by, dir: (s.dir * -1) as 1 | -1 } : { by, dir: by === 'last' || by === 'pct' ? -1 : 1 }));

  const tabs: { value: PersonFilter['status']; label: string; n: number }[] = [
    { value: 'member', label: 'Miembros', n: counts.member },
    { value: 'visitor', label: 'Visitas', n: counts.visitor },
    { value: 'contact', label: 'Contactos', n: counts.contact },
    { value: 'all', label: 'Todos', n: counts.all },
  ];

  return (
    <DeskPage
      scroll={false}
      title="Personas"
      subtitle={rows ? `${shown.length} de ${counts.all} personas` : 'Cargando…'}
      actions={<>
        <DeskButton label="Bajar a Excel" icon="download" onPress={exportCsv} disabled={!shown.length} />
        {can('personas.editar') ? <DeskButton label="Importar" icon="upload" onPress={() => router.push('/importar' as Href)} /> : null}
        <DeskButton label="Agregar persona" icon="user-plus" primary onPress={() => router.push('/persona/nueva')} />
      </>}
    >
      <View style={styles.toolbar}>
        <View style={styles.search}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            accessibilityLabel="Buscar persona" placeholder="Buscar por nombre, teléfono o domicilio" placeholderTextColor={colors.muted}
            value={filter.q} onChangeText={(q) => setFilter((f) => ({ ...f, q }))}
            style={[{ flex: 1, fontSize: 14, color: colors.text, height: 36 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          />
          {filter.q ? <Pressable accessibilityLabel="Borrar búsqueda" onPress={() => setFilter((f) => ({ ...f, q: '' }))}><Feather name="x" size={16} color={colors.muted} /></Pressable> : null}
        </View>
        <View style={styles.tabs}>
          {tabs.map((t) => {
            const on = filter.status === t.value;
            return (
              <Pressable key={t.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter((f) => ({ ...f, status: t.value }))}
                style={[styles.tab, on && { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Text style={{ fontSize: 13, fontWeight: on ? '800' : '600', color: on ? colors.text : colors.muted }}>{t.label} <Text style={{ fontWeight: '600', color: colors.muted }}>{t.n}</Text></Text>
              </Pressable>
            );
          })}
        </View>
        {church?.grouping !== 'none' && groups.length ? (
          <Select label={gw} value={filter.group} onChange={(group) => setFilter((f) => ({ ...f, group }))} width={170}
            options={[{ value: 'all', label: `${gw}: todos` }, ...groups.map((g) => ({ value: g.id, label: g.name })), { value: 'none', label: `Sin ${gw.toLowerCase()}` }]} />
        ) : null}
        <Select label="Más filtros" value={filter.extra} onChange={(extra) => setFilter((f) => ({ ...f, extra: extra as PersonFilter['extra'] }))} width={210}
          options={[
            { value: 'all', label: 'Sin más filtros' },
            { value: 'absent', label: 'No vienen hace 3 semanas o más' },
            { value: 'unbaptized', label: 'Sin bautizar' },
            { value: 'no_phone', label: 'Sin teléfono' },
            { value: 'no_account', label: 'Sin cuenta en la app' },
          ]} />
      </View>

      <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 16 }}>
        <View style={styles.table}>
          <View style={styles.thead}>
            {cols.map((c) => {
              const active = c.sort && sort.by === c.sort;
              return (
                <Pressable key={c.key} disabled={!c.sort} onPress={() => c.sort && toggleSort(c.sort)} accessibilityRole={c.sort ? 'button' : undefined}
                  accessibilityLabel={c.sort ? `Ordenar por ${c.label}` : undefined}
                  style={[styles.cell, c.width ? { width: c.width } : { flex: c.flex }, { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }]}>
                  <Text style={[styles.th, active && { color: colors.text }]} numberOfLines={1}>{c.label}</Text>
                  {active ? <Feather name={sort.dir === 1 ? 'arrow-up' : 'arrow-down'} size={12} color={colors.text} /> : null}
                </Pressable>
              );
            })}
          </View>
          <FlatList
            data={shown}
            keyExtractor={(c) => c.id}
            initialNumToRender={40}
            windowSize={9}
            ListEmptyComponent={rows ? (
              <View style={{ padding: 40, alignItems: 'center', gap: 6 }}>
                <Feather name="users" size={28} color={colors.gray} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>No hay nadie con esos filtros</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>Probá con otra búsqueda o quitá algún filtro.</Text>
              </View>
            ) : undefined}
            renderItem={({ item: c }) => {
              const e = engOf.get(c.id);
              const lastOn = last.get(c.id) ?? null;
              const days = daysSince(lastOn);
              const cell = (key: string): React.ReactNode => {
                switch (key) {
                  case 'name': return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Face name={c.name} path={c.photo_path} size={30} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                        {c.address || c.address_hint ? <Text style={styles.sub} numberOfLines={1}>{c.address ?? c.address_hint}</Text> : null}
                      </View>
                    </View>
                  );
                  case 'status': return <StatusPill status={c.status} />;
                  case 'group': return <Text style={styles.td} numberOfLines={1}>{groupName.get(c.group_id ?? '') ?? '—'}</Text>;
                  case 'phone': return <Text style={styles.td} numberOfLines={1}>{c.phone ?? '—'}</Text>;
                  case 'age': return <Text style={styles.td}>{ageOf(c) ?? '—'}</Text>;
                  case 'baptized': return c.baptized || c.baptized_on ? <Feather name="check" size={16} color={colors.green} /> : <Text style={[styles.td, { color: colors.muted }]}>No</Text>;
                  case 'last': return (
                    <Text style={[styles.td, c.status !== 'contact' && days !== null && days >= 21 && { color: colors.red, fontWeight: '700' }]} numberOfLines={1}>
                      {lastOn ? fmtDateShort(lastOn) : '—'}
                    </Text>
                  );
                  case 'pct': return e && e.possible > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.graySoft, overflow: 'hidden' }}>
                        <View style={{ width: `${Math.min(100, Number(e.pct))}%`, height: '100%', borderRadius: 3, backgroundColor: Number(e.pct) >= 80 ? colors.green : Number(e.pct) >= 50 ? colors.blue : colors.amber }} />
                      </View>
                      <Text style={[styles.td, { width: 38, textAlign: 'right' }]}>{Math.round(Number(e.pct))}%</Text>
                    </View>
                  ) : <Text style={[styles.td, { color: colors.muted }]}>—</Text>;
                  default: return null;
                }
              };
              const on = openId === c.id;
              return (
                <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${c.name}`} onPress={() => setOpenId(on ? null : c.id)}
                  style={(s) => [styles.tr, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.bgSoft }, on && { backgroundColor: colors.greenSoft }]}>
                  {cols.map((col) => (
                    <View key={col.key} style={[styles.cell, col.width ? { width: col.width } : { flex: col.flex }]}>{cell(col.key)}</View>
                  ))}
                </Pressable>
              );
            }}
          />
        </View>

        {open ? (
          <PersonDrawer
            key={open.id} person={open} groups={groups} groupWordLabel={gw} showGroup={church?.grouping !== 'none'} canEdit={isStaff}
            engagement={engOf.get(open.id) ?? null} floating={floating}
            onClose={() => setOpenId(null)}
            onSaved={(patch) => setRows((rs) => (rs ?? []).map((r) => (r.id === open.id ? { ...r, ...patch } : r)))}
            onOpenFull={() => router.push({ pathname: '/contacto/[id]', params: { id: open.id } })}
          />
        ) : null}
      </View>
    </DeskPage>
  );
}

function StatusPill({ status }: { status: PersonStatus }) {
  const bg = status === 'member' ? colors.greenSoft : status === 'visitor' ? colors.blueSoft : colors.graySoft;
  const fg = status === 'member' ? colors.greenText : status === 'visitor' ? colors.blueText : colors.grayText;
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: bg, justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: fg }}>{STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

/** Panel del costado: los datos de una persona, para corregirlos sin salir de la tabla. */
function PersonDrawer({ person, groups, groupWordLabel, showGroup, canEdit, engagement, floating, onClose, onSaved, onOpenFull }: {
  person: Contact; groups: Group[]; groupWordLabel: string; showGroup: boolean; canEdit: boolean; engagement: Engagement | null; floating: boolean;
  onClose: () => void; onSaved: (patch: Partial<Contact>) => void; onOpenFull: () => void;
}) {
  const start = useMemo(() => ({
    name: person.name, phone: person.phone ?? '', email: person.email ?? '', address: person.address ?? '',
    birth: fmtDateAR(person.birthdate), status: person.status as string, group: person.group_id ?? '',
  }), [person]);
  const [f, setF] = useState(start);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setF(start); }, [start]);
  const dirty = (Object.keys(start) as (keyof typeof start)[]).some((k) => f[k] !== start[k]);

  const save = async () => {
    const birthdate = f.birth.trim() ? parseDateAR(f.birth) : null;
    if (!f.name.trim()) return Alert.alert('Falta el nombre', 'Escribí el nombre de la persona.');
    if (f.birth.trim() && !birthdate) return Alert.alert('Revisá la fecha', 'Escribí la fecha de nacimiento así: 08/12/1993.');
    // Se manda solo lo que cambió, para no pisar lo que otro haya corregido mientras tanto.
    const patch: Partial<Contact> = {};
    if (f.name !== start.name) patch.name = f.name.trim();
    if (f.phone !== start.phone) patch.phone = f.phone.trim() || null;
    if (f.email !== start.email) patch.email = f.email.trim() || null;
    if (f.address !== start.address) patch.address = f.address.trim() || null;
    if (f.birth !== start.birth) patch.birthdate = birthdate;
    if (f.status !== start.status) patch.status = f.status as PersonStatus;
    if (f.group !== start.group) patch.group_id = f.group || null;
    setBusy(true);
    try {
      await updateContact(person.id, patch);
      onSaved(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const faith = engagement ? FAITH_LABEL[engagement.category] : null;
  return (
    <View style={[styles.drawer, floating && styles.drawerFloating]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Face name={person.name} path={person.photo_path} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }} numberOfLines={2}>{person.name}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {STATUS_LABEL[person.status]}{person.member_since ? ` desde ${fmtDateAR(person.member_since)}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={{ padding: 6 }}>
          <Feather name="x" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <DeskButton label="WhatsApp" icon="message-circle" disabled={!person.phone} onPress={() => openWhatsApp(person.phone, '')} />
          <DeskButton label="Llamar" icon="phone" disabled={!person.phone} onPress={() => Linking.openURL(`tel:${person.phone}`)} />
        </View>
        {engagement && engagement.possible > 0 ? (
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: colors.bgSoft, gap: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
              Vino {engagement.attended} de {engagement.possible} veces en 12 semanas{faith ? ` · ${faith.label}` : ''}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {engagement.last_attended ? `Última vez: ${fmtDateAR(engagement.last_attended)}` : 'Todavía sin asistencia anotada'}
            </Text>
          </View>
        ) : null}
        <Input label="Nombre" value={f.name} onChange={(name) => setF((x) => ({ ...x, name }))} editable={canEdit} />
        <Input label="Teléfono" value={f.phone} onChange={(phone) => setF((x) => ({ ...x, phone }))} editable={canEdit} keyboard="phone-pad" />
        <Input label="Correo" value={f.email} onChange={(email) => setF((x) => ({ ...x, email }))} editable={canEdit} keyboard="email-address" />
        <Input label="Domicilio" value={f.address} onChange={(address) => setF((x) => ({ ...x, address }))} editable={canEdit} />
        <Input label="Fecha de nacimiento" placeholder="08/12/1993" value={f.birth} onChange={(birth) => setF((x) => ({ ...x, birth: maskDateAR(birth, x.birth) }))} editable={canEdit} />
        {canEdit ? (
          <>
            <View style={{ gap: 4 }}>
              <Text style={styles.label}>Estado</Text>
              <Select label="Estado" value={f.status} onChange={(status) => setF((x) => ({ ...x, status }))}
                options={[{ value: 'member', label: 'Miembro' }, { value: 'visitor', label: 'Visita' }, { value: 'contact', label: 'Contacto' }]} />
            </View>
            {showGroup && groups.length ? (
              <View style={{ gap: 4 }}>
                <Text style={styles.label}>{groupWordLabel}</Text>
                <Select label={groupWordLabel} value={f.group} onChange={(group) => setF((x) => ({ ...x, group }))}
                  options={[{ value: '', label: `Sin ${groupWordLabel.toLowerCase()}` }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <View style={{ padding: 14, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        {canEdit ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <DeskButton label={busy ? 'Guardando…' : 'Guardar cambios'} icon="check" primary disabled={!dirty || busy} onPress={save} />
            {saved ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>Guardado</Text> : dirty ? <Text style={{ fontSize: 12, color: colors.muted }}>Hay cambios sin guardar</Text> : null}
          </View>
        ) : null}
        <Pressable accessibilityRole="link" onPress={onOpenFull} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.green }}>Abrir la ficha completa</Text>
          <Feather name="chevron-right" size={15} color={colors.green} />
        </Pressable>
      </View>
    </View>
  );
}

function Input({ label, value, onChange, editable, placeholder, keyboard }: { label: string; value: string; onChange: (v: string) => void; editable: boolean; placeholder?: string; keyboard?: 'phone-pad' | 'email-address' }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={editable} placeholder={placeholder} placeholderTextColor={colors.muted}
        keyboardType={keyboard} autoCapitalize={keyboard === 'email-address' ? 'none' : undefined}
        style={[styles.input, !editable && { backgroundColor: colors.bgSoft, borderColor: colors.border }]} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1, flexBasis: 260, maxWidth: 420, height: 38, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: colors.graySoft },
  tab: { height: 30, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  table: { flex: 1, minWidth: 0, backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  thead: { flexDirection: 'row', paddingHorizontal: 12, height: 38, alignItems: 'center', backgroundColor: colors.bgSoft, borderBottomWidth: 1, borderBottomColor: colors.border },
  tr: { flexDirection: 'row', paddingHorizontal: 12, minHeight: 48, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cell: { paddingHorizontal: 6, justifyContent: 'center' },
  th: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted },
  td: { fontSize: 13, color: colors.text },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted },
  drawer: { width: 360, backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  drawerFloating: { position: 'absolute', top: 0, right: 0, bottom: 0, maxWidth: '100%', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: -4, height: 0 } },
  label: { fontSize: 12, fontWeight: '700', color: colors.label },
  input: { height: 38, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.bg, fontSize: 14, color: colors.text },
}));
