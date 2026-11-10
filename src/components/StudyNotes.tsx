// Mis notas: cada uno escribe sus apuntes en cada estudio. Son privados y se guardan solos.
import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from './ui';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

export type NoteKind = 'article' | 'training' | 'material';

export function StudyNotes({ kind, refId, title }: { kind: NoteKind; refId: string; title: string }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const loaded = useRef(false);
  const last = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loaded.current = false;
    supabase.from('study_notes').select('body').eq('kind', kind).eq('ref', refId).maybeSingle().then(({ data }) => {
      const b = (data as { body: string } | null)?.body ?? '';
      setText(b); last.current = b; loaded.current = true;
    });
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [kind, refId]);

  const save = async (value: string) => {
    if (!loaded.current || value === last.current) return;
    setState('saving');
    const { error } = await supabase.rpc('save_study_note', { p_kind: kind, p_ref: refId, p_title: title, p_body: value });
    if (error) { setState('error'); return; }
    last.current = value;
    setState('saved');
  };

  const change = (v: string) => {
    setText(v);
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(v), 1200); // se guarda solo cuando dejás de escribir
  };

  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="edit-3" size={18} color={colors.green} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>Mis notas</Text>
        <Text style={{ fontSize: 12, color: state === 'error' ? colors.red : colors.muted }}>
          {state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Guardado ✓' : state === 'error' ? 'No se pudo guardar' : 'Solo las ves vos'}
        </Text>
      </View>
      <TextInput
        value={text} onChangeText={change} onBlur={() => { if (timer.current) clearTimeout(timer.current); save(text); }}
        multiline placeholder="Escribí lo que aprendiste, preguntas, a quién se lo vas a contar…" placeholderTextColor={colors.muted}
        maxLength={8000} accessibilityLabel="Mis notas de este estudio"
        style={{ minHeight: 110, borderWidth: 1.5, borderColor: colors.input, borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 22, color: colors.text, textAlignVertical: 'top' }}
      />
    </Card>
  );
}
