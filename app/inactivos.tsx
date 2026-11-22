// Inactivos: los que dejaron de venir. No son miembros, ni visitas, ni contactos: quedan acá para no perderlos
// y para volver a buscarlos (visita, WhatsApp, correo). Si vuelven y se les toma asistencia, vuelven solos a su lista.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Button, Empty, Loading, Tag } from '@/components/ui';
import { inactiveList, setContactInactive } from '@/lib/api';
import { monthsLabel, sinceLabel } from '@/lib/inactive';
import { STATUS_LABEL } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { InactiveRow } from '@/types';

const PAGE = 50;

export default function Inactivos() {
  const { can, church } = useAuth();
  const allowed = can('personas.editar') || can('personas.ver_todas');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<InactiveRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const qRef = useRef('');

  const load = useCallback(async (text: string, from = 0) => {
    qRef.current = text;
    try {
      const got = await inactiveList(text, PAGE, from);
      if (qRef.current !== text) return;   // ya cambió la búsqueda
      setRows((old) => (from === 0 ? got : [...(old ?? []), ...got]));
      setMore(got.length === PAGE);
    } catch { setRows((o) => o ?? []); }
  }, []);
  useFocusEffect(useCallback(() => { if (allowed) load(qRef.current); }, [allowed, load]));
  useEffect(() => { const t = setTimeout(() => { if (allowed) load(q); }, 300); return () => clearTimeout(t); }, [q, allowed, load]);

  if (!allowed) return <Empty icon="lock" title="Solo el pastor y la secretaría" />;
  const total = rows?.[0]?.total ?? 0;

  const restore = (r: InactiveRow) => Alert.alert('¿Volver a su lista?', `${r.name} vuelve a ${STATUS_LABEL[r.prev_status ?? 'member'].toLowerCase()}s.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Volver', onPress: async () => {
      setBusy(true);
      try { await setContactInactive(r.id, false); setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? null); } catch (e) { Alert.alert('No se pudo', errorMessage(e)); } finally { setBusy(false); }
    } },
  ]);
  const whatsapp = (r: InactiveRow) => {
    const d = (r.phone ?? '').replace(/\D/g, '');
    const first = r.name.split(' ')[0];
    Linking.openURL(`https://wa.me/${d.startsWith('54') ? d : `549${d}`}?text=${encodeURIComponent(`Hola ${first}, ¿cómo estás? Te escribo de ${church?.name ?? 'la iglesia'}. Te extrañamos, nos encantaría verte de nuevo.`)}`).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Inactivos" subtitle={rows ? `${total} ${total === 1 ? 'persona' : 'personas'}${church?.inactive_months ? ` · pasan solos a los ${monthsLabel(church.inactive_months)} sin venir` : ''}` : undefined} back
        right={can('admin.permisos') ? (
          <Pressable onPress={() => router.push('/admin/inactivos' as Href)} accessibilityRole="button" accessibilityLabel="Ajustes de inactivos" hitSlop={8}>
            <Feather name="settings" size={22} color={colors.text} />
          </Pressable>
        ) : undefined} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSoft }}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar por nombre o teléfono" placeholderTextColor="#8B918C" style={{ flex: 1, fontSize: 15, color: colors.text }} autoCorrect={false} />
        </View>
      </View>
      {rows === null ? <Loading /> : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
          ListEmptyComponent={<Empty icon="user-x" title={q ? 'No encontré a nadie' : 'No hay nadie en inactivos'} text={q ? undefined : 'Acá van a aparecer los que dejen de venir, y los que pases a mano desde su ficha.'} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (more && rows.length) load(q, rows.length); }}
          renderItem={({ item: r }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg }}>
              <Pressable onPress={() => router.push({ pathname: '/contacto/[id]', params: { id: r.id } })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <Face name={r.name} path={r.photo_path} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{sinceLabel(r.last_seen)}{r.phone ? ` · ${formatPhone(r.phone)}` : ''}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Tag text={`Era ${STATUS_LABEL[r.prev_status ?? 'member'].toLowerCase()}`} tone="gray" />
                    {!r.inactive_auto ? <Tag text="Pasado a mano" tone="blue" /> : null}
                  </View>
                </View>
              </Pressable>
              <View style={{ gap: 6 }}>
                {r.phone ? <Button title="WhatsApp" small variant="outline" onPress={() => whatsapp(r)} /> : null}
                <Button title="Volvió" small variant="ghost" onPress={() => restore(r)} disabled={busy} />
              </View>
            </View>
          )}
          ListFooterComponent={more ? <Loading /> : undefined}
        />
      )}
    </View>
  );
}
