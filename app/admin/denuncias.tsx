// Denuncias: publicaciones que alguien marcó. El pastor o la secretaría las borran o las dejan.
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, Segmented, Tag } from '@/components/ui';
import { fmtRelativeDay } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type Row = { id: string; kind: string; target_id: string; excerpt: string | null; reason: string | null; status: 'open' | 'removed' | 'kept'; created_at: string; author: { display_name: string } | null };
const KIND: Record<string, string> = { comment: 'Comentario del devocional', prayer: 'Pedido de oración', ministry_message: 'Mensaje de ministerio', announcement: 'Anuncio', profile: 'Perfil' };

export default function Denuncias() {
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback(() => {
    setRows(null);
    let q = supabase.from('content_reports').select('id, kind, target_id, excerpt, reason, status, created_at, author:author_id(display_name)').order('created_at', { ascending: false }).limit(100);
    q = tab === 'open' ? q.eq('status', 'open') : q.neq('status', 'open');
    q.then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, [tab]);
  useFocusEffect(load);

  const resolve = (r: Row, remove: boolean) => {
    const go = () => supabase.rpc('resolve_report', { p_report: r.id, p_remove: remove }).then(({ error }) => (error ? Alert.alert('No se pudo', errorMessage(error)) : load()));
    if (remove) Alert.alert('Borrar la publicación', 'Se borra para todos. No se puede deshacer.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }]);
    else go();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Denuncias" subtitle="Publicaciones marcadas por los hermanos" back />
      <Screen>
        <Segmented options={[{ value: 'open', label: 'Para revisar' }, { value: 'done', label: 'Resueltas' }]} value={tab} onChange={setTab} />
        {rows === null ? <Loading /> : !rows.length ? <Empty icon="check-circle" title={tab === 'open' ? 'No hay nada para revisar' : 'Sin denuncias resueltas'} /> : null}
        {(rows ?? []).map((r) => (
          <Card key={r.id} style={{ gap: 8, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: colors.muted }}>{KIND[r.kind] ?? r.kind} · {fmtRelativeDay(r.created_at)}</Text>
              {r.status !== 'open' ? <Tag text={r.status === 'removed' ? 'Borrada' : 'Se dejó'} tone={r.status === 'removed' ? 'red' : 'gray'} /> : null}
            </View>
            <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>"{r.excerpt}"</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{r.author ? `Publicó: ${r.author.display_name} · ` : ''}Motivo: {r.reason ?? '—'}</Text>
            {r.status === 'open' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Dejarla" variant="outline" small onPress={() => resolve(r, false)} style={{ flex: 1 }} />
                <Button title="Borrarla" variant="danger" small onPress={() => resolve(r, true)} style={{ flex: 1 }} />
              </View>
            ) : null}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
