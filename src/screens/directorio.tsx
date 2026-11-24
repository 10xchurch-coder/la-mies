// Directorio de la iglesia: solo aparecen los que eligieron aparecer (con su foto y teléfono).
import { telDigits } from '@/lib/phone';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Card, Empty, Loading, Segmented, Toggle } from '@/components/ui';
import { directoryFamilies, directoryList, setDirectoryVisible } from '@/lib/api';
import { groupByFamily } from '@/lib/families';
import { whatsappNumber } from '@/lib/format';
import { pathOn } from '@/lib/features';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { DirectoryRow } from '@/types';
import { tx } from '@/lib/i18n';

export default function Directorio() {
  const { profile, church, refreshProfile } = useAuth();
  const router = useRouter();
  const dmOn = pathOn(church?.disabled_features, '/mensajes');
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const [q, setQ] = useState('');
  const [visible, setVisible] = useState(!!profile?.directory_visible);
  // De qué familia es cada uno (solo un vínculo, para verlos juntos).
  const [families, setFamilies] = useState<Map<string, { id: string; name: string }>>(new Map());
  const [view, setView] = useState<'abc' | 'familia'>('abc');

  const load = useCallback(() => {
    directoryList().then(setRows).catch(() => setRows([]));
    directoryFamilies().then(setFamilies).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const shown = useMemo(() => {
    const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return (rows ?? []).filter((r) => n(`${r.display_name} ${families.get(r.id)?.name ?? ''}`).includes(n(q.trim())));
  }, [rows, q, families]);
  const groups = useMemo(
    () => (view === 'familia' ? groupByFamily(shown, (r) => families.get(r.id)) : [{ key: 'todos', title: '', rows: shown }]),
    [view, shown, families],
  );

  const toggle = async (v: boolean) => {
    setVisible(v);
    try {
      await setDirectoryVisible(v);
      await refreshProfile();
      load();
    } catch {
      setVisible(!v);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Directorio')} subtitle={tx('Hermanos que quieren estar en contacto')} back />
      <Screen>
        <Card style={{ paddingVertical: 4 }}>
          <Toggle label={tx('Aparecer en el directorio')} hint={tx('Tu nombre, foto y teléfono los ven los hermanos de la iglesia')} value={visible} onChange={toggle} />
        </Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, backgroundColor: colors.bgSoft, paddingHorizontal: 12 }}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={tx('Buscar')} placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 16, color: colors.text }} />
        </View>
        {families.size ? (
          <Segmented options={[{ value: 'abc', label: tx('Por nombre') }, { value: 'familia', label: tx('Por familia') }]} value={view} onChange={setView} />
        ) : null}
        {rows === null ? <Loading /> : !shown.length ? <Empty icon="users" title={tx('Todavía no hay nadie')} text={tx('Cuando los hermanos elijan aparecer, los ves acá.')} /> : null}
        {groups.map((g) => (
          <React.Fragment key={g.key}>
            {g.title ? <Text style={{ fontSize: 13, fontWeight: '800', color: colors.violetText, marginTop: 6 }}>{g.title}</Text> : null}
            {g.rows.map((r) => (
              <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
                <Face name={r.display_name} path={r.photo_path} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.display_name}</Text>
                  {r.title ? <Text style={{ fontSize: 12, color: colors.greenText, fontWeight: '700' }}>{r.title}</Text> : null}
                  {view === 'abc' && families.get(r.id) ? <Text style={{ fontSize: 12, color: colors.muted }}>{families.get(r.id)?.name}</Text> : null}
                </View>
                {r.id !== profile?.id && dmOn ? (
                  <Pressable onPress={() => router.push({ pathname: '/mensajes/[id]', params: { id: r.id, name: r.display_name } } as unknown as Href)} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={tx('Mandarle un mensaje a {display_name}', { display_name: r.display_name })}>
                    <Feather name="send" size={20} color={colors.violet} />
                  </Pressable>
                ) : null}
                {r.phone ? (
                  <>
                    <Pressable onPress={() => Linking.openURL(`tel:${telDigits(r.phone)}`)} style={{ padding: 8 }} accessibilityLabel={tx('Llamar a {display_name}', { display_name: r.display_name })}>
                      <Feather name="phone" size={20} color={colors.green} />
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL(`https://wa.me/${whatsappNumber(r.phone as string)}`)} style={{ padding: 8 }} accessibilityLabel={tx('WhatsApp a {display_name}', { display_name: r.display_name })}>
                      <Feather name="message-circle" size={20} color={colors.green} />
                    </Pressable>
                  </>
                ) : null}
              </Card>
            ))}
          </React.Fragment>
        ))}
      </Screen>
    </View>
  );
}
