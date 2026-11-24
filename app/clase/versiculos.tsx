// Versículos de memoria de una clase: el maestro arma la lista, tilda qué chico aprendió cada uno,
// y los chicos ganan un premio a los 5, a los 10 y a los 25 versículos.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { BadgeRow } from '@/components/VerseBadges';
import { Button, Card, Field, Loading, SectionTitle, Toggle } from '@/components/ui';
import { classStudents, classTeachers, listClasses } from '@/lib/api';
import { addVerse, classVerses, hideVerse, setVerseDone, versesDone } from '@/lib/culto';
import { BADGES, countByChild, progressText, versesLabel, type MemoryVerse, type VerseDone } from '@/lib/verses';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Contact } from '@/types';

export default function Versiculos() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, can } = useAuth();
  const [name, setName] = useState('');
  const [verses, setVerses] = useState<MemoryVerse[] | null>(null);
  const [students, setStudents] = useState<Contact[]>([]);
  const [done, setDone] = useState<VerseDone[]>([]);
  const [isTeacher, setIsTeacher] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reference, setReference] = useState('');
  const [body, setBody] = useState('');
  const [forAll, setForAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    listClasses().then((cs) => setName(cs.find((c) => c.id === id)?.name ?? '')).catch(() => undefined);
    classTeachers(id).then((t) => setIsTeacher(t.some((x) => x.profile_id === profile?.id))).catch(() => undefined);
    try {
      const [v, s] = await Promise.all([classVerses(id), classStudents(id).catch(() => [] as Contact[])]);
      setVerses(v);
      setStudents(s);
      setDone(await versesDone(s.map((x) => x.id)).catch(() => []));
    } catch {
      setVerses([]);
    }
  }, [id, profile?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const leader = can('ens.editar');
  const canMark = leader || isTeacher;
  const list = verses ?? [];
  const counts = useMemo(() => countByChild(done, (verses ?? []).map((v) => v.id)), [done, verses]);
  const has = (v: string, c: string) => done.some((d) => d.verse_id === v && d.contact_id === c);
  const ranked = [...students].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'es'));

  const toggle = async (verseId: string, contactId: string) => {
    if (!canMark) return;
    const was = has(verseId, contactId);
    const before = done;
    setDone(was ? done.filter((d) => !(d.verse_id === verseId && d.contact_id === contactId)) : [...done, { verse_id: verseId, contact_id: contactId }]);
    try {
      await setVerseDone(verseId, contactId, !was);
    } catch (e) {
      setDone(before);
      Alert.alert('No se pudo guardar', errorMessage(e));
    }
  };

  const add = async () => {
    setBusy(true);
    try {
      await addVerse(forAll && leader ? null : id, reference.trim(), body.trim() || null, list.length);
      setReference(''); setBody(''); setForAll(false); setAdding(false);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const hide = (v: MemoryVerse) => Alert.alert('Sacar de la lista', `¿Sacar ${v.reference}? Ya no cuenta para los premios.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Sacar', style: 'destructive', onPress: () => hideVerse(v.id).then(load).catch((e) => Alert.alert('No se pudo', errorMessage(e))) },
  ]);

  if (verses === null) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Versículos de memoria" subtitle={name || 'Clase'} back />
      <Screen>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>Premios: {BADGES.map((b) => `${b.emoji} ${b.name} a los ${b.at}`).join(' · ')}.</Text>

        <SectionTitle right={canMark && !adding ? <Text onPress={() => setAdding(true)} style={{ color: colors.green, fontWeight: '800', fontSize: 13 }}>+ Agregar</Text> : undefined}>Versículos</SectionTitle>
        {adding ? (
          <Card style={{ gap: 10 }}>
            <Field label="Cita" value={reference} onChangeText={setReference} placeholder="Juan 3:16" maxLength={80} />
            <Field label="Texto del versículo" hint="(opcional)" value={body} onChangeText={setBody} multiline maxLength={1000} placeholder="Porque de tal manera amó Dios al mundo…" />
            {leader ? <Toggle label="Para todas las clases" hint="Aparece en la lista de cada clase de la iglesia" value={forAll} onChange={setForAll} /> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Cancelar" variant="ghost" small onPress={() => setAdding(false)} style={{ flex: 1 }} />
              <Button title="Guardar" small onPress={add} loading={busy} disabled={reference.trim().length < 2} style={{ flex: 2 }} />
            </View>
          </Card>
        ) : null}
        {!list.length && !adding ? <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>Todavía no hay versículos. {canMark ? 'Tocá “+ Agregar” para armar la lista.' : ''}</Text> : null}
        {list.map((v) => {
          const n = students.filter((s) => has(v.id, s.id)).length;
          const isOpen = open === v.id;
          const canHide = leader || (isTeacher && !!v.class_id);
          return (
            <Card key={v.id} style={{ gap: 10, padding: 12 }}>
              <Pressable onPress={() => setOpen(isOpen ? null : v.id)} accessibilityRole="button" accessibilityLabel={`${v.reference}. ${n} de ${students.length} lo saben`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{v.reference}</Text>
                  {v.body ? <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }} numberOfLines={isOpen ? undefined : 2}>{v.body}</Text> : null}
                  <Text style={{ fontSize: 12, color: colors.muted }}>{students.length ? `${n} de ${students.length} lo saben` : ''}{!v.class_id ? `${students.length ? ' · ' : ''}Para todas las clases` : ''}</Text>
                </View>
                <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </Pressable>
              {isOpen ? (
                <>
                  {canMark && students.length ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>Tocá a cada chico que ya lo sabe:</Text> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {students.map((s) => {
                      const on = has(v.id, s.id);
                      return (
                        <Pressable key={s.id} onPress={() => toggle(v.id, s.id)} disabled={!canMark} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={s.name}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1.5, borderColor: on ? colors.green : colors.input, backgroundColor: on ? colors.greenSoft : colors.bg }}>
                          <Feather name={on ? 'check-circle' : 'circle'} size={17} color={on ? colors.green : colors.muted} />
                          <Text style={{ fontSize: 14, fontWeight: on ? '800' : '600', color: on ? colors.greenText : colors.text }}>{s.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {!students.length ? <Text style={{ fontSize: 13, color: colors.muted }}>{canMark ? 'Esta clase todavía no tiene alumnos.' : 'Los maestros de la clase marcan quién lo aprendió.'}</Text> : null}
                  {canHide ? <Text onPress={() => hide(v)} style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>Sacar este versículo de la lista</Text> : null}
                </>
              ) : null}
            </Card>
          );
        })}

        {students.length && list.length ? (
          <>
            <SectionTitle>Los chicos y sus premios</SectionTitle>
            <Card style={{ padding: 0 }}>
              {ranked.map((s) => {
                const c = counts.get(s.id) ?? 0;
                return (
                  <Pressable key={s.id} onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: s.id } })} accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Face name={s.name} path={s.photo_path} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{s.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>{versesLabel(c)} · {progressText(c)}</Text>
                    </View>
                    <BadgeRow count={c} />
                  </Pressable>
                );
              })}
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
