// Mi progreso: nivel, racha, números de siempre, insignias.
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Card, Loading, SectionTitle, Stat } from '@/components/ui';
import { myProgress } from '@/lib/api';
import { LEVELS, badgesFor, levelFor, type Progress } from '@/lib/levels';
import { colors, themed } from '@/theme';

export default function Progreso() {
  const [p, setP] = useState<Progress | null>(null);

  useEffect(() => {
    myProgress().then((x) => setP(x as Progress)).catch(() => setP({ sessions: 0, minutes: 0, km: 0, presentations: 0, promises: 0, came: 0, discipleship: 0, baptisms: 0, streak_weeks: 0, last_session: null }));
  }, []);

  if (!p) return <Loading />;
  const { current, next } = levelFor(p.sessions);
  const base = current?.sessions ?? 0;
  const pct = next ? Math.min(100, Math.round(((p.sessions - base) / (next.sessions - base)) * 100)) : 100;
  const badges = badgesFor(p);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mi progreso" back />
      <Screen>
        <View style={styles.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={styles.heroIcon}>
              <Feather name="feather" size={32} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.85 }}>{current ? `Nivel ${current.n}` : 'Todavía sin nivel'}</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 }}>{current?.name ?? 'Tu primera salida te espera'}</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', opacity: 0.9 }}>
                {p.streak_weeks > 0 ? `${p.streak_weeks} ${p.streak_weeks === 1 ? 'semana seguida' : 'semanas seguidas'} saliendo` : 'Salí esta semana para empezar tu racha'}
              </Text>
            </View>
          </View>
          {next ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Rumbo a {next.name}</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{p.sessions} de {next.sessions} salidas</Text>
              </View>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', borderRadius: 5, backgroundColor: '#FFFFFF' }} />
              </View>
            </View>
          ) : null}
        </View>

        <SectionTitle>Mis números desde que empecé</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={p.sessions} label="Salidas" />
          <Stat value={p.presentations} label="Presentac." />
          <Stat value={p.promises} label="Promesas" />
          <Stat value={p.came} label="Vinieron" tone="green" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={p.discipleship} label="Discipulado" />
          <Stat value={p.baptisms} label="Bautismos" />
          <Stat value={`${p.km}`} label="km" />
          <Stat value={Math.round(p.minutes / 60)} label="Horas" />
        </View>

        <SectionTitle>Insignias</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {badges.map((b) => (
            <View key={b.id} style={[styles.badge, !b.earned && styles.badgeLocked]}>
              <View style={[styles.badgeIcon, { backgroundColor: b.earned ? colors.greenSoft : colors.bgSoft }]}>
                <Feather name={b.earned ? (b.icon as React.ComponentProps<typeof Feather>['name']) : 'lock'} size={22} color={b.earned ? colors.greenText : colors.muted} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', textAlign: 'center', color: b.earned ? colors.text : colors.muted }}>
                {b.title}{b.progress ? ` · ${b.progress}` : ''}
              </Text>
            </View>
          ))}
        </View>

        <SectionTitle>Niveles</SectionTitle>
        <Card style={{ padding: 0 }}>
          {LEVELS.map((l, i) => {
            const done = p.sessions >= l.sessions;
            const here = current?.n === l.n;
            return (
              <View key={l.n} style={[styles.level, i === LEVELS.length - 1 && { borderBottomWidth: 0 }, here && { backgroundColor: '#F3F8F4' }]}>
                {done ? <Feather name="check" size={20} color={colors.green} /> : <View style={styles.circle} />}
                <Text style={{ flex: 1, fontSize: 14, fontWeight: here ? '800' : '700', color: done ? colors.text : colors.muted }}>{l.n} · {l.name}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: here ? colors.greenText : colors.muted }}>{here ? `${l.verse} · acá estás` : l.verse}</Text>
              </View>
            );
          })}
        </Card>

        <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 13, fontStyle: 'italic', color: colors.muted, textAlign: 'center', lineHeight: 19 }}>No nos cansemos, pues, de hacer el bien; porque a su tiempo segaremos, si no desmayamos</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.green }}>Gálatas 6:9</Text>
        </View>
      </Screen>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  hero: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.green },
  heroIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  badge: { width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, padding: 12, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  badgeLocked: { borderStyle: 'dashed', borderColor: colors.input },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  level: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  circle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.input },
}));
