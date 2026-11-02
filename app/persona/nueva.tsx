// Agregar o editar una persona sin estar en la calle: una visita, un miembro, un alumno.
// Cualquiera puede agregar; solo la secretaría o el pastor marcan "miembro".
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen } from '@/components/Screen';
import { Face } from '@/components/Face';
import { Button, Card, Choice, Field, Loading, SectionTitle } from '@/components/ui';
import { addPerson, listGroups, updateContact } from '@/lib/api';
import { pickAndUploadPhoto } from '@/lib/files';
import { supabase, errorMessage } from '@/lib/supabase';
import { groupWord, isoDate } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Contact, Group, PersonStatus } from '@/types';

type Kid = { id?: string; name: string; age: string };

export default function NuevaPersona() {
  const router = useRouter();
  const { id, status: initialStatus } = useLocalSearchParams<{ id?: string; status?: string }>();
  const { church, isStaff } = useAuth();
  const [loaded, setLoaded] = useState(!id);
  const [orig, setOrig] = useState<Contact | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'m' | 'f' | null>(null);
  const [marital, setMarital] = useState<Contact['marital']>(null);
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [groupId, setGroupId] = useState<string>('none');
  const [status, setStatus] = useState<PersonStatus>(
    initialStatus === 'member' && isStaff ? 'member' : initialStatus === 'contact' ? 'contact' : 'visitor',
  );
  const [kids, setKids] = useState<Kid[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listGroups().then(setGroups).catch(() => undefined);
    if (!id) return;
    (async () => {
      const [{ data: c }, { data: ch }] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', id).maybeSingle(),
        supabase.from('contact_children').select('*').eq('contact_id', id).order('age', { ascending: false }),
      ]);
      const x = c as Contact | null;
      if (x) {
        setOrig(x);
        setPhoto(x.photo_path);
        setName(x.name);
        setPhone(x.phone ?? '');
        setAge(x.age != null ? String(x.age) : '');
        setSex(x.sex);
        setMarital(x.marital);
        setAddress(x.address ?? x.address_hint ?? '');
        setEmail(x.email ?? '');
        setGroupId(x.group_id ?? 'none');
        setStatus(x.status);
      }
      setKids(((ch ?? []) as { id: string; name: string; age: number | null }[]).map((k) => ({ id: k.id, name: k.name, age: k.age != null ? String(k.age) : '' })));
      setLoaded(true);
    })();
  }, [id]);

  const choosePhoto = async () => {
    if (!church) return;
    try {
      const p = await pickAndUploadPhoto(church.id);
      if (p) setPhoto(p);
    } catch (e) {
      Alert.alert('No se pudo subir la foto', errorMessage(e));
    }
  };

  const save = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Falta el nombre');
      return;
    }
    setBusy(true);
    try {
      const n = age.trim() ? Number(age.replace(/\D/g, '')) : null;
      const patch: Partial<Contact> = {
        name: name.trim(),
        phone: phone.trim() || null,
        age: n != null && n >= 0 && n <= 120 ? n : null,
        sex,
        marital,
        address: address.trim() || null,
        email: email.trim().toLowerCase() || null,
        group_id: groupId === 'none' ? null : groupId,
        photo_path: photo,
      };
      if (isStaff) {
        patch.status = status;
        if (status === 'member' && !orig?.member_since) patch.member_since = isoDate(new Date());
        if (status !== 'member') patch.member_since = null;
      } else if (!orig) {
        patch.status = status === 'member' ? 'visitor' : status;
      }
      let contactId = id;
      if (orig && id) {
        await updateContact(id, patch);
      } else {
        const created = await addPerson({ ...patch, name: patch.name as string, interest: 'some' });
        contactId = created.id;
      }
      // Hijos: se reemplaza la lista completa.
      if (contactId) {
        const keep = kids.filter((k) => k.name.trim());
        if (orig) await supabase.from('contact_children').delete().eq('contact_id', contactId);
        if (keep.length) {
          const { error } = await supabase.from('contact_children').insert(keep.map((k) => ({ contact_id: contactId, name: k.name.trim(), age: k.age ? Number(k.age) : null })));
          if (error) throw error;
        }
      }
      if (orig) router.back();
      else router.replace({ pathname: '/contacto/[id]', params: { id: contactId as string } });
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Loading />;
  const gw = groupWord(church?.grouping);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={orig ? 'Editar persona' : 'Agregar persona'} subtitle={orig ? orig.name : 'Una visita, un miembro o un alumno'} back />
      <Screen>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Face name={name || '?'} path={photo} size={96} editable onPress={choosePhoto} />
          <Text style={{ fontSize: 12, color: colors.muted }}>Tocá para sacar o elegir una foto</Text>
        </View>

        <Field label="Nombre y apellido" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Celular" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="Ej: 376 455-1234" />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field label="Edad" keyboardType="number-pad" value={age} onChangeText={setAge} style={{ width: 90 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Sexo</Text>
            <Choice columns={2} options={[{ value: 'm', label: 'Hombre' }, { value: 'f', label: 'Mujer' }]} value={sex} onChange={setSex} />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Estado civil</Text>
          <Choice
            options={[{ value: 'single', label: 'Soltero/a' }, { value: 'married', label: 'Casado/a' }, { value: 'partner', label: 'En pareja' }, { value: 'widowed', label: 'Viudo/a' }]}
            value={marital}
            onChange={(v) => setMarital(v as Contact['marital'])}
          />
        </View>
        <Field label="Dirección" hint="(calle y número, barrio)" value={address} onChangeText={setAddress} />
        <Field label="Correo" hint="(opcional)" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />

        {groups.length ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{gw}</Text>
            <Choice options={[{ value: 'none', label: `Sin ${gw.toLowerCase()}` }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} value={groupId} onChange={setGroupId} />
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>¿Quién es?</Text>
          <Choice
            columns={3}
            options={[
              { value: 'contact', label: 'Contacto' },
              { value: 'visitor', label: 'Visita' },
              ...(isStaff ? [{ value: 'member' as const, label: 'Miembro' }] : []),
            ]}
            value={status}
            onChange={setStatus}
          />
          {!isStaff ? <Text style={{ fontSize: 12, color: colors.muted }}>Para marcar a alguien como miembro, pedíselo a la secretaría o al pastor.</Text> : null}
        </View>

        <SectionTitle>Hijos</SectionTitle>
        <Card style={{ gap: 10 }}>
          {kids.map((k, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <Field label="Nombre" value={k.name} onChangeText={(t) => setKids(kids.map((x, j) => (j === i ? { ...x, name: t } : x)))} style={{ flex: 1 }} />
              <Field label="Edad" keyboardType="number-pad" value={k.age} onChangeText={(t) => setKids(kids.map((x, j) => (j === i ? { ...x, age: t.replace(/\D/g, '') } : x)))} style={{ width: 70 }} />
              <Pressable onPress={() => setKids(kids.filter((_, j) => j !== i))} accessibilityLabel="Quitar" style={{ height: 50, width: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="trash-2" size={20} color={colors.red} />
              </Pressable>
            </View>
          ))}
          <Button title="Agregar hijo" icon="plus" variant="outline" small onPress={() => setKids([...kids, { name: '', age: '' }])} />
        </Card>

        <Button title={orig ? 'Guardar cambios' : 'Guardar persona'} onPress={save} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
