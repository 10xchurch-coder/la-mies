// El orden de un culto y el equipo de ese día. El líder lo arma y lo publica; cada músico confirma si puede.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { DateChips, PickerModal } from '@/components/Picker';
import { showActions } from '@/components/ActionSheet';
import { Button, Card, Field, Loading, Tag, Toggle } from '@/components/ui';
import {
  addItem, addTeam, answerTeam, copyPlan, deleteItem, deletePlan, getPlan, listSongs, moveItem, removeTeam, totalMinutes, updateItem, updatePlan, worshipAccess,
  KIND_ICON, KIND_LABEL, ROLES, type ItemKind, type Song, type TeamRow, type WorshipItem, type WorshipPlan,
} from '@/lib/worship';
import { listProfiles, listServices } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { fmtDateOnly, fmtDateShort, upcomingDates } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Profile } from '@/types';

const KINDS: ItemKind[] = ['song', 'reading', 'prayer', 'offering', 'announcements', 'special', 'sermon', 'other'];

export default function PlanAlabanza() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [canPlan, setCanPlan] = useState(false);
  const [plan, setPlan] = useState<WorshipPlan | null | undefined>(undefined);
  const [items, setItems] = useState<WorshipItem[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [picker, setPicker] = useState<null | 'song' | 'person'>(null);
  const [edit, setEdit] = useState<WorshipItem | null>(null);
  const [draft, setDraft] = useState({ title: '', song_key: '', minutes: '', who: '', note: '' });

  const load = useCallback(() => {
    getPlan(id).then((r) => { setPlan(r.plan); setItems(r.items); setTeam(r.team); setTitle(r.plan?.title ?? ''); }).catch(() => setPlan(null));
  }, [id]);
  useEffect(() => {
    load();
    worshipAccess().then((a) => setCanPlan(a.plan)).catch(() => undefined);
    listSongs().then(setSongs).catch(() => undefined);
    listProfiles().then(setPeople).catch(() => undefined);
    listServices().then((s) => { const d = [...new Set(s.map((x) => x.dow))]; setDates(upcomingDates(d.length ? d : [0], 12)); }).catch(() => undefined);
  }, [load]);

  const run = (fn: () => Promise<unknown>) => { fn().then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))); };
  const nameOf = (pid: string) => people.find((p) => p.id === pid)?.display_name ?? 'Alguien';
  const nextSort = (items[items.length - 1]?.sort ?? 0) + 10;
  const dateList = useMemo(() => (plan && !dates.includes(plan.on_date) ? [plan.on_date, ...dates] : dates), [dates, plan]);
  const mine = team.filter((t) => t.profile_id === profile?.id);

  const addKind = () => showActions('Agregar al orden', undefined, [
    ...KINDS.map((k) => ({ text: KIND_LABEL[k], icon: KIND_ICON[k], onPress: () => (k === 'song' ? setPicker('song') : run(() => addItem(id, { kind: k, title: KIND_LABEL[k], sort: nextSort }))) })),
    { text: 'Cancelar', icon: 'x' as const },
  ]);
  const pickRole = (pid: string) => showActions(`¿Qué hace ${nameOf(pid)}?`, undefined, [
    ...ROLES.map((r) => ({ text: r, icon: 'user' as const, onPress: () => run(() => addTeam(id, pid, r)) })),
    { text: 'Cancelar', icon: 'x' as const },
  ]);
  const openEdit = (it: WorshipItem) => { setEdit(it); setDraft({ title: it.title, song_key: it.song_key ?? '', minutes: it.minutes ? String(it.minutes) : '', who: it.who ?? '', note: it.note ?? '' }); };
  const saveEdit = () => {
    if (!edit) return;
    const m = parseInt(draft.minutes, 10);
    run(() => updateItem(edit.id, { title: draft.title.trim() || edit.title, song_key: draft.song_key.trim() || null, minutes: m >= 0 && m <= 240 ? m : null, who: draft.who.trim() || null, note: draft.note.trim() || null }));
    setEdit(null);
  };
  const copy = () => showActions('Copiar este orden a otra fecha', 'Se copia el orden, sin el equipo. Queda como borrador.', [
    ...dates.filter((d) => d !== plan?.on_date).slice(0, 6).map((d) => ({ text: fmtDateShort(d), icon: 'copy' as const, onPress: () => { copyPlan(id, d).then((n) => router.replace({ pathname: '/alabanza/plan', params: { id: n } } as unknown as Href)).catch((e) => Alert.alert('No se pudo', errorMessage(e))); } })),
    { text: 'Cancelar', icon: 'x' as const },
  ]);
  const remove = () => Alert.alert('Borrar este culto', 'Se borra el orden y el equipo de este día. Las canciones no se borran.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Borrar', style: 'destructive', onPress: () => deletePlan(id).then(() => router.back()).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
  ]);

  if (plan === undefined) return <Loading />;
  if (!plan) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Culto" back /><Text style={{ padding: 24, color: colors.text }}>No se encontró, o todavía no está publicado.</Text></View>;
  const mins = totalMinutes(items);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={fmtDateOnly(plan.on_date)} subtitle={[plan.title, mins ? `${mins} min` : null, plan.published ? null : 'Borrador'].filter(Boolean).join(' · ') || undefined} back />
      <Screen style={{ gap: 12 }}>
        {mine.map((t) => (
          <Card key={t.id} style={{ gap: 10, borderColor: colors.green, borderWidth: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Te toca: {t.role}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button style={{ flex: 1 }} small title="Puedo" icon="check" variant={t.status === 'yes' ? 'primary' : 'outline'} onPress={() => run(() => answerTeam(t.id, true))} />
              <Button style={{ flex: 1 }} small title="No puedo" icon="x" variant={t.status === 'no' ? 'danger' : 'outline'} onPress={() => run(() => answerTeam(t.id, false))} />
            </View>
          </Card>
        ))}
        {canPlan ? (
          <Card style={{ gap: 12 }}>
            <DateChips dates={dateList} value={plan.on_date} onChange={(d) => run(() => updatePlan(id, { on_date: d }))} format={fmtDateShort} />
            <Field label="Nombre" hint="(opcional: Culto de la mañana, Santa Cena…)" value={title} onChangeText={setTitle} onBlur={() => { if ((plan.title ?? '') !== title.trim()) run(() => updatePlan(id, { title: title.trim() || null })); }} />
            <Toggle label="Publicado" hint="Al publicarlo, el equipo lo ve y puede confirmar." value={plan.published} onChange={(v) => run(() => updatePlan(id, { published: v }))} />
          </Card>
        ) : null}

        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>ORDEN DEL CULTO</Text>
        {!items.length ? <Text style={{ color: colors.muted, fontSize: 14 }}>Todavía no hay nada cargado.</Text> : null}
        {items.map((it, i) => {
          const song = it.song_id ? songs.find((s) => s.id === it.song_id) : null;
          const key = it.song_key ?? song?.song_key;
          return (
            <Card key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ width: 20, fontSize: 14, fontWeight: '800', color: colors.muted, textAlign: 'center' }}>{i + 1}</Text>
              <Feather name={KIND_ICON[it.kind]} size={18} color={colors.green} />
              <Pressable style={{ flex: 1, gap: 2 }} accessibilityRole="button"
                onPress={() => (canPlan ? openEdit(it) : song ? router.push({ pathname: '/alabanza/cancion', params: { id: song.id } } as unknown as Href) : undefined)}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{it.title}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{[KIND_LABEL[it.kind], it.who, it.minutes ? `${it.minutes} min` : null, it.note].filter(Boolean).join(' · ')}</Text>
              </Pressable>
              {key ? <Tag text={key} tone="blue" /> : null}
              {canPlan ? (
                <View style={{ gap: 2 }}>
                  <Pressable hitSlop={6} disabled={i === 0} onPress={() => run(() => moveItem(items, i, -1))} accessibilityLabel="Subir"><Feather name="chevron-up" size={20} color={i === 0 ? colors.border : colors.muted} /></Pressable>
                  <Pressable hitSlop={6} disabled={i === items.length - 1} onPress={() => run(() => moveItem(items, i, 1))} accessibilityLabel="Bajar"><Feather name="chevron-down" size={20} color={i === items.length - 1 ? colors.border : colors.muted} /></Pressable>
                </View>
              ) : song ? <Feather name="chevron-right" size={18} color={colors.muted} /> : null}
            </Card>
          );
        })}
        {edit ? (
          <Card style={{ gap: 12, borderColor: colors.green, borderWidth: 2 }}>
            <Field label="Título" value={draft.title} onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {edit.kind === 'song' ? <Field style={{ flex: 1 }} label="Tono ese día" value={draft.song_key} onChangeText={(v) => setDraft((d) => ({ ...d, song_key: v }))} maxLength={8} /> : null}
              <Field style={{ flex: 1 }} label="Minutos" value={draft.minutes} onChangeText={(v) => setDraft((d) => ({ ...d, minutes: v }))} keyboardType="number-pad" />
            </View>
            <Field label="Quién lo dirige" value={draft.who} onChangeText={(v) => setDraft((d) => ({ ...d, who: v }))} />
            <Field label="Nota" value={draft.note} onChangeText={(v) => setDraft((d) => ({ ...d, note: v }))} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button style={{ flex: 1 }} small title="Guardar" onPress={saveEdit} />
              <Button style={{ flex: 1 }} small title="Quitar" variant="danger" icon="trash-2" onPress={() => { const x = edit; setEdit(null); run(() => deleteItem(x.id)); }} />
            </View>
          </Card>
        ) : null}
        {canPlan ? <Button title="Agregar al orden" icon="plus" variant="outline" onPress={addKind} /> : null}

        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted, marginTop: 6 }}>EQUIPO</Text>
        {!team.length ? <Text style={{ color: colors.muted, fontSize: 14 }}>Todavía no hay nadie asignado.</Text> : null}
        {team.map((t) => (
          <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{nameOf(t.profile_id)}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t.role}</Text>
            </View>
            <Tag text={t.status === 'yes' ? 'Confirmó' : t.status === 'no' ? 'No puede' : 'Sin contestar'} tone={t.status === 'yes' ? 'green' : t.status === 'no' ? 'red' : 'amber'} />
            {canPlan ? <Pressable hitSlop={8} onPress={() => run(() => removeTeam(t.id))} accessibilityLabel="Quitar del equipo"><Feather name="x" size={20} color={colors.muted} /></Pressable> : null}
          </Card>
        ))}
        {canPlan ? (
          <>
            <Button title="Sumar a alguien al equipo" icon="user-plus" variant="outline" onPress={() => setPicker('person')} />
            <Button title="Copiar a otra fecha" icon="copy" variant="ghost" onPress={copy} />
            <Button title="Borrar este culto" icon="trash-2" variant="ghost" onPress={remove} />
          </>
        ) : null}
      </Screen>
      <PickerModal visible={picker === 'song'} title="Elegir canción" onClose={() => setPicker(null)}
        items={songs.filter((s) => !s.archived).map((s) => ({ id: s.id, title: s.title, subtitle: [s.song_key, s.author].filter(Boolean).join(' · ') }))}
        onPick={(sid) => { setPicker(null); const s = songs.find((x) => x.id === sid); if (s) run(() => addItem(id, { kind: 'song', title: s.title, song_id: s.id, sort: nextSort })); }} />
      <PickerModal visible={picker === 'person'} title="¿Quién?" onClose={() => setPicker(null)}
        items={people.map((p) => ({ id: p.id, title: p.display_name ?? 'Sin nombre', face: true }))}
        onPick={(pid) => { setPicker(null); if (pid) setTimeout(() => pickRole(pid), 350); }} />
    </View>
  );
}
