// Campo de contraseña nueva con ojo para verla y el aviso de las reglas.
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { checkPassword } from '../lib/password';
import { colors } from '../theme';

export function PasswordField({ label, value, onChangeText, personal = [], isNew = true, autoComplete = 'new-password' }: {
  label: string; value: string; onChangeText: (t: string) => void; personal?: string[]; isNew?: boolean; autoComplete?: 'new-password' | 'password';
}) {
  const [show, setShow] = useState(false);
  const check = isNew && value ? checkPassword(value, personal) : null;
  const tone = check ? (check.strength === 'fuerte' ? colors.green : check.strength === 'buena' ? colors.blue : colors.red) : colors.muted;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{label}{isNew ? <Text style={{ fontWeight: '400', color: colors.muted }}>  (10 o más caracteres, con letras y números)</Text> : null}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.input, borderRadius: 12, paddingLeft: 12 }}>
        <TextInput value={value} onChangeText={onChangeText} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} autoComplete={autoComplete} textContentType={isNew ? 'newPassword' : 'password'} style={{ flex: 1, height: 48, fontSize: 16, color: colors.text }} accessibilityLabel={label} />
        <Pressable onPress={() => setShow(!show)} accessibilityRole="button" accessibilityLabel={show ? 'Ocultar contraseña' : 'Ver contraseña'} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={show ? 'eye-off' : 'eye'} size={20} color={colors.muted} />
        </Pressable>
      </View>
      {check ? (
        <Text style={{ fontSize: 12, color: tone, lineHeight: 17 }}>
          {check.ok ? `Contraseña ${check.strength}.` : check.problems[0]}
        </Text>
      ) : null}
    </View>
  );
}
