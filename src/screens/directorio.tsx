// Directorio de la iglesia: solo aparecen los que eligieron aparecer (con su foto y teléfono).
import { telDigits } from '@/lib/phone';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Card, Empty, Loading, Toggle } from '@/components/ui';
import { directoryList, setDirectoryVisible } from '@/lib/api';
import { whatsappNumber } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { DirectoryRow } from '@/types';

export default function Directorio() {
  const { profile, refreshProfile } = useAuth();
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const [q, setQ] = useState('');
  const [visible, setVisible] = useState(!!profile?.directory_visible);

  const load = useCallback(() => {
    directoryList().then(setRows).catch(() => setRows([]));
  }, []);
  useFocusEffect(load);

  const shown = useMemo(() => {
    const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return (rows ?? []).filter((r) => n(r.display_name).includes(n(q.trim())));
  }, [rows, q]);

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
      <Header title="Directorio" subtitle="Hermanos que quieren estar en contacto" back />
      <Screen>
        <Card style={{ paddingVertical: 4 }}>
          <Toggle label="Aparecer en el directorio" hint="Tu nombre, foto y teléfono los ven los hermanos de la iglesia" value={visible} onChange={toggle} />
        </Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, backgroundColor: colors.bgSoft, paddingHorizontal: 12 }}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar" placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 16, color: colors.text }} />
        </View>
        {rows === null ? <Loading /> : !shown.length ? <Empty icon="users" title="Todavía no hay nadie" text="Cuando los hermanos elijan aparecer, los ves acá." /> : null}
        {shown.map((r) => (
          <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
            <Face name={r.display_name} path={r.photo_path} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{r.display_name}</Text>
              {r.title ? <Text style={{ fontSize: 12, color: colors.greenText, fontWeight: '700' }}>{r.title}</Text> : null}
            </View>
            {r.phone ? (
              <>
                <Pressable onPress={() => Linking.openURL(`tel:${telDigits(r.phone)}`)} style={{ padding: 8 }} accessibilityLabel={`Llamar a ${r.display_name}`}>
                  <Feather name="phone" size={20} color={colors.green} />
                </Pressable>
                <Pressable onPress={() => Linking.openURL(`https://wa.me/${whatsappNumber(r.phone as string)}`)} style={{ padding: 8 }} accessibilityLabel={`WhatsApp a ${r.display_name}`}>
                  <Feather name="message-circle" size={20} color={colors.green} />
                </Pressable>
              </>
            ) : null}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
