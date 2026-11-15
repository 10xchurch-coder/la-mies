// Ajustes de la iglesia · Seguimiento y mensajes: cada iglesia decide cuándo se le avisa (escribir, visitar)
// y qué dice cada mensaje de WhatsApp ya escrito. Lo que no se toca queda con los valores de siempre.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Field, SectionTitle } from '@/components/ui';
import { DEFAULT_FOLLOWUP, MESSAGE_TITLE, PLACEHOLDERS, fillMessage, followupOverrides, mergeFollowup, type FollowupConfig, type FollowupMessageKind } from '@/lib/followupConfig';
import { setBaseline } from '@/lib/api';
import { errorMessage, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

type NumKey = 'write_hours' | 'visit_after_visits' | 'visit_days' | 'absent_visit_weeks' | 'disc_one_classes' | 'disc_course_classes';
const NUMBERS: { key: NumKey; title: string; unit: (n: number) => string; step: number; min: number; max: number }[] = [
  { key: 'write_hours', title: 'Escribirle a quien vino, dentro de', unit: (n) => (n === 1 ? 'hora' : 'horas'), step: 12, min: 12, max: 336 },
  { key: 'visit_after_visits', title: 'Pedir que lo visiten en su casa después de', unit: (n) => (n === 1 ? 'visita a la iglesia' : 'visitas a la iglesia'), step: 1, min: 1, max: 6 },
  { key: 'visit_days', title: 'Esa visita hay que hacerla dentro de', unit: (n) => (n === 1 ? 'día' : 'días'), step: 1, min: 1, max: 60 },
  { key: 'absent_visit_weeks', title: 'Pedir que visiten a quien falta, después de', unit: (n) => (n === 1 ? 'fin de semana sin venir' : 'fines de semana seguidos sin venir'), step: 1, min: 1, max: 8 },
];
const PROGRAM: typeof NUMBERS = [
  { key: 'disc_one_classes', title: 'Discipulado personal (uno a uno)', unit: (n) => (n === 1 ? 'clase' : 'clases'), step: 1, min: 0, max: 20 },
  { key: 'disc_course_classes', title: 'Curso de discipulado (en clase)', unit: (n) => (n === 1 ? 'clase' : 'clases'), step: 1, min: 0, max: 60 },
];
const ORDER: FollowupMessageKind[] = ['firstvisit', 'secondvisit', 'missed1', 'missed2', 'missed3', 'promise', 'followup', 'visit'];

export default function FollowupSettings() {
  const { church, profile, can, refreshProfile } = useAuth();
  const [cfg, setCfg] = useState<FollowupConfig>(() => mergeFollowup(church?.followup));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<FollowupMessageKind | null>(null);
  const dirty = useMemo(() => JSON.stringify(followupOverrides(cfg)) !== JSON.stringify(followupOverrides(mergeFollowup(church?.followup))), [cfg, church?.followup]);
  const sample = { nombre: 'María', yo: (profile?.display_name ?? 'Pastor').split(' ')[0], iglesia: church?.name ?? 'la iglesia', cuando: 'el domingo a las 10:00' };

  if (!can('admin.iglesia')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Seguimiento y mensajes" back />
        <Screen><Text style={{ color: colors.muted }}>Solo el pastor o un administrador puede cambiar esto.</Text></Screen>
      </View>
    );
  }

  const save = async () => {
    if (!church) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('churches').update({ followup: followupOverrides(cfg) }).eq('id', church.id);
      if (error) throw error;
      await refreshProfile();
      Alert.alert('Guardado', 'Los cambios ya valen para toda la iglesia.');
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Seguimiento y mensajes" subtitle="Avisos, punto de partida, discipulado y mensajes" back />
      <Screen>
        <SectionTitle>Cuándo avisar</SectionTitle>
        <Card style={{ gap: 14 }}>
          {NUMBERS.map((n) => (
            <View key={n.key} style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{n.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Step icon="minus" label={`Menos: ${n.title}`} disabled={cfg[n.key] - n.step < n.min} onPress={() => setCfg({ ...cfg, [n.key]: cfg[n.key] - n.step })} />
                <Text style={{ minWidth: 34, textAlign: 'center', fontSize: 20, fontWeight: '800', color: colors.text }}>{cfg[n.key]}</Text>
                <Step icon="plus" label={`Más: ${n.title}`} disabled={cfg[n.key] + n.step > n.max} onPress={() => setCfg({ ...cfg, [n.key]: cfg[n.key] + n.step })} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.muted }}>{n.unit(cfg[n.key])}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionTitle>Punto de partida</SectionTitle>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
            {church?.tracking_since ? `Desde el ${new Date(`${church.tracking_since}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Todavía no está fijado'}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
            Es el día en que la iglesia empezó a llevar sus números en la app. Los miembros y las personas que ya estaban cargados ese día no cuentan como “primera vez” ni como “miembros nuevos”: el crecimiento se cuenta desde ahí. La fidelidad y las ausencias también arrancan ese día.
          </Text>
          <Button title={church?.tracking_since ? 'Fijar de nuevo: empezar a contar desde hoy' : 'Fijar el punto de partida hoy'} variant="outline" small icon="flag" onPress={() => {
            Alert.alert('Fijar el punto de partida', 'Desde hoy se cuenta el crecimiento. Todos los miembros y las visitas que ya están cargados quedan como “ya estaban”. Hacelo cuando termines de cargar a tu gente. ¿Seguimos?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Fijar hoy', onPress: () => { setBaseline().then(() => refreshProfile()).then(() => Alert.alert('Listo', 'El punto de partida quedó fijado en el día de hoy.')).catch((e) => Alert.alert('No se pudo', errorMessage(e))); } },
            ]);
          }} />
        </Card>

        <SectionTitle>Programa de discipulado</SectionTitle>
        <Card style={{ gap: 14 }}>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>Cuántas clases tiene cada parte. En la ficha de cada persona se tildan las que completó. Poné 0 si no usan esa parte.</Text>
          {PROGRAM.map((n) => (
            <View key={n.key} style={{ gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{n.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Step icon="minus" label={`Menos: ${n.title}`} disabled={cfg[n.key] - n.step < n.min} onPress={() => setCfg({ ...cfg, [n.key]: cfg[n.key] - n.step })} />
                <Text style={{ minWidth: 34, textAlign: 'center', fontSize: 20, fontWeight: '800', color: colors.text }}>{cfg[n.key]}</Text>
                <Step icon="plus" label={`Más: ${n.title}`} disabled={cfg[n.key] + n.step > n.max} onPress={() => setCfg({ ...cfg, [n.key]: cfg[n.key] + n.step })} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.muted }}>{n.unit(cfg[n.key])}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionTitle>Mensajes de WhatsApp</SectionTitle>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
          Tocá un mensaje para cambiarlo. Podés usar {PLACEHOLDERS.join(', ')}: la app los reemplaza por el nombre de la persona, tu nombre, el nombre de la iglesia y el día y la hora del culto.
        </Text>
        {ORDER.map((k) => {
          const changed = cfg.messages[k].trim() !== DEFAULT_FOLLOWUP.messages[k];
          const isOpen = open === k;
          return (
            <Card key={k} style={{ gap: 8 }}>
              <Pressable onPress={() => setOpen(isOpen ? null : k)} accessibilityRole="button" accessibilityLabel={`${MESSAGE_TITLE[k]}. ${isOpen ? 'Cerrar' : 'Cambiar el mensaje'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{MESSAGE_TITLE[k]}{changed ? ' · cambiado' : ''}</Text>
                  {isOpen ? null : <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={2}>{fillMessage(cfg.messages[k], sample)}</Text>}
                </View>
                <Feather name={isOpen ? 'chevron-up' : 'edit-2'} size={17} color={colors.muted} />
              </Pressable>
              {isOpen ? (
                <>
                  <Field label="Mensaje" value={cfg.messages[k]} onChangeText={(t) => setCfg({ ...cfg, messages: { ...cfg.messages, [k]: t } })} multiline style={{ minHeight: 120 }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Así le llega a María:</Text>
                  <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>{fillMessage(cfg.messages[k].trim() || DEFAULT_FOLLOWUP.messages[k], sample)}</Text>
                  {changed ? <Button title="Volver al mensaje original" variant="ghost" small icon="rotate-ccw" onPress={() => setCfg({ ...cfg, messages: { ...cfg.messages, [k]: DEFAULT_FOLLOWUP.messages[k] } })} /> : null}
                </>
              ) : null}
            </Card>
          );
        })}

        <Button title={busy ? 'Guardando…' : dirty ? 'Guardar los cambios' : 'Sin cambios para guardar'} icon="check" disabled={busy || !dirty} onPress={save} />
      </Screen>
    </View>
  );
}

function Step({ icon, label, onPress, disabled }: { icon: 'plus' | 'minus'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenSoft, opacity: disabled ? 0.35 : 1 }}>
      <Feather name={icon} size={18} color={colors.greenText} />
    </Pressable>
  );
}
