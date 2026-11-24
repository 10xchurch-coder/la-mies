// Casilla de celular: el +54 9 ya está puesto, se escribe el código de área y el número,
// y se va armando solo el formato (376 485-7649). Si faltan números, lo avisa.
// Para alguien de otro país se toca "Es de otro país" y se escribe libre (+1 …).
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { formatNational, isForeign, phoneProblem, typedDigits } from '@/lib/phone';

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'style'> & {
  label?: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Lo que la casilla le muestra a quien escribe, a partir de lo guardado ("+54 9 376 485-7649" → "376 485-7649"). */
export function phoneInputValue(stored: string | null | undefined): string {
  const t = (stored ?? '').trim();
  if (!t || isForeign(t)) return t;
  return formatNational(typedDigits(t));
}

export function PhoneField({ label = 'Celular', hint, value, onChangeText, required, style, onBlur, ...props }: Props) {
  const s = st;
  const [foreign, setForeign] = useState(isForeign(value));
  const [touched, setTouched] = useState(false);
  const shown = foreign ? value : phoneInputValue(value);
  const problem = phoneProblem(shown, required);
  const showProblem = touched && !!shown.trim() && !!problem;
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={s.label}>
        {label}
        {hint ? <Text style={{ color: colors.muted, fontWeight: '500' }}> {hint}</Text> : null}
      </Text>
      <View style={[s.box, showProblem && { borderColor: colors.red }]}>
        {!foreign ? <Text style={s.prefix}>+54 9</Text> : null}
        <TextInput
          placeholderTextColor="#8B918C"
          keyboardType="phone-pad"
          autoComplete="tel"
          {...props}
          style={s.input}
          value={shown}
          placeholder={foreign ? '+1 515 555 0100' : '376 412-3456'}
          onChangeText={(t) => onChangeText(foreign ? t : formatNational(typedDigits(t)))}
          onBlur={(e) => { setTouched(true); onBlur?.(e); }}
        />
      </View>
      {showProblem ? <Text style={{ fontSize: 12, color: colors.redText }}>{problem}</Text> : null}
      <Pressable onPress={() => { setForeign(!foreign); onChangeText(''); }} accessibilityRole="button" hitSlop={6}>
        <Text style={{ fontSize: 12, color: colors.muted, textDecorationLine: 'underline' }}>{foreign ? 'Es de Argentina' : 'Es de otro país'}</Text>
      </Pressable>
    </View>
  );
}

const st = themed(() => StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.label },
  box: { height: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.input, borderRadius: radius.input, backgroundColor: colors.bg, paddingLeft: 14 },
  prefix: { fontSize: 16, fontWeight: '700', color: colors.muted, marginRight: 8 },
  input: { flex: 1, height: '100%', fontSize: 16, color: colors.text, paddingRight: 14 },
}));
