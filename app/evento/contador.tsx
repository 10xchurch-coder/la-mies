// Contador en vivo de la puerta: para dejar en una pantalla grande (tele, proyector o tablet).
// Muestra cuántos hay adentro ahora, cuántos entraron en total y cuántos por cada entrada. Se pone al día solo cada pocos segundos.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Card, Empty, Loading } from '@/components/ui';
import { doorLive, planEvent, type DoorLive, type PlanEvent } from '@/lib/eventPlan';
import { entranceLabel, fillPercent } from '@/lib/tags';
import { fmtTime, isoDate } from '@/lib/format';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

const EVERY_MS = 4000;

export default function Contador() {
  const { id, fecha } = useLocalSearchParams<{ id: string; fecha?: string }>();
  const { width } = useWindowDimensions();
  const [ev, setEv] = useState<PlanEvent | null | undefined>(undefined);
  const [live, setLive] = useState<DoorLive | null | undefined>(undefined);   // null = sin permiso
  const [late, setLate] = useState(false);                                    // no se pudo actualizar (sin señal)
  const busy = useRef(false);
  const on = fecha ?? (ev ? isoDate(new Date(ev.starts_at)) : '');

  useEffect(() => { planEvent(id).then(setEv).catch(() => setEv(null)); }, [id]);
  const tick = useCallback(() => {
    if (!on || busy.current) return;
    busy.current = true;
    doorLive(id, on).then((l) => { setLive(l); setLate(false); }).catch(() => setLate(true)).finally(() => { busy.current = false; });
  }, [id, on]);
  // Solo pregunta mientras la pantalla está abierta.
  useFocusEffect(useCallback(() => {
    tick();
    const t = setInterval(tick, EVERY_MS);
    return () => clearInterval(t);
  }, [tick]));

  if (ev === undefined || (live === undefined && !late)) return <Loading />;
  if (!ev) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title={tx('Contador en vivo')} back /><Empty icon="calendar" title={tx('Este evento ya no está')} /></View>;
  if (live === null) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Header title={tx('Contador en vivo')} back /><Empty icon="lock" title={tx('Sin permiso para ver la puerta')} text={tx('Lo ven los que atienden la puerta y los organizadores del evento.')} /></View>;

  const big = width >= 700;
  const pct = live ? fillPercent(live.inside, live.capacity) : null;
  const max = Math.max(1, ...(live?.by_entrance ?? []).map((e) => e.checked_in));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tx('Contador en vivo')} subtitle={ev.title} back />
      <Screen>
        <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: 4, paddingVertical: big ? 36 : 22, borderRadius: 24, backgroundColor: colors.greenSoft }}>
          <Text style={{ fontSize: big ? 22 : 16, fontWeight: '800', color: colors.greenText }}>{tx('ADENTRO AHORA')}</Text>
          <Text style={{ fontSize: big ? 190 : 110, lineHeight: big ? 200 : 118, fontWeight: '900', color: colors.greenText }} adjustsFontSizeToFit numberOfLines={1}>{live?.inside ?? '–'}</Text>
          {pct !== null && live ? (
            <View style={{ alignSelf: 'stretch', paddingHorizontal: 24, gap: 6 }}>
              <View style={{ height: 14, borderRadius: 7, backgroundColor: colors.bg, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: 14, backgroundColor: pct >= 95 ? colors.red : pct >= 80 ? colors.amber : colors.green }} />
              </View>
              <Text style={{ fontSize: big ? 18 : 14, fontWeight: '700', color: colors.greenText, textAlign: 'center' }}>{tx('{pct}% del lugar ({capacity} lugares)', { pct, capacity: live.capacity })}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {([[tx('Entraron en total'), live?.checked_in, colors.blueSoft, colors.blueText], [tx('Ya salieron'), live?.gone, colors.amberSoft, colors.amberText], [tx('Anotados'), live?.registered, colors.bgSoft, colors.text]] as const).map(([label, value, bg, fg]) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: big ? 20 : 12, borderRadius: 18, backgroundColor: bg, gap: 2 }}>
              <Text style={{ fontSize: big ? 56 : 30, fontWeight: '900', color: fg }} adjustsFontSizeToFit numberOfLines={1}>{value ?? '–'}</Text>
              <Text style={{ fontSize: big ? 17 : 12, fontWeight: '700', color: fg, textAlign: 'center' }}>{tx(label)}</Text>
            </View>
          ))}
        </View>

        {live && live.by_entrance.length ? (
          <Card style={{ gap: 12 }}>
            <Text style={{ fontSize: big ? 20 : 15, fontWeight: '800', color: colors.text }}>{tx('Por cada entrada')}</Text>
            {live.by_entrance.map((e) => (
              <View key={e.name || '-'} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: big ? 22 : 16, fontWeight: '700', color: colors.text }} numberOfLines={1}>{entranceLabel(e.name)}</Text>
                  <Text style={{ fontSize: big ? 26 : 18, fontWeight: '900', color: colors.text }}>{e.checked_in}</Text>
                  <Text style={{ fontSize: big ? 16 : 12, color: colors.muted }}>{tx('entraron · {inside} adentro', { inside: e.inside })}</Text>
                </View>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.bgSoft, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round((e.checked_in / max) * 100)}%`, height: 10, backgroundColor: colors.green }} />
                </View>
              </View>
            ))}
          </Card>
        ) : (
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>{tx('Todavía no entró nadie. Los números aparecen cuando en la puerta se lee la primera credencial.')}</Text>
        )}

        <Text style={{ fontSize: 13, color: late ? colors.amberText : colors.muted, textAlign: 'center', fontWeight: late ? '800' : '400' }}>
          {late ? tx('Sin señal: los números pueden estar atrasados. Se vuelve a intentar solo.') : live ? tx('Se pone al día solo · última vez {fmtTime} · se cuentan personas', { fmtTime: fmtTime(live.at) }) : ''}
        </Text>
      </Screen>
    </View>
  );
}
