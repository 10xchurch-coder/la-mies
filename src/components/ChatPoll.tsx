// Encuestas del chat de la iglesia: la tarjeta para votar y la ventana para crear una.
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Toggle } from './ui';
import { createPoll, type PollOption } from '../lib/chat';
import { errorMessage } from '../lib/supabase';
import { colors, themed } from '../theme';

const CLOSES: { label: string; days: number | null }[] = [
  { label: 'Sin límite', days: null }, { label: '1 día', days: 1 }, { label: '3 días', days: 3 }, { label: '1 semana', days: 7 },
];

export function PollCard({ question, rows, mine, onVote, onLong }: { question: string; rows: PollOption[] | undefined; mine: boolean; onVote: (optionId: string) => void; onLong: () => void }) {
  if (!rows?.length) return <Text style={[styles.question, mine && { color: '#FFF' }]}>📊 {question}</Text>;
  const total = rows.reduce((n, r) => n + r.votes, 0);
  const voters = rows[0].voters;
  const closes = rows[0].closes_at ? new Date(rows[0].closes_at) : null;
  const closed = !!closes && closes.getTime() <= Date.now();
  const fg = mine ? '#FFF' : colors.text;
  const sub = mine ? 'rgba(255,255,255,0.85)' : colors.muted;
  return (
    <Pressable onLongPress={onLong} delayLongPress={350} style={{ gap: 8, minWidth: 230 }}>
      <Text style={[styles.question, { color: fg }]}>📊 {question}</Text>
      {rows.map((r) => {
        const pct = total ? Math.round((r.votes / total) * 100) : 0;
        return (
          <Pressable key={r.option_id} onPress={() => (closed ? Alert.alert('La encuesta ya cerró') : onVote(r.option_id))} accessibilityRole="button"
            accessibilityLabel={`${r.label}, ${r.votes} votos${r.mine ? ', elegida por vos' : ''}`}
            style={[styles.opt, mine ? { borderColor: 'rgba(255,255,255,0.5)' } : { borderColor: colors.border, backgroundColor: colors.bg }, r.mine && { borderColor: mine ? '#FFF' : colors.green, borderWidth: 2 }]}>
            <View style={[styles.bar, { width: `${pct}%`, backgroundColor: mine ? 'rgba(255,255,255,0.25)' : colors.greenSoft }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name={r.mine ? (r.multiple ? 'check-square' : 'check-circle') : (r.multiple ? 'square' : 'circle')} size={18} color={r.mine ? (mine ? '#FFF' : colors.green) : sub} />
              <Text style={{ flex: 1, fontSize: 15, color: fg, fontWeight: r.mine ? '800' : '600' }}>{r.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: fg }}>{r.votes}</Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={{ fontSize: 11, color: sub }}>
        {voters === 1 ? '1 persona votó' : `${voters} personas votaron`} · {rows[0].multiple ? 'podés marcar varias' : 'elegí una (tocá otra para cambiar)'}
        {closes ? (closed ? ' · cerrada' : ` · cierra el ${closes.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`) : ''}
      </Text>
    </Pressable>
  );
}

export function PollComposer({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [closeIdx, setCloseIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const reset = () => { setQuestion(''); setOptions(['', '']); setMultiple(false); setCloseIdx(0); };
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= 2;

  const publish = async () => {
    setBusy(true);
    try {
      const days = CLOSES[closeIdx].days;
      await createPoll(question.trim(), filled, multiple, days ? new Date(Date.now() + days * 86400000) : null);
      reset();
      onDone();
    } catch (e) {
      Alert.alert('No se pudo publicar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          <Text style={{ flex: 1, fontSize: 19, fontWeight: '800', color: colors.text }}>Nueva encuesta</Text>
          <Pressable onPress={onClose} accessibilityLabel="Cerrar" style={{ padding: 6 }}><Feather name="x" size={22} color={colors.text} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>PREGUNTA</Text>
          <TextInput value={question} onChangeText={setQuestion} placeholder="Ej.: ¿Qué día hacemos el asado de la iglesia?" placeholderTextColor="#8B918C" multiline maxLength={300} style={[styles.input, { minHeight: 60 }]} />
          <Text style={styles.label}>OPCIONES (de 2 a 8)</Text>
          {options.map((o, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput value={o} onChangeText={(t) => setOptions((all) => all.map((x, j) => (j === i ? t : x)))} placeholder={`Opción ${i + 1}`} placeholderTextColor="#8B918C" maxLength={80} style={[styles.input, { flex: 1 }]} />
              {options.length > 2 ? <Pressable onPress={() => setOptions((all) => all.filter((_, j) => j !== i))} accessibilityLabel={`Quitar la opción ${i + 1}`} style={{ padding: 6 }}><Feather name="trash-2" size={20} color={colors.red} /></Pressable> : null}
            </View>
          ))}
          {options.length < 8 ? <Text onPress={() => setOptions((all) => [...all, ''])} style={{ fontSize: 15, fontWeight: '800', color: colors.green }}>+ Agregar otra opción</Text> : null}
          <Toggle label="Se pueden elegir varias" hint="Si no, cada uno elige una sola opción." value={multiple} onChange={setMultiple} />
          <Text style={styles.label}>CUÁNDO CIERRA</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CLOSES.map((c, i) => (
              <Pressable key={c.label} onPress={() => setCloseIdx(i)} accessibilityRole="button" accessibilityState={{ selected: closeIdx === i }}
                style={[styles.chip, closeIdx === i && { backgroundColor: colors.green, borderColor: colors.green }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: closeIdx === i ? '#FFF' : colors.text }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Todos los de la iglesia pueden votar. Se ven los totales, no quién votó qué.</Text>
          {busy ? <ActivityIndicator color={colors.green} /> : <Button title="Publicar en el chat" icon="send" onPress={publish} disabled={!ready} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  question: { fontSize: 16, fontWeight: '800', lineHeight: 22, color: colors.text },
  opt: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  head: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontSize: 12, fontWeight: '800', color: colors.muted, letterSpacing: 0.5, marginTop: 4 },
  input: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: colors.text, backgroundColor: colors.bg },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
}));
