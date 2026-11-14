// Panel del pastor: totales por salida / semana / mes, hermanos, código de la iglesia.
import { hasRole } from '@/lib/perms';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Loading, RowLink, SectionTitle, Segmented, Stat } from '@/components/ui';
import { churchReport, panelDetail } from '@/lib/api';
import { METRIC_LABEL, countContacts, countOutings, panelItems, rankMembers, type PanelDetail, type PanelItem, type PanelMetric } from '@/lib/outings';
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
  const [detail, setDetail] = useState<PanelDetail | null>(null);
  // Qué lista está abierta: la de un número de arriba (sin user) o la de un hermano.
  const [open, setOpen] = useState<{ metric: PanelMetric; user?: string } | null>(null);

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
      setOpen(null);
      setDetail(null);
      setReport(await churchReport(r.from, r.to));
      panelDetail(r.from, r.to).then(setDetail).catch(() => setDetail(null));
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

  const t = report?.totals;
  const names = useMemo(() => new Map((report?.members ?? []).map((m) => [m.user_id, m.display_name])), [report]);
  const contactsBy = useMemo(() => {
    const by = new Map<string, number>();
    if (detail) for (const i of panelItems('contacts', detail)) if (i.user_id) by.set(i.user_id, (by.get(i.user_id) ?? 0) + 1);
    return by;
  }, [detail]);
  const ranked = useMemo(() => rankMembers(report?.members ?? [], contactsBy), [report, contactsBy]);
  const toggle = (metric: PanelMetric, user?: string) => setOpen((o) => (o && o.metric === metric && o.user === user ? null : { metric, user }));
  const isOpen = (metric: PanelMetric) => !!open && !open.user && open.metric === metric;
  const list = (metric: PanelMetric, user?: string) => (
    <DetailList
      title={`${METRIC_LABEL[metric]}${user ? ` de ${names.get(user) ?? ''}` : ''}`}
      items={detail ? panelItems(metric, detail, user) : null}
      names={names}
      showWho={!user}
      onClose={() => setOpen(null)}
      onOpen={(id) => router.push({ pathname: '/contacto/[id]', params: { id } })}
    />
  );

  if (!profile || (!hasRole(profile, 'admin') && !hasRole(profile, 'captain'))) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Panel" back />
        <Empty icon="lock" title="Solo para administradores y capitanes" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Panel del pastor" subtitle={church?.name ?? ''} back />
      <Screen>
        <Card style={{ padding: 0 }}>
          <RowLink title="Evangelismo en vivo" subtitle="Quién está saliendo ahora, por dónde va y cómo viene el día" icon="radio" onPress={() => router.push('/equipo')} />
        </Card>
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
                <Stat value={detail ? panelItems('contacts', detail).length : countContacts(report.sessions)} label="Contactos" onPress={() => toggle('contacts')} active={isOpen('contacts')} />
                <Stat value={t.presentations} label="Presentaciones" tone="green" onPress={() => toggle('presentations')} active={isOpen('presentations')} />
                <Stat value={t.promises} label="Promesas" tone="amber" onPress={() => toggle('promises')} active={isOpen('promises')} />
                <Stat value={detail ? detail.came.length : t.came} label="Vinieron" tone="blue" onPress={() => toggle('came')} active={isOpen('came')} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Stat value={t.discipleship} label="Discipulado" onPress={() => toggle('discipleship')} active={isOpen('discipleship')} />
                <Stat value={t.baptisms} label="Bautismos" onPress={() => toggle('baptisms')} active={isOpen('baptisms')} />
                <Stat value={countOutings(report.sessions)} label="Salidas" />
                <Stat value={t.members} label="Hermanos" />
              </View>
              <Text style={{ fontSize: 12, color: colors.muted }}>{fmtMinutes(t.minutes)} en la calle · {fmtDistance(Number(t.km) * 1000)} caminados · {t.blocks} cuadras</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>Tocá un número para ver quiénes son y quién los cargó.</Text>
            </View>

            {open && !open.user ? list(open.metric) : null}

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
                <Text style={styles.th}>Contac.</Text>
                <Text style={styles.th}>Present.</Text>
                <Text style={styles.th}>Promesas</Text>
                <Text style={[styles.th, { textAlign: 'right' }]}>Última</Text>
              </View>
              {ranked.map((m, i) => {
                const num = (metric: PanelMetric, n: number) => {
                  const on = !!open && open.user === m.user_id && open.metric === metric;
                  return (
                    <Pressable accessibilityRole="button" accessibilityLabel={`${METRIC_LABEL[metric]} de ${m.display_name}: ${n}. Ver la lista`} disabled={!n} onPress={() => toggle(metric, m.user_id)} hitSlop={6} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={[styles.num, n > 0 && { color: colors.green, fontWeight: '800', textDecorationLine: 'underline' }, on && { backgroundColor: colors.greenSoft }]}>{n}</Text>
                    </Pressable>
                  );
                };
                return (
                  <View key={m.user_id} style={[{ borderBottomWidth: 1, borderBottomColor: colors.border }, i === ranked.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.tr, { borderBottomWidth: 0 }]}>
                      <Pressable style={{ flex: 1.6 }} accessibilityRole="button" onPress={() => profile.role === 'admin' && router.push({ pathname: '/admin/miembro', params: { id: m.user_id } })}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>{m.display_name}</Text>
                      </Pressable>
                      <Text style={styles.td}>{m.sessions}</Text>
                      {num('contacts', m.contacts)}
                      {num('presentations', m.presentations)}
                      {num('promises', m.promises)}
                      <Text style={[styles.td, { textAlign: 'right', color: m.last_session && fmtRelativeDay(m.last_session) === 'hoy' ? colors.greenText : colors.muted }]}>{m.last_session ? fmtRelativeDay(m.last_session) : '—'}</Text>
                    </View>
                    {open && open.user === m.user_id ? <View style={{ paddingHorizontal: 8, paddingBottom: 10 }}>{list(open.metric, m.user_id)}</View> : null}
                  </View>
                );
              })}
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

/** La lista detrás de un número: cada persona, quién la cargó y cuándo. Se toca para abrir su ficha. */
function DetailList({ title, items, names, showWho, onClose, onOpen }: { title: string; items: PanelItem[] | null; names: Map<string, string>; showWho: boolean; onClose: () => void; onOpen: (id: string) => void }) {
  return (
    <View style={styles.detail}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.text }}>{title}{items ? ` · ${items.length}` : ''}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar la lista" onPress={onClose} hitSlop={10}><Feather name="x" size={18} color={colors.muted} /></Pressable>
      </View>
      {items === null ? (
        <Text style={{ padding: 12, fontSize: 13, color: colors.muted }}>Cargando…</Text>
      ) : items.length === 0 ? (
        <Text style={{ padding: 12, fontSize: 13, color: colors.muted }}>No hay nadie para mostrar en este período.</Text>
      ) : (
        items.map((it) => (
          <Pressable key={it.key} accessibilityRole="link" onPress={() => onOpen(it.contact_id)} style={styles.detailRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>{it.name}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
                {showWho ? `${it.user_id && names.get(it.user_id) ? `Lo cargó ${names.get(it.user_id)}` : 'No se sabe quién lo cargó'} · ` : ''}{fmtDay(it.when.length === 10 ? `${it.when}T12:00:00` : it.when)}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.gray} />
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.amberSoft },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { flex: 1, fontSize: 10, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  td: { flex: 1, fontSize: 13, color: colors.text, textAlign: 'center' },
  detail: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, overflow: 'hidden' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  num: { fontSize: 13, color: colors.text, textAlign: 'center', minWidth: 28, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 },
}));
