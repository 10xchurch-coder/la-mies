// Editar los enlaces de la música o de la radio (los que se muestran a toda la iglesia). Lo hace quien manda anuncios.
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Choice, Empty, Field, Loading, RowLink, SectionTitle } from '@/components/ui';
import { churchLinks, deleteChurchLink, saveChurchLink } from '@/lib/api';
import { KIND_LABEL, MUSIC_KINDS, RADIO_KINDS, cleanUrl, kindFromUrl, sortLinks, type LinkKind } from '@/lib/links';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchLink } from '@/types';
import { tx } from '@/lib/i18n';

export default function Enlaces({ group }: { group: 'music' | 'radio' }) {
  const { can } = useAuth();
  const kinds = group === 'music' ? MUSIC_KINDS : RADIO_KINDS;
  const [rows, setRows] = useState<ChurchLink[] | null>(null);
  const [form, setForm] = useState<null | { id?: string; kind: LinkKind; title: string; url: string; note: string }>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    churchLinks().then((all) => setRows(sortLinks(all.filter((l) => (kinds as string[]).includes(l.kind))))).catch(() => setRows((o) => o ?? []));
  }, [kinds]);
  useFocusEffect(load);

  if (!can('com.anuncios')) return <Empty icon="lock" title={tx('Solo quien manda anuncios')} text={tx('Pedile al pastor o a la secretaría que lo cargue.')} />;

  const startNew = () => setForm({ kind: kinds[0], title: '', url: '', note: '' });
  const onUrl = (t: string) => {
    const guess = group === 'music' ? kindFromUrl(cleanUrl(t) ?? '') : null;
    setForm((f) => (f ? { ...f, url: t, ...(guess ? { kind: guess } : {}) } : f));
  };
  const save = async () => {
    if (!form) return;
    const url = cleanUrl(form.url);
    if (form.title.trim().length < 2) { Alert.alert(tx('Falta el nombre'), tx('Ponele un nombre, por ejemplo "Alabanzas del domingo".')); return; }
    if (!url && form.kind !== 'radio_fm') { Alert.alert(tx('El enlace no sirve'), tx('Pegá el enlace completo de la lista o de la radio.')); return; }
    if (form.url.trim() && !url) { Alert.alert(tx('El enlace no sirve'), tx('Tiene que empezar con http o https.')); return; }
    setBusy(true);
    try {
      await saveChurchLink({ id: form.id, kind: form.kind, title: form.title, url, note: form.note });
      setForm(null); load();
    } catch (e) { Alert.alert(tx('No se pudo guardar'), errorMessage(e)); } finally { setBusy(false); }
  };
  const remove = (l: ChurchLink) => Alert.alert(tx('¿Sacar este enlace?'), l.title, [
    { text: tx('Cancelar'), style: 'cancel' },
    { text: tx('Sacar'), style: 'destructive', onPress: () => deleteChurchLink(l.id).then(load).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e))) },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={group === 'music' ? tx('Enlaces de la música') : tx('Enlaces de la radio')} subtitle={tx('Lo que ve toda la iglesia')} back />
      <Screen>
        {!form ? <Button title={tx('Agregar un enlace')} icon="plus" onPress={startNew} /> : (
          <Card style={{ gap: 10 }}>
            <Field label={tx('Nombre')} value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} placeholder={group === 'music' ? tx('Alabanzas del domingo') : tx('Radio Victoria')} />
            <Field label={form.kind === 'radio_fm' ? tx('Enlace (opcional)') : tx('Enlace')} value={form.url} onChangeText={onUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              placeholder={group === 'music' ? tx('Pegá el enlace de Spotify o YouTube Music') : tx('Pegá el enlace de la radio por internet')} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{tx('Qué es')}</Text>
            <Choice options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={form.kind} onChange={(k) => setForm({ ...form, kind: k })} />
            <Field label={tx('Una nota')} hint={tx('(opcional)')} value={form.note} onChangeText={(t) => setForm({ ...form, note: t })}
              placeholder={form.kind === 'radio_fm' ? tx('Ejemplo: 98.5 FM, todos los días') : tx('Ejemplo: lo que cantamos en el culto')} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={tx('Cancelar')} variant="ghost" onPress={() => setForm(null)} style={{ flex: 1 }} />
              <Button title={tx('Guardar')} onPress={save} loading={busy} style={{ flex: 2 }} />
            </View>
          </Card>
        )}
        <SectionTitle>{tx('Cargados')}</SectionTitle>
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="link" title={tx('Todavía no hay enlaces')} text={tx('Agregá el primero con el botón de arriba.')} /> : (
          <Card style={{ padding: 0 }}>
            {rows.map((l, i) => (
              <View key={l.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <RowLink title={l.title} subtitle={`${KIND_LABEL[l.kind]}${l.note ? ` · ${l.note}` : ''}`}
                  onPress={() => setForm({ id: l.id, kind: l.kind, title: l.title, url: l.url ?? '', note: l.note ?? '' })} />
                <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}><Button title={tx('Sacar')} variant="ghost" small onPress={() => remove(l)} /></View>
              </View>
            ))}
          </Card>
        )}
      </Screen>
    </View>
  );
}
