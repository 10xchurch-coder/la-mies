// Cargar el versículo y el devocional de cada día (pastor o secretaría).
// Si un día no tiene nada cargado, la app muestra un versículo general.
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { BACKGROUNDS, BACKGROUND_NAMES, VerseCard } from '@/components/VerseCard';
import { Button, Card, Choice, Field, Loading, SectionTitle } from '@/components/ui';
import { deleteDailyContent, listDailyContent, saveDailyContent } from '@/lib/api';
import { pickAndUploadPhoto } from '@/lib/files';
import { addDays, fmtDateShort, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { DailyContent } from '@/types';

const EMPTY = (d: string): Partial<DailyContent> => ({ on_date: d, reference: '', verse: '', message: '', devotional: '', study: '', prayer: '', background: 'auto' });

export default function Devocionales() {
  const router = useRouter();
  const { church } = useAuth();
  const [rows, setRows] = useState<DailyContent[] | null>(null);
  const [editing, setEditing] = useState<Partial<DailyContent> | null>(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();
  const from = isoDate(addDays(today, -3));
  const to = isoDate(addDays(today, 30));

  const load = useCallback(() => {
    listDailyContent(from, to).then((r) => setRows(r.filter((x) => x.church_id))).catch(() => setRows([]));
  }, [from, to]);
  useFocusEffect(load);

  const save = async () => {
    if (!editing?.reference?.trim() || !editing.verse?.trim()) {
      Alert.alert('Faltan datos', 'Poné la cita (ej. Juan 3:16) y el texto completo del versículo.');
      return;
    }
    setBusy(true);
    try {
      await saveDailyContent({
        id: editing.id,
        on_date: editing.on_date as string,
        reference: editing.reference.trim(),
        verse: editing.verse.trim(),
        message: editing.message?.trim() || null,
        devotional: editing.devotional?.trim() || null,
        study: editing.study?.trim() || null,
        prayer: editing.prayer?.trim() || null,
        background: editing.background || 'auto',
      });
      setEditing(null);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : 'Probá de nuevo');
    } finally {
      setBusy(false);
    }
  };

  const remove = (row: DailyContent) =>
    Alert.alert('Borrar', `¿Borrar lo cargado para el ${fmtDateShort(row.on_date)}? Ese día se mostrará un versículo general.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => deleteDailyContent(row.id).then(load).catch((e) => Alert.alert('No se pudo', e instanceof Error ? e.message : '')) },
    ]);

  const choosePhoto = async () => {
    if (!church || !editing) return;
    try {
      const p = await pickAndUploadPhoto(church.id);
      if (p) setEditing({ ...editing, background: p });
    } catch (e) {
      Alert.alert('No se pudo subir la foto', e instanceof Error ? e.message : '');
    }
  };

  if (!rows) return <Loading />;

  if (editing) {
    const preview: DailyContent = {
      id: editing.id ?? 'x', church_id: church?.id ?? null, on_date: editing.on_date as string, reference: editing.reference || 'Juan 3:16',
      verse: editing.verse || 'El texto del versículo va a aparecer acá.', message: editing.message || null, devotional: editing.devotional || null, study: editing.study || null, prayer: editing.prayer || null,
      background: editing.background || 'auto', created_by: null, created_at: '',
    };
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={editing.id ? 'Editar devocional' : 'Nuevo devocional'} subtitle={fmtDateShort(editing.on_date as string)} back />
        <Screen>
          <VerseCard item={preview} church={church?.name} compact />
          <Field label="Cita" hint="(ej. Juan 3:16)" value={editing.reference ?? ''} onChangeText={(t) => setEditing({ ...editing, reference: t })} autoCapitalize="words" />
          <Field label="Versículo completo (RV1960)" value={editing.verse ?? ''} onChangeText={(t) => setEditing({ ...editing, verse: t })} multiline style={{ minHeight: 110 }} />
          <Field label="Frase corta para la tarjeta" hint="(opcional)" value={editing.message ?? ''} onChangeText={(t) => setEditing({ ...editing, message: t })} />
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Fondo de la tarjeta</Text>
            <Choice
              options={[{ value: 'auto', label: 'Foto del día' }, ...BACKGROUND_NAMES.map((n) => ({ value: n, label: BACKGROUNDS[n].label })), { value: '__photo', label: 'Mi foto…' }]}
              value={!editing.background || editing.background === 'auto' ? 'auto' : BACKGROUNDS[editing.background] ? editing.background : '__photo'}
              onChange={(v) => (v === '__photo' ? choosePhoto() : setEditing({ ...editing, background: v }))}
            />
          </View>
          <Field label="Devocional (lectura del día)" hint="(1 o 2 párrafos; separalos con una línea en blanco)" value={editing.devotional ?? ''} onChangeText={(t) => setEditing({ ...editing, devotional: t })} multiline style={{ minHeight: 160 }} />
          <Field label="Estudio completo" hint="(opcional, 5–10 min; pasajes en texto completo; un título va entre ** **, ej. **Para hoy**)" value={editing.study ?? ''} onChangeText={(t) => setEditing({ ...editing, study: t })} multiline style={{ minHeight: 160 }} />
          <Field label="Oración breve" hint="(opcional; cierra el estudio a pantalla completa)" value={editing.prayer ?? ''} onChangeText={(t) => setEditing({ ...editing, prayer: t })} multiline style={{ minHeight: 80 }} />
          <Button title="Guardar" onPress={save} loading={busy} />
          <Button title="Cancelar" variant="ghost" onPress={() => setEditing(null)} />
        </Screen>
      </View>
    );
  }

  const days = Array.from({ length: 34 }, (_, i) => isoDate(addDays(today, i - 3)));
  const byDate = new Map(rows.map((r) => [r.on_date, r]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Devocionales" subtitle="Un versículo y una lectura por día" back />
      <Screen>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Feather name="info" size={20} color={colors.green} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 }}>
            Los días sin nada cargado muestran un versículo general. Lo que cargás acá lo ve solo tu iglesia. Podés escribir el devocional de a varios días por adelantado.
          </Text>
        </Card>
        <SectionTitle>Próximos días</SectionTitle>
        <Card style={{ padding: 0 }}>
          {days.map((d, i) => {
            const r = byDate.get(d);
            const isToday = d === isoDate(today);
            return (
              <Pressable key={d} onPress={() => setEditing(r ? { ...r } : EMPTY(d))} onLongPress={() => r && remove(r)} style={[styles.row, i ? { borderTopWidth: 1, borderTopColor: colors.border } : null, isToday && { backgroundColor: colors.greenSoft }]}>
                <Text style={{ width: 72, fontSize: 13, fontWeight: '800', color: isToday ? colors.greenText : colors.text }}>{isToday ? 'Hoy' : fmtDateShort(d)}</Text>
                <View style={{ flex: 1 }}>
                  {r ? (
                    <>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{r.reference}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{r.devotional ? 'Con devocional' : 'Solo versículo'}{r.message ? ` · ${r.message}` : ''}</Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 13, color: colors.muted }}>Versículo general · tocá para cargar</Text>
                  )}
                </View>
                {r ? (
                  <Pressable onPress={() => remove(r)} accessibilityLabel="Borrar" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="trash-2" size={18} color={colors.red} />
                  </Pressable>
                ) : (
                  <Feather name="plus-circle" size={20} color={colors.green} />
                )}
              </Pressable>
            );
          })}
        </Card>
        <Button title="Ver el devocional de hoy" variant="outline" icon="book-open" onPress={() => router.push('/devocional')} />
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 56 },
}));
