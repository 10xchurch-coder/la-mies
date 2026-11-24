// Primeros pasos de una iglesia nueva: el pastor arma lo básico en 5 pasos cortos.
// Cada paso usa lo mismo que las pantallas de siempre (Reuniones, Clases, Funciones), con ideas ya cargadas
// tomadas de cómo está armada la Iglesia Bautista Victoria. Todo se puede cambiar después.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Empty, Field, Loading, SectionTitle, Toggle } from '@/components/ui';
import { useChurchLogo } from '@/components/BrandFooter';
import { listAllServices, listClasses, setFeature } from '@/lib/api';
import { CLASS_IDEAS, clampStep, cleanTime, missingIdeas, SERVICE_IDEAS, SETUP_STEPS, START_OFF, type ClassIdea, type ServiceIdea } from '@/lib/churchSetup';
import { saveSetup } from '@/lib/churchSetupData';
import { FEATURES, FEATURE_GROUPS, cleanDisabled, featureOn, type FeatureKey } from '@/lib/features';
import { uploadPicked } from '@/lib/files';
import { dayName } from '@/lib/format';
import { churchExtras } from '@/lib/givingData';
import { shareText } from '@/lib/share';
import { supabase, errorMessage } from '@/lib/supabase';
import { refreshChurchExtras } from '@/lib/useChurchExtras';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ChurchService, ClassRow } from '@/types';

const fail = (e: unknown) => Alert.alert('No se pudo', errorMessage(e));

