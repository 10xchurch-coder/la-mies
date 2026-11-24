// Un culto: las partes en orden y quién se ocupa de cada una.
// Los líderes cambian todo (se guarda solo); el que tiene una parte lo ve y encuentra lo suyo marcado.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { PickerModal } from '@/components/Picker';
import { Button, Card, Field, Loading, RowLink, SectionTitle, Tag } from '@/components/ui';
import { listProfiles, listSongs } from '@/lib/api';
import { getPlan, removePlan, savePlan } from '@/lib/culto';
import { PLAN_TYPES, mainRoles, moveItem, newItem, patchItem, removeItem, typeInfo, type PlanItem, type ServicePlan } from '@/lib/servicePlan';
import { fmtDateAR, fmtDateShort, maskDateAR, parseDateAR } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Profile, Song } from '@/types';

type IconName = React.ComponentProps<typeof Feather>['name'];

export default function CultoVer() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isLeader } = useAuth();
  const [plan, setPlan] = useState<ServicePlan | null | undefined>(undefined);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [title, setTitle] = useState('');
  const [dateText, setDateText] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | 'who' | 'song'>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  // Lo que falta guardar: se manda un segundo después del último cambio, y también al salir de la pantalla.
  const pending = useRef<{ service_date?: string; title?: string; items?: PlanItem[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getPlan(id).then((p) => {
      setPlan(p);
      if (p) { setItems(p.items); setTitle(p.title); setDateText(fmtDateAR(p.service_date)); }
    }).catch(() => setPlan(null));
  }, [id]);
  useEffect(() => {
    if (!isLeader) return;
    listProfiles().then(setPeople).catch(() => undefined);
    listSongs().then(setSongs).catch(() => undefined);
  }, [isLeader]);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    savePlan(id, patch).then(() => setSaved('ok')).catch(() => { pending.current = { ...patch, ...(pending.current ?? {}) }; setSaved('error'); });
  }, [id]);
  useEffect(() => () => flush(), [flush]);

  const queue = (patch: { service_date?: string; title?: string; items?: PlanItem[] }) => {
    pending.current = { ...(pending.current ?? {}), ...patch };
    setSaved('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  };
  const change = (next: PlanItem[]) => { setItems(next); queue({ items: next }); };

  if (plan === undefined) return <Loading />;
  if (!plan) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title="Orden del culto" back /><Text style={{ padding: 24, color: colors.text }}>No se encontró, o no tenés una parte en este culto.</Text></View>;

  const cur = items.find((x) => x.id === open) ?? null;
  const roles = mainRoles(items);
  const mine = items.filter((x) => x.whoId && x.whoId === profile?.id);

  const remove = () => Alert.alert('Borrar este culto', '¿Seguro? Se borra el orden entero.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Borrar', style: 'destructive', onPress: async () => {
      pending.current = null;
      try { await removePlan(id); router.back(); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); }
    } },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={title || plan.title} subtitle={fmtDateShort(parseDateAR(dateText, true) ?? plan.service_date)} back />
      <Screen>
        {isLeader ? (
          <Card style={{ gap: 10 }}>
            <Field label="Nombre" value={title} onChangeText={(t) => { setTitle(t); if (t.trim().length >= 2) queue({ title: t.trim() }); }} />
            <Field label="Fecha" placeholder="DD/MM/AAAA" keyboardType="number-pad" maxLength={10} value={dateText}
              onChangeText={(t) => { const m = maskDateAR(t, dateText); setDateText(m); const iso = parseDateAR(m, true); if (iso) queue({ service_date: iso }); }} />
          </Card>
        ) : null}
        {mine.length ? (
          <Card style={{ gap: 4, backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }}>
            <Text style={{ fontSize: 12, fontWeight: '900', color: colors.greenText }}>TE TOCA</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{mine.map((x) => x.title).join(' · ')}</Text>
          </Card>
        ) : null}
        {roles.length ? (
          <View style={{ gap: 2 }}>
            {roles.map((r) => <Text key={r.label} style={{ fontSize: 14, color: colors.muted }}>{r.label}: <Text style={{ color: colors.text, fontWeight: '700' }}>{r.names.join(', ')}</Text></Text>)}
          </View>
        ) : null}

        <SectionTitle>Las partes, en orden</SectionTitle>
        {!items.length ? <Text style={{ fontSize: 14, color: colors.muted }}>Todavía no hay partes.</Text> : null}
        {items.map((it, i) => {
          const info = typeInfo(it.type);
          const isMine = !!it.whoId && it.whoId === profile?.id;
          const isOpen = isLeader && open === it.id;
          const goSong = !isLeader && it.type === 'song' && it.songId ? () => router.push(`/canciones/${it.songId}` as Href) : undefined;
          return (
            <Card key={it.id} style={[{ gap: 10, padding: 12 }, isMine && { borderColor: colors.green, borderWidth: 2 }]}>
              <Pressable onPress={isLeader ? () => setOpen(isOpen ? null : it.id) : goSong} disabled={!isLeader && !goSong} accessibilityRole="button"
                accessibilityLabel={`${i + 1}. ${it.title}${it.whoName ? `, ${it.whoName}` : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ width: 22, fontSize: 15, fontWeight: '800', color: colors.muted, textAlign: 'center' }}>{i + 1}</Text>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={info.icon as IconName} size={17} color={colors.greenText} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{it.title}</Text>
                  <Text style={{ fontSize: 13, color: it.whoName ? colors.text : colors.muted }}>
                    {[it.title !== info.label ? info.label : null, it.ref, it.whoName ?? (isLeader ? 'Sin responsable' : null)].filter(Boolean).join(' · ')}
                  </Text>
                  {it.note ? <Text style={{ fontSize: 12, color: colors.muted }}>{it.note}</Text> : null}
                </View>
                {isMine ? <Tag text="Vos" tone="green" /> : null}
                {isLeader ? <Feather name={isOpen ? 'chevron-up' : 'edit-2'} size={17} color={colors.muted} /> : goSong ? <Feather name="chevron-right" size={18} color={colors.muted} /> : null}
              </Pressable>
              {isOpen ? (
                <View style={{ gap: 10 }}>
                  {it.type === 'song' ? <Button title={it.songId ? 'Cambiar la canción' : 'Elegir del Cancionero'} icon="music" variant="outline" small onPress={() => setPicker('song')} /> : null}
                  <Field label={it.type === 'song' ? 'Canción' : 'Título'} value={it.title} onChangeText={(t) => change(patchItem(items, it.id, { title: t, ...(it.type === 'song' ? { songId: null } : {}) }))} />
                  {it.type === 'reading' ? <Field label="Pasaje" placeholder="Salmos 23" value={it.ref ?? ''} onChangeText={(t) => change(patchItem(items, it.id, { ref: t || null }))} /> : null}
                  <Card style={{ padding: 0 }}>
                    <RowLink icon="user" title={it.whoName ?? 'Elegir quién lo hace'} subtitle={it.whoId ? 'Usa la app: le llega un aviso el día antes' : it.whoName ? 'No usa la app: avisale vos' : 'Responsable'} onPress={() => setPicker('who')} />
                  </Card>
                  {!it.whoId ? <Field label="O escribí el nombre" hint="(si no usa la app)" value={it.whoName ?? ''} autoCapitalize="words" onChangeText={(t) => change(patchItem(items, it.id, { whoName: t || null, whoId: null }))} /> : null}
                  <Field label="Nota" hint="(opcional)" value={it.note ?? ''} onChangeText={(t) => change(patchItem(items, it.id, { note: t || null }))} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Subir" icon="arrow-up" variant="outline" small disabled={i === 0} onPress={() => change(moveItem(items, it.id, -1))} style={{ flex: 1 }} />
                    <Button title="Bajar" icon="arrow-down" variant="outline" small disabled={i === items.length - 1} onPress={() => change(moveItem(items, it.id, 1))} style={{ flex: 1 }} />
                    <Button title="Sacar" icon="trash-2" variant="danger" small onPress={() => { setOpen(null); change(removeItem(items, it.id)); }} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}

        {isLeader ? (
          <>
            <SectionTitle>Agregar una parte</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PLAN_TYPES.map((t) => (
                <Pressable key={t.type} onPress={() => { const n = newItem(t.type); change([...items, n]); setOpen(n.id); }} accessibilityRole="button" accessibilityLabel={`Agregar ${t.label}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: colors.input, backgroundColor: colors.bg }}>
                  <Feather name={t.icon as IconName} size={15} color={colors.green} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 12, color: saved === 'error' ? colors.red : colors.muted, textAlign: 'right' }}>
              {saved === 'saving' ? 'Guardando…' : saved === 'ok' ? 'Guardado' : saved === 'error' ? 'No se pudo guardar. Revisá tu conexión.' : 'Se guarda solo. Lo ven los líderes y los que tienen una parte.'}
            </Text>
            <Button title="Borrar este culto" variant="danger" small onPress={remove} />
          </>
        ) : null}
      </Screen>

      <PickerModal visible={picker === 'who' && !!cur} title="¿Quién lo hace?" allowNone noneLabel="Nadie / quitar"
        items={people.map((p) => ({ id: p.id, title: p.display_name }))} onClose={() => setPicker(null)}
        onPick={(pid) => { if (cur) change(patchItem(items, cur.id, { whoId: pid, whoName: pid ? people.find((p) => p.id === pid)?.display_name ?? null : null })); setPicker(null); }} />
      <PickerModal visible={picker === 'song' && !!cur} title="Elegí la canción"
        items={songs.map((s) => ({ id: s.id, title: s.title, subtitle: s.author ?? undefined, face: false }))} onClose={() => setPicker(null)}
        onPick={(sid) => { const s = songs.find((x) => x.id === sid); if (cur && s) change(patchItem(items, cur.id, { songId: s.id, title: s.title })); setPicker(null); }} />
    </View>
  );
}
