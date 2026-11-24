// Informe semanal (llega como aviso los lunes a las 8 a las personas elegidas) y el camino de los contactos mes a mes.
import React, { useEffect, useState, useRef } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Loading, SectionTitle, Stat } from '@/components/ui';
import { pipelineReport, weeklyReport } from '@/lib/api';
import { addDays, fmtDateShort, fmtMinutes, isoDate, parseDate } from '@/lib/format';
import { shareText } from '@/lib/share';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import { downloadView } from '@/lib/download';
import type { PipelineRow, WeeklyReport } from '@/types';
import { tx, txLocale } from '@/lib/i18n';

/** Lunes que cierra el informe (el informe cubre los 7 días anteriores). El domingo ya muestra la semana que termina hoy. */
function mondayOf(d: Date): string {
  if (d.getDay() === 0) return isoDate(addDays(d, 1));
  const back = (d.getDay() + 6) % 7;
  return isoDate(addDays(d, -back));
}

export default function Reporte() {
  const shot = useRef<React.ComponentRef<typeof View>>(null);   // lo que se descarga como imagen (o se imprime en la web)
  const { church } = useAuth();
  const router = useRouter();
  const [monday, setMonday] = useState(mondayOf(new Date()));
  const [r, setR] = useState<WeeklyReport | null>(null);
  const [pipe, setPipe] = useState<PipelineRow[]>([]);

  useEffect(() => {
    setR(null);
    weeklyReport(monday).then(setR).catch((e) => Alert.alert(tx('No se pudo'), e instanceof Error ? e.message : ''));
  }, [monday]);
  useEffect(() => {
    pipelineReport(6).then(setPipe).catch(() => undefined);
  }, []);

  const text = r
    ? tx('Informe semanal · {name}\nDel {fmtDateShort} al {fmtDateShort2}\n\n', { name: church?.name ?? '', fmtDateShort: fmtDateShort(r.from), fmtDateShort2: fmtDateShort(r.to) })
      + tx('EVANGELISMO\n{outings} salidas · {people_out} hermanos · {fmtMinutes} · {km} km\n{houses} casas · {contacts} contactos · {gospel} con el evangelio presentado · {promises} promesas\n\n', { outings: r.outings, people_out: r.people_out, fmtMinutes: fmtMinutes(r.minutes), km: r.km, houses: r.houses, contacts: r.contacts, gospel: r.gospel, promises: r.promises })
      + tx('IGLESIA\n{attendance} asistencias · {first_time} vinieron por primera vez · {visits} visitas a casas\n{baptisms} bautismos · {new_members} miembros nuevos\n{v1}', { attendance: r.attendance, first_time: r.first_time, visits: r.visits, baptisms: r.baptisms, new_members: r.new_members, v1: r.weekend_cancelled ? tx('El fin de semana no hubo reunión: no se cuentan ausencias') : tx('{absent} miembros faltaron el último fin de semana', { absent: r.absent }) })
      + (r.services?.length ? `\n\nPOR REUNIÓN\n${r.services.map((x) => `${x.name}: ${x.cancelled && !x.count ? tx('no hubo') : x.count}`).join('\n')}` : '')
      + (r.cancelled?.length ? `\n\nNO HUBO\n${r.cancelled.map((x) => `${x.name} (${fmtDateShort(x.date)})${x.note ? ` · ${x.note}` : ''}`).join('\n')}` : '')
      + (r.classes?.length ? tx('\n\nPOR CLASE\n{map}\nTotal en clases: {reduce}', { map: r.classes.map((x) => `${x.name}: ${x.days ? x.present : '–'}`).join('\n'), reduce: r.classes.reduce((a, x) => a + x.present, 0) }) : '')
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Informe semanal')} subtitle={r ? tx('Del {fmtDateShort} al {fmtDateShort2}', { fmtDateShort: fmtDateShort(r.from), fmtDateShort2: fmtDateShort(r.to) }) : undefined} back />
      <Screen>
        <View ref={shot} collapsable={false} style={{ gap: 16, backgroundColor: colors.bg, paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={tx('Semana anterior')} variant="outline" small icon="chevron-left" onPress={() => setMonday(isoDate(addDays(parseDate(monday), -7)))} style={{ flex: 1 }} />
          <Button title={tx('Siguiente')} variant="outline" small onPress={() => setMonday(isoDate(addDays(parseDate(monday), 7)))} disabled={monday >= mondayOf(new Date())} style={{ flex: 1 }} />
        </View>
        {!r ? <Loading /> : (
          <>
            <SectionTitle>{tx('Evangelismo')}</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={r.outings} label={tx('Salidas')} />
              <Stat value={r.people_out} label={tx('Hermanos')} onPress={() => router.push('/salieron' as never)} />
              <Stat value={`${r.km} km`} label={tx('Caminados')} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={r.houses} label={tx('Casas')} tone="blue" />
              <Stat value={r.contacts} label={tx('Contactos')} />
              <Stat value={r.gospel} label={tx('Evangelio presentado')} tone="green" />
              <Stat value={r.promises} label={tx('Promesas')} tone="amber" />
            </View>
            <SectionTitle>{tx('Iglesia')}</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={r.attendance} label={tx('Asistencias')} />
              <Stat value={r.first_time} label={tx('Primera vez')} tone="green" />
              <Stat value={r.visits} label={tx('Visitas a casas')} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={r.baptisms} label={tx('Bautismos')} />
              <Stat value={r.new_members} label={tx('Miembros nuevos')} />
            </View>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {r.weekend_cancelled ? tx('El fin de semana no hubo reunión, así que no se cuentan ausencias.') : tx('{absent} miembros faltaron el último fin de semana.', { absent: r.absent })}
            </Text>
            {r.cancelled?.length ? (
              <Card style={{ gap: 4, backgroundColor: colors.amberSoft, borderColor: colors.amber }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.amberText, textTransform: 'uppercase', letterSpacing: 0.4 }}>{tx('No hubo esta semana')}</Text>
                {r.cancelled.map((x, i) => (
                  <Text key={i} style={{ fontSize: 14, color: colors.text }}>
                    {x.name} · {fmtDateShort(x.date)}{x.note ? <Text style={{ color: colors.muted }}> · {x.note}</Text> : null}
                  </Text>
                ))}
                <Text style={{ fontSize: 12, color: colors.muted }}>{tx('No cuentan para la fidelidad ni para las ausencias.')}</Text>
              </Card>
            ) : null}
            {r.services?.length ? (
              <>
                <SectionTitle>{tx('Por reunión')}</SectionTitle>
                <Card style={{ padding: 0 }}>
                  {r.services.map((x, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: i < (r.services?.length ?? 0) - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.text }}>{x.name}</Text>
                      <Text style={{ fontSize: 13, color: colors.muted, marginRight: 12 }}>{x.visitors ? tx('{visitors} visitas', { visitors: x.visitors }) : ''}</Text>
                      {x.cancelled && !x.count
                        ? <Text style={{ fontSize: 14, fontWeight: '800', color: colors.amberText }}>{tx('No hubo')}</Text>
                        : <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{x.count}</Text>}
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
            {r.classes?.length ? (
              <>
                <SectionTitle>{tx('Por clase')}</SectionTitle>
                <Card style={{ padding: 0 }}>
                  {r.classes.map((x, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: i < (r.classes?.length ?? 0) - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{x.name}</Text>
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {x.days ? tx('{days} {pl} · {absent} faltaron', { days: x.days, pl: x.days === 1 ? tx('día') : tx('días'), absent: x.absent }) : tx('Sin asistencia tomada')}{x.enrolled ? tx(' · {enrolled} anotados', { enrolled: x.enrolled }) : ''}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: x.days ? colors.text : colors.muted }}>{x.days ? x.present : '–'}</Text>
                    </View>
                  ))}
                </Card>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {tx('Total en clases: {reduce} presentes.', { reduce: r.classes.reduce((a, x) => a + x.present, 0) })}
                </Text>
              </>
            ) : null}
            <Button title={tx('Compartir / mandar por email')} icon="share-2" onPress={() => shareText(text, tx('Informe semanal'))} />
          </>
        )}
        {pipe.length ? (
          <>
            <SectionTitle>{tx('El camino de los contactos (por mes)')}</SectionTitle>
            <Card style={{ padding: 0 }}>
              <View style={{ flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                {[tx('Mes'), tx('Contac.'), tx('Ev. pres.'), tx('Visit.'), tx('Vino'), tx('Baut.'), tx('Miemb.')].map((h, i) => (
                  <Text key={h} style={{ flex: i === 0 ? 1.4 : 1, fontSize: 10, fontWeight: '800', color: colors.muted, textAlign: i === 0 ? 'left' : 'center' }}>{h}</Text>
                ))}
              </View>
              {pipe.map((p) => (
                <View key={p.month} style={{ flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ flex: 1.4, fontSize: 12, fontWeight: '700', color: colors.text }}>{new Date(`${p.month}T12:00:00`).toLocaleDateString(txLocale(), { month: 'short', year: '2-digit' })}</Text>
                  {[p.contacts, p.gospel, p.visited, p.came, p.baptized, p.members].map((v, i) => (
                    <Text key={i} style={{ flex: 1, fontSize: 13, fontWeight: '700', color: v ? colors.text : colors.muted, textAlign: 'center' }}>{v}</Text>
                  ))}
                </View>
              ))}
            </Card>
          </>
        ) : null}
        </View>
        <Button title={tx('Descargar')} icon="download" variant="outline" onPress={() => downloadView(shot.current, r ? `Informe semanal ${r.from}` : 'Informe semanal').catch((e) => Alert.alert(tx('No se pudo descargar'), String((e as Error)?.message ?? e)))} />
      </Screen>
    </View>
  );
}
