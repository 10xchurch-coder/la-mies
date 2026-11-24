// Regalo de bienvenida y visita de cada visita nueva: dos botones que muestran si ya lo recibió, cuándo y quién lo anotó.
// Así nadie recibe dos regalos y nadie se queda sin el suyo.
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { showDay } from '@/lib/personas';
import { careList, careMark } from '@/lib/personasApi';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import { tx } from '@/lib/i18n';

export type Care = { gift_on: string | null; gift_by: string | null; visit_on: string | null; visit_by: string | null };

function Mark({ icon, done, label, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; done: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: done ? colors.greenSoft : colors.amberSoft }}>
      <Feather name={done ? 'check-circle' : icon} size={16} color={done ? colors.greenText : colors.amberText} />
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '700', color: done ? colors.greenText : colors.amberText }}>{label}</Text>
    </Pressable>
  );
}

/** Los dos botones. `care` es lo que ya se sabe de la persona (null: todavía nada). */
export function CareButtons({ id, care, onChanged }: { id: string; care: Care | null; onChanged?: () => void }) {
  const tap = (what: 'gift' | 'visit') => {
    const on = what === 'gift' ? care?.gift_on : care?.visit_on;
    const by = what === 'gift' ? care?.gift_by : care?.visit_by;
    const run = (undo: boolean) => careMark(id, what, undo).then(() => { forget(); onChanged?.(); }).catch((e) => Alert.alert(tx('No se pudo'), errorMessage(e)));
    if (on) {
      Alert.alert(what === 'gift' ? tx('Ya recibió el regalo') : tx('Ya lo visitaron'), tx('El {showDay}{v1}', { showDay: showDay(on), v1: by ? tx('. Lo anotó {by}.', { by }) : '.' }), [
        { text: tx('Está bien'), style: 'cancel' },
        { text: tx('Fue un error: sacarlo'), style: 'destructive', onPress: () => { run(true); } },
      ]);
    } else {
      Alert.alert(what === 'gift' ? tx('¿Recibió el regalo de bienvenida?') : tx('¿Recibió una visita?'), tx('Queda anotado con la fecha de hoy y tu nombre.'), [
        { text: tx('Cancelar'), style: 'cancel' },
        { text: tx('Sí, anotar'), onPress: () => { run(false); } },
      ]);
    }
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Mark icon="gift" done={!!care?.gift_on} label={care?.gift_on ? tx('Regalo: {showDay}{v1}', { showDay: showDay(care.gift_on), v1: care.gift_by ? ` · ${care.gift_by}` : '' }) : tx('Falta el regalo de bienvenida')} onPress={() => tap('gift')} />
      <Mark icon="home" done={!!care?.visit_on} label={care?.visit_on ? tx('Visita: {showDay}{v1}', { showDay: showDay(care.visit_on), v1: care.visit_by ? ` · ${care.visit_by}` : '' }) : tx('Falta la visita')} onPress={() => tap('visit')} />
    </View>
  );
}

// Para las listas de seguimiento: se pide una sola vez la lista de visitas y cada renglón busca la suya.
let cache: { at: number; rows: Promise<Map<string, Care>> } | null = null;
const forget = () => { cache = null; };
function allCare(): Promise<Map<string, Care>> {
  if (!cache || Date.now() - cache.at > 30000) {
    cache = { at: Date.now(), rows: careList().then((l) => new Map(l.map((r) => [r.id, r as Care]))).catch(() => new Map<string, Care>()) };
  }
  return cache.rows;
}

/** En un renglón de "Para seguir": los dos botones, solo si la persona es una visita. */
export function CareMarks({ id }: { id: string }) {
  const [care, setCare] = useState<Care | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    allCare().then((m) => { if (live) setCare(m.has(id) ? m.get(id)! : undefined); });
    return () => { live = false; };
  }, [id, tick]);
  if (care === undefined) return null;
  return <CareButtons id={id} care={care} onChanged={() => setTick((t) => t + 1)} />;
}
