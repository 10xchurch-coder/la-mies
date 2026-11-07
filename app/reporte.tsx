// Informe semanal (llega como aviso los lunes a las 8 a las personas elegidas) y el camino de los contactos mes a mes.
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Loading, SectionTitle, Stat } from '@/components/ui';
import { pipelineReport, weeklyReport } from '@/lib/api';
import { addDays, fmtDateShort, fmtMinutes, isoDate, parseDate } from '@/lib/format';
import { shareText } from '@/lib/share';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { PipelineRow, WeeklyReport } from '@/types';

function mondayOf(d: Date): string {
  const back = (d.getDay() + 6) % 7;
  return isoDate(addDays(d, -back));
}

export default function Reporte() {
  const { church } = useAuth();
  const [monday, setMonday] = useState(mondayOf(new Date()));
  const [r, setR] = useState<WeeklyReport | null>(null);
  const [pipe, setPipe] = useState<PipelineRow[]>([]);

  useEffect(() => {
    setR(null);
    weeklyReport(monday).then(setR).catch((e) => Alert.alert('No se pudo', e instanceof Error ? e.message : ''));
  }, [monday]);
  useEffect(() => {
    pipelineReport(6).then(setPipe).catch(() => undefined);
  }, []);

  const text = r
    ? `Informe semanal · ${church?.name ?? ''}\nDel ${fmtDateShort(r.from)} al ${fmtDateShort(r.to)}\n\n`
      + `EVANGELISMO\n${r.outings} salidas · ${r.people_out} hermanos · ${fmtMinutes(r.minutes)} · ${r.km} km\n${r.houses} casas · ${r.contacts} contactos · ${r.gospel} con el evangelio · ${r.promises} promesas\n\n`
      + `IGLESIA\n${r.attendance} asistencias · ${r.first_time} vinieron por primera vez · ${r.visits} visitas a casas\n${r.saved} recibieron a Cristo · ${r.baptisms} bautismos · ${r.new_members} miembros nuevos\n${r.absent} miembros faltaron el último fin de semana`
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Informe semanal" subtitle={r ? `Del ${fmtDateShort(r.from)} al ${fmtDateShort(r.to)}` : undefined} back />
      <Screen>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Semana anterior" variant="outline" small icon="chevron-left" onPress={() => setMonday(isoDate(addDays(parseDate(monday), -7)))} style={{ flex: 1 }} />
          <Button title="Siguiente" variant="outline" small onPress={() => setMonday(isoDate(addDays(parseDate(monday), 7)))} disabled={monday >= mondayOf(new Date())} style={{ flex: 1 }} />
        </View>
        {!r ? <Loading /> : (
          <>
            <SectionTitle>Evangelismo</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={r.outings} label="Salidas" />
              <Stat value={r.people_out} label="Hermanos" />
              <Stat value={`${r.km} km`} label="Caminados" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={r.houses} label="Casas" tone="blue" />
              <Stat value={r.contacts} label="Contactos" />
              <Stat value={r.gospel} label="Evangelio" tone="green" />
              <Stat value={r.promises} label="Promesas" tone="amber" />
            </View>
            <SectionTitle>Iglesia</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={r.attendance} label="Asistencias" />
              <Stat value={r.first_time} label="Primera vez" tone="green" />
              <Stat value={r.visits} label="Visitas a casas" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={r.saved} label="Recibieron a Cristo" tone="green" />
              <Stat value={r.baptisms} label="Bautismos" />
              <Stat value={r.new_members} label="Miembros nuevos" />
            </View>
            <Text style={{ fontSize: 13, color: colors.muted }}>{r.absent} miembros faltaron el último fin de semana.</Text>
            <Button title="Compartir / mandar por email" icon="share-2" onPress={() => shareText(text, 'Informe semanal')} />
          </>
        )}
        {pipe.length ? (
          <>
            <SectionTitle>El camino de los contactos (por mes)</SectionTitle>
            <Card style={{ padding: 0 }}>
              <View style={{ flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                {['Mes', 'Contac.', 'Evang.', 'Visit.', 'Vino', 'Salvo', 'Baut.', 'Miemb.'].map((h, i) => (
                  <Text key={h} style={{ flex: i === 0 ? 1.4 : 1, fontSize: 10, fontWeight: '800', color: colors.muted, textAlign: i === 0 ? 'left' : 'center' }}>{h}</Text>
                ))}
              </View>
              {pipe.map((p) => (
                <View key={p.month} style={{ flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ flex: 1.4, fontSize: 12, fontWeight: '700', color: colors.text }}>{new Date(`${p.month}T12:00:00`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })}</Text>
                  {[p.contacts, p.gospel, p.visited, p.came, p.saved, p.baptized, p.members].map((v, i) => (
                    <Text key={i} style={{ flex: 1, fontSize: 13, fontWeight: '700', color: v ? colors.text : colors.muted, textAlign: 'center' }}>{v}</Text>
                  ))}
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
