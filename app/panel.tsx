// Panel del pastor: totales por salida / semana / mes, hermanos, código de la iglesia.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, RowLink, SectionTitle, Segmented, Stat } from '@/components/ui';
import { churchReport } from '@/lib/api';
import { supabase, errorMessage } from '@/lib/supabase';
import { fmtDay, fmtDistance, fmtMinutes, fmtRelativeDay, fmtTime } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors, themed } from '@/theme';
import type { ChurchReport } from '@/types';

type Period = 'last' | 'week' | 'month';

function range(period: Period, lastStart?: string, lastEnd?: string | null): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (period === 'week') {
    const from = new Date(now);
    const day = (now.getDay() + 6) % 7; // lunes = 0
    from.setDate(now.getDate() - day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 7);
    return { from, to, label: `Semana del ${fmtDay(from)}` };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from, to, label: from.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) };
  }
  if (lastStart) {
    const from = new Date(lastStart);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 1);
    return { from, to, label: `Última salida · ${fmtRelativeDay(lastStart)}` };
  }
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 1);
  return { from, to, label: 'Hoy' };
}

export default function Panel() {
  const router = useRouter();
  const { profile, church, refreshProfile } = useAuth();
  const [period, setPeriod] = useState<Period>('week');
  const [report, setReport] = useState<ChurchReport | null | undefined>(undefined);
  const [label, setLabel] = useState('');
  const [lastSession, setLastSession] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      let ls = lastSession;
      if (period === 'last' && !ls) {
        const { data } = await supabase.from('sessions').select('started_at').order('started_at', { ascending: false }).limit(1).maybeSingle();
        ls = (data as { started_at: string } | null)?.started_at;
        setLastSession(ls);
      }
      const r = range(period, ls);
      setLabel(r.label);
      setReport(await churchReport(r.from, r.to));
    } catch {
      setReport(null);
    }
  }, [period, lastSession]);

  useEffect(() => {
    load();
  }, [load]);

  const rotate = () => {
    Alert.alert('Nuevo código', 'El código actual deja de funcionar. Los que ya están adentro no se ven afectados.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Generar',
        onPress: async () => {
          const { error } = await supabase.rpc('rotate_join_code');
          if (error) Alert.alert('No se pudo', errorMessage(error));
          else refreshProfile();
        },
      },
    ]);
  };

  const shareCode = () => {
    if (!church) return;
    Share.share({ message: `Para usar la app La Mies de ${church.name}: descargala, tocá "Crear cuenta" y poné el código ${church.join_code}` });
  };

  if (!profile || (profile.role !== 'admin' && profile.role !== 'captain')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Panel" back />
        <Empty icon="lock" title="Solo para administradores y capitanes" />
      </View>
    );
  }

  const t = report?.totals;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Panel del pastor" subtitle={church?.name ?? ''} back />
      <Screen>
        <Segmented options={[{ value: 'last', label: 'Última salida' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }]} value={period} onChange={setPeriod} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{label}</Text>
        {report === undefined ? (
          <Loading />
        ) : !report || !t ? (
          <Empty icon="bar-chart-2" title="Sin datos para este período" />
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Stat value={t.presentations} label="Presentaciones" tone="green" />
                <Stat value={t.promises} label="Promesas" tone="amber" />
                <Stat value={t.came} label="Vinieron" tone="blue" />
                <Stat value={t.discipleship} label="Discipulado" />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Stat value={t.baptisms} label="Bautismos" />
                <Stat value={t.sessions} label="Salidas" />
                <Stat value={t.members} label="Hermanos" />
                <Stat value={fmtMinutes(t.minutes)} label="En la calle" />
              </View>
              <Text style={{ fontSize: 12, color: colors.muted }}>{fmtDistance(Number(t.km) * 1000)} caminados · {t.blocks} cuadras · {t.contacts} casas marcadas</Text>
            </View>

            {t.pending_pickups > 0 ? (
              <Pressable onPress={() => router.push('/(tabs)/personas')} accessibilityRole="button" style={styles.pending}>
                <Text style={{ fontSize: 26, fontWeight: '800', color: colors.amberText }}>{t.pending_pickups}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.amberText }}>Prometieron venir y todavía no vinieron</Text>
                  <Text style={{ fontSize: 12, color: colors.amberText }}>Asignar a un capitán antes del sábado</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.amberText} />
              </Pressable>
            ) : null}

            <SectionTitle>Hermanos en este período</SectionTitle>
            <Card style={{ padding: 0 }}>
              <View style={[styles.tr, { borderBottomColor: colors.border }]}>
                <Text style={[styles.th, { flex: 1.6 }]}>Nombre</Text>
                <Text style={styles.th}>Salidas</Text>
                <Text style={styles.th}>Present.</Text>
                <Text style={styles.th}>Promesas</Text>
                <Text style={[styles.th, { textAlign: 'right' }]}>Última</Text>
              </View>
              {report.members.map((m, i) => (
                <Pressable key={m.user_id} onPress={() => profile.role === 'admin' && router.push({ pathname: '/admin/miembro', params: { id: m.user_id } })} accessibilityRole="button" style={[styles.tr, i === report.members.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={[styles.td, { flex: 1.6, fontWeight: '700' }]} numberOfLines={1}>{m.display_name}</Text>
                  <Text style={styles.td}>{m.sessions}</Text>
                  <Text style={styles.td}>{m.presentations}</Text>
                  <Text style={styles.td}>{m.promises}</Text>
                  <Text style={[styles.td, { textAlign: 'right', color: m.last_session && fmtRelativeDay(m.last_session) === 'hoy' ? colors.greenText : colors.muted }]}>{m.last_session ? fmtRelativeDay(m.last_session) : '—'}</Text>
                </Pressable>
              ))}
            </Card>

            <SectionTitle>Salidas</SectionTitle>
            <Card style={{ padding: 0 }}>
              {report.sessions.length ? (
                report.sessions.slice(0, 20).map((s, i) => (
                  <View key={s.id} style={[styles.tr, { paddingVertical: 10 }, i === Math.min(20, report.sessions.length) - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{s.display_name} · {fmtDay(s.started_at)} {fmtTime(s.started_at)}{s.ended_at ? ` a ${fmtTime(s.ended_at)}` : ' (en curso)'}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {fmtDistance(s.distance_m)} · {s.blocks} cuadras · {s.presentations} present. · {s.promises} promesas{s.auto_stopped ? ' · cortada sola' : ''}{s.trimmed_at ? ' · recortada' : ''}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{ padding: 14, color: colors.muted, fontSize: 13 }}>No hubo salidas en este período.</Text>
              )}
            </Card>
          </>
        )}

        {profile.role === 'admin' && church ? (
          <>
            <SectionTitle>Código de la iglesia</SectionTitle>
            <Card style={{ gap: 10 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>Con este código los hermanos crean su cuenta y entran a tu iglesia. Si se filtra, generá uno nuevo.</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: 2, textAlign: 'center', color: colors.green }}>{church.join_code}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Compartir" variant="outline" small icon="share-2" onPress={shareCode} style={{ flex: 1 }} />
                <Button title="Nuevo código" variant="ghost" small icon="refresh-cw" onPress={rotate} style={{ flex: 1 }} />
              </View>
            </Card>
            <Card style={{ padding: 0 }}>
              <RowLink title="Hermanos y roles" subtitle="Nombrar capitanes y administradores, armar grupos" icon="users" onPress={() => router.push('/admin/miembros')} />
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.amberSoft },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { flex: 1, fontSize: 10, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  td: { flex: 1, fontSize: 13, color: colors.text, textAlign: 'center' },
}));
