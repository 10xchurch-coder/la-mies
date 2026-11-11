// Alabanza: los cultos armados (orden y equipo) y las canciones de la iglesia.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, Segmented, Tag } from '@/components/ui';
import { createPlan, listPlans, listSongs, songUsage, worshipAccess, type Song, type SongUsage, type WorshipPlan } from '@/lib/worship';
import { listServices } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { fmtDateOnly, isoDate, upcomingDates } from '@/lib/format';
import { colors } from '@/theme';

export default function Alabanza() {
  const router = useRouter();
  const [tab, setTab] = useState<'plans' | 'songs'>('plans');
  const [access, setAccess] = useState<{ see: boolean; plan: boolean } | null>(null);
  const [plans, setPlans] = useState<WorshipPlan[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [usage, setUsage] = useState<Record<string, SongUsage>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    worshipAccess().then((a) => {
      setAccess(a);
      if (!a.see) return;
      Promise.all([listPlans(), listSongs(), songUsage()]).then(([p, s, u]) => { setPlans(p); setSongs(s); setUsage(u); }).catch(() => undefined);
    }).catch(() => setAccess({ see: false, plan: false }));
  }, []));

  const today = isoDate(new Date());
  const upcoming = plans.filter((p) => p.on_date >= today).reverse();
  const past = plans.filter((p) => p.on_date < today);
  const shownSongs = useMemo(() => {
    const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const t = n(q.trim());
    return songs.filter((s) => !s.archived && (!t || n(`${s.title} ${s.author ?? ''} ${s.themes ?? ''}`).includes(t)));
  }, [songs, q]);

  const newPlan = async () => {
    setBusy(true);
    try {
      const services = await listServices();
      const dows = [...new Set(services.map((s) => s.dow))];
      const taken = new Set(plans.map((p) => p.on_date));
      const date = upcomingDates(dows.length ? dows : [0], 12).find((d) => !taken.has(d)) ?? today;
      const svc = services.find((s) => s.dow === new Date(`${date}T12:00:00`).getDay());
      const id = await createPlan(date, svc?.id ?? null, null);
      router.push({ pathname: '/alabanza/plan', params: { id } } as unknown as Href);
    } catch (e) {
      Alert.alert('No se pudo', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!access) return <Loading />;
  if (!access.see) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Alabanza" back />
        <Screen><Empty icon="music" title="Esto es para el ministerio de música" text="Cuando te sumen al ministerio de música, vas a ver acá las canciones y el orden de cada culto." /></Screen>
      </View>
    );
  }

  const planRow = (p: WorshipPlan) => (
    <Pressable key={p.id} onPress={() => router.push({ pathname: '/alabanza/plan', params: { id: p.id } } as unknown as Href)} accessibilityRole="button">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Feather name="calendar" size={20} color={colors.green} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, textTransform: 'capitalize' }}>{fmtDateOnly(p.on_date)}</Text>
          {p.title ? <Text style={{ fontSize: 13, color: colors.muted }}>{p.title}</Text> : null}
        </View>
        {!p.published ? <Tag text="Borrador" tone="amber" /> : null}
        <Feather name="chevron-right" size={20} color={colors.muted} />
      </Card>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Alabanza" subtitle="El orden de cada culto, el equipo y las canciones" back />
      <Screen style={{ gap: 12 }}>
        <Segmented options={[{ value: 'plans', label: 'Cultos' }, { value: 'songs', label: `Canciones (${songs.filter((s) => !s.archived).length})` }]} value={tab} onChange={setTab} />
        {tab === 'plans' ? (
          <>
            {access.plan ? <Button title="Armar un culto" icon="plus" onPress={newPlan} loading={busy} /> : null}
            {!plans.length ? <Empty icon="calendar" title="Todavía no hay cultos armados" text={access.plan ? 'Tocá "Armar un culto" para cargar el orden y el equipo.' : 'Cuando el líder publique el orden de un culto, aparece acá.'} /> : null}
            {upcoming.length ? <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>LO QUE VIENE</Text> : null}
            {upcoming.map(planRow)}
            {past.length ? <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted, marginTop: 6 }}>ANTERIORES</Text> : null}
            {past.slice(0, 20).map(planRow)}
          </>
        ) : (
          <>
            {access.plan ? <Button title="Agregar una canción" icon="plus" onPress={() => router.push('/alabanza/cancion' as Href)} /> : null}
            <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Título, autor o tema" />
            {!shownSongs.length ? <Empty icon="music" title={songs.length ? 'No encontré esa canción' : 'Todavía no hay canciones'} text={songs.length ? undefined : 'Cargá las canciones que canta la iglesia, con su tono.'} /> : null}
            {shownSongs.map((s) => {
              const u = usage[s.id];
              return (
                <Pressable key={s.id} onPress={() => router.push({ pathname: '/alabanza/cancion', params: { id: s.id } } as unknown as Href)} accessibilityRole="button">
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Feather name="music" size={18} color={colors.green} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{s.title}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {[s.author, u ? `${u.times} ${u.times === 1 ? 'vez' : 'veces'} este año${u.last_used ? ` · última: ${fmtDateOnly(u.last_used)}` : ''}` : 'Sin usar este año'].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {s.song_key ? <Tag text={s.song_key} tone="blue" /> : null}
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}
      </Screen>
    </View>
  );
}