export default function Alta() {
  const router = useRouter();
  const { church, can, refreshProfile } = useAuth();
  const logo = useChurchLogo();
  const [step, setStep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Paso 1
  const [name, setName] = useState(church?.name ?? '');
  const [city, setCity] = useState(church?.city ?? '');
  const [motto, setMotto] = useState('');
  // Pasos 2 y 3
  const [services, setServices] = useState<ChurchService[]>([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [classes, setClasses] = useState<ClassRow[]>([]);
  // Paso 4
  const [off, setOff] = useState<FeatureKey[]>(() => cleanDisabled(church?.disabled_features));
  // Paso 5
  const [joinCode, setJoinCode] = useState<string | null>(null);

  const allowed = can('admin.iglesia');

  useEffect(() => {
    if (!allowed) return;
    churchExtras().then((x) => { setStep(clampStep(x.setup_step)); setMotto(x.motto ?? ''); }).catch(() => setStep(0));
    supabase.rpc('church_join_code').then(({ data }) => setJoinCode(typeof data === 'string' ? data : null));
  }, [allowed]);
  useEffect(() => { setOff(cleanDisabled(church?.disabled_features)); }, [church?.disabled_features]);

  const loadLists = useCallback(() => {
    listAllServices().then((s) => { setServices(s); setTimes(Object.fromEntries(s.map((x) => [x.id, x.time]))); }).catch(() => undefined);
    listClasses().then(setClasses).catch(() => undefined);
  }, []);
  useEffect(() => { if (allowed) loadLists(); }, [allowed, loadLists]);

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Primeros pasos" back />
        <Empty icon="lock" title="Solo el pastor o el administrador de la app" />
      </View>
    );
  }
  if (step === null || !church) return <Loading />;

  // ---------- Paso 1: tu iglesia ----------
  const saveChurch = async () => {
    if (name.trim().length < 3) throw new Error('Escribí el nombre de la iglesia.');
    const { error } = await supabase.from('churches').update({ name: name.trim(), city: city.trim() || null }).eq('id', church.id);
    if (error) throw error;
    await saveSetup({ motto: motto.trim() });
    await refreshProfile();
  };
  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Sin permiso', 'Activá el permiso de fotos en los ajustes del teléfono.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
      const a = res.canceled ? null : res.assets?.[0];
      if (!a) return;
      setBusy(true);
      const mime = a.mimeType ?? 'image/png';
      const path = await uploadPicked('materials', church.id, { uri: a.uri, name: `logo.${mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'}`, size: a.fileSize ?? null, mimeType: mime });
      const { error } = await supabase.from('churches').update({ logo_path: path }).eq('id', church.id);
      if (error) throw error;
      await refreshProfile();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // ---------- Paso 2: reuniones ----------
  const addService = async (i: ServiceIdea) => {
    const { error } = await supabase.from('church_services').insert({ name: i.name, dow: i.dow, time: i.time, main: i.main, sort_order: (services.length + 1) * 10 });
    if (error) fail(error);
    loadLists();
  };
  const patchService = async (id: string, p: Partial<ChurchService>) => {
    const { error } = await supabase.from('church_services').update(p).eq('id', id);
    if (error) fail(error);
    loadLists();
  };
  const saveTime = (s: ChurchService) => {
    const t = cleanTime(times[s.id] ?? '');
    if (!t) { Alert.alert('Hora inválida', 'Escribila así: 19:30'); setTimes({ ...times, [s.id]: s.time }); return; }
    if (t !== s.time) patchService(s.id, { time: t });
  };

  // ---------- Paso 3: clases ----------
  const addClasses = async (ideas: ClassIdea[]) => {
    if (!ideas.length) return;
    const base = classes.length;
    const { error } = await supabase.from('classes').insert(ideas.map((c, i) => ({ name: c.name, age_min: c.age_min, age_max: c.age_max, sort_order: (base + i + 1) * 10 })));
    if (error) fail(error);
    loadLists();
  };

  // ---------- Paso 4: funciones ----------
  const change = async (key: FeatureKey, enabled: boolean) => {
    const before = off;
    setOff(enabled ? off.filter((k) => k !== key) : [...off, key]);
    try {
      setOff(cleanDisabled(await setFeature(key, enabled)));
      await refreshProfile();
    } catch (e) {
      setOff(before); fail(e);
    }
  };
  const recommended = async () => {
    setBusy(true);
    try {
      let last: string[] = off;
      for (const k of START_OFF) if (featureOn(last, k)) last = await setFeature(k, false);
      setOff(cleanDisabled(last));
      await refreshProfile();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // ---------- Avanzar ----------
  const go = async (to: number) => {
    setBusy(true);
    try {
      if (step === 0 && to > step) await saveChurch();
      await saveSetup({ step: to });
      setStep(to);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    try {
      await saveSetup({ step: SETUP_STEPS.length - 1, done: true });
      refreshChurchExtras();
      router.replace('/' as Href);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const shareCode = () => {
    if (!joinCode) return;
    shareText(`Para usar la app La Mies de ${church.name}: descargala, tocá "Crear cuenta" y poné el código ${joinCode}`, 'Código de la iglesia').catch(() => undefined);
  };

  const serviceIdeas = missingIdeas(SERVICE_IDEAS, services);
  const classIdeas = missingIdeas(CLASS_IDEAS, classes);
  const lastStep = step === SETUP_STEPS.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Primeros pasos" subtitle={`Paso ${step + 1} de ${SETUP_STEPS.length}: ${SETUP_STEPS[step]}`} back />
      <Screen>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SETUP_STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.pink : colors.border }} />)}
        </View>

        {step === 0 ? (
          <>
            <Card style={{ backgroundColor: colors.pinkSoft, borderColor: colors.pinkSoft }}>
              <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
                ¡Bienvenido! En 5 pasos cortos dejás lista la app para tu iglesia. Nada es definitivo: todo se puede cambiar después.
              </Text>
            </Card>
            <Card style={{ gap: 10 }}>
              <Field label="Nombre de la iglesia" value={name} onChangeText={setName} autoCapitalize="words" />
              <Field label="Ciudad" value={city} onChangeText={setCity} autoCapitalize="words" />
              <Field label="Lema" hint="(opcional: una frase corta de tu iglesia)" value={motto} onChangeText={setMotto} maxLength={200} placeholder="Una iglesia para toda la familia" />
            </Card>
            <Card style={{ gap: 10, alignItems: 'center' }}>
              {logo ? <Image source={{ uri: logo }} style={{ width: 96, height: 96 }} contentFit="contain" /> : <Text style={{ fontSize: 13, color: colors.muted }}>Todavía no hay logo.</Text>}
              <Button title={logo ? 'Cambiar el logo' : 'Elegir el logo'} icon="image" variant="outline" small onPress={pickLogo} loading={busy} />
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 }}>Opcional. Mejor una imagen cuadrada con fondo transparente (PNG).</Text>
            </Card>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              Estas son las reuniones de la semana. Aparecen al tomar asistencia. Cambiá la hora o apagá la que no tengan.
            </Text>
            {services.map((s) => (
              <Card key={s.id} style={{ gap: 6, opacity: s.active ? 1 : 0.55 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{s.name} · {dayName(s.dow)}</Text>
                <Field label="Hora" value={times[s.id] ?? s.time} onChangeText={(t) => setTimes({ ...times, [s.id]: t })} onBlur={() => saveTime(s)} placeholder="19:30" keyboardType="numbers-and-punctuation" />
                <Toggle label="La tenemos" value={s.active} onChange={(v) => patchService(s.id, { active: v })} />
                <Toggle label="Es un culto principal" hint="Los cultos principales cuentan para la fidelidad. Jóvenes u oración, mejor no." value={s.main} onChange={(v) => patchService(s.id, { main: v })} />
              </Card>
            ))}
            {serviceIdeas.length ? (
              <>
                <SectionTitle>Agregar con un toque</SectionTitle>
                {serviceIdeas.map((i) => (
                  <Button key={i.name} title={`${i.name} · ${dayName(i.dow)} ${i.time}`} icon="plus" variant="outline" small onPress={() => addService(i)} />
                ))}
              </>
            ) : null}
            <Button title="Agregar otra reunión" variant="ghost" small onPress={() => router.push('/admin/reuniones' as Href)} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              Las clases de la escuela dominical. Si tu iglesia no tiene clases, seguí al paso que viene.
            </Text>
            {classes.length ? (
              <Card style={{ gap: 6 }}>
                {classes.map((c) => <Text key={c.id} style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>• {c.name}</Text>)}
              </Card>
            ) : <Text style={{ fontSize: 13, color: colors.muted }}>Todavía no hay clases.</Text>}
            {classIdeas.length ? (
              <>
                <SectionTitle>Agregar con un toque</SectionTitle>
                {classIdeas.length > 1 ? <Button title={`Agregar las ${classIdeas.length} clases de los chicos`} icon="plus-circle" onPress={() => addClasses(classIdeas)} /> : null}
                {classIdeas.map((c) => <Button key={c.name} title={c.name} icon="plus" variant="outline" small onPress={() => addClasses([c])} />)}
              </>
            ) : null}
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              Los maestros, los alumnos y otras clases (jóvenes, adultos) se cargan después en Clases.
            </Text>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              Prendé solo lo que tu iglesia va a usar. Lo apagado no aparece en el menú. No se borra nada y se puede prender después.
            </Text>
            <Button title="Usar lo recomendado para empezar" icon="check-circle" variant="outline" onPress={recommended} loading={busy} />
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              Lo recomendado apaga: {START_OFF.map((k) => FEATURES.find((f) => f.key === k)?.label).filter(Boolean).join(', ')}.
            </Text>
            {FEATURE_GROUPS.map((g) => (
              <View key={g} style={{ gap: 8 }}>
                <SectionTitle>{g}</SectionTitle>
                {FEATURES.filter((f) => f.group === g).map((f) => (
                  <Card key={f.key} style={{ padding: 12 }}>
                    <Toggle label={f.label} hint={f.hint} value={featureOn(off, f.key)} onChange={(v) => change(f.key, v)} disabled={busy} />
                  </Card>
                ))}
              </View>
            ))}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              Este es el código de tu iglesia. Los hermanos lo escriben al crear su cuenta y quedan adentro de tu iglesia.
            </Text>
            <Card style={{ gap: 10 }}>
              <Text selectable style={{ fontSize: 28, fontWeight: '800', letterSpacing: 2, textAlign: 'center', color: colors.pink }}>{joinCode ?? '…'}</Text>
              <Button title="Compartir el código" icon="share-2" onPress={shareCode} disabled={!joinCode} />
            </Card>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
              Lo que sigue, cuando quieras: cargar a los hermanos (Hermanos o Importar personas), dar roles a tus líderes (Roles y permisos) y poner los datos para ofrendar (Ofrendar).
              El código lo encontrás siempre en el Panel del pastor.
            </Text>
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {step > 0 ? <Button title="Atrás" variant="ghost" onPress={() => go(step - 1)} disabled={busy} style={{ flex: 1 }} /> : null}
          {lastStep
            ? <Button title="Terminar" icon="check" onPress={finish} loading={busy} style={{ flex: 2 }} />
            : <Button title="Siguiente" onPress={() => go(step + 1)} loading={busy} style={{ flex: 2 }} />}
        </View>
      </Screen>
    </View>
  );
}
