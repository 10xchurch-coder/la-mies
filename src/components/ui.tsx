// Piezas de interfaz reutilizables, con el estilo del diseño.
import React from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View, type PressableProps,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, themed } from '../theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

export function Button({
  title, onPress, variant = 'primary', icon, loading, disabled, style, small,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === 'primary' ? colors.green : variant === 'danger' ? colors.bg : variant === 'outline' ? colors.bg : 'transparent';
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.red : colors.green;
  const border = variant === 'danger' ? colors.red : variant === 'outline' ? colors.green : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === 'primary' || variant === 'ghost' ? 0 : 2, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={small ? 16 : 20} color={fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.label}>
        {label}
        {hint ? <Text style={{ color: colors.muted, fontWeight: '500' }}> {hint}</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor="#8B918C"
        style={[styles.input, props.multiline && { minHeight: 92, paddingTop: 12, textAlignVertical: 'top' }]}
        {...props}
      />
    </View>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && { color: colors.text, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Botones tipo "sí / no" verdes. */
export function Choice<T extends string>({
  options, value, onChange, style, columns,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  columns?: number;
}) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn, columns ? { flexBasis: `${100 / columns - 3}%` as `${number}%`, flexGrow: 1 } : null]}
          >
            <Text style={[styles.chipText, on && { color: colors.greenText, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.green, false: colors.input }} thumbColor="#FFFFFF" />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Stat({ value, label, tone = 'plain' }: { value: string | number; label: string; tone?: 'plain' | 'green' | 'amber' | 'blue' }) {
  const bg = tone === 'green' ? colors.greenSoft : tone === 'amber' ? colors.amberSoft : tone === 'blue' ? colors.blueSoft : colors.bgSoft;
  const fg = tone === 'green' ? colors.greenText : tone === 'amber' ? colors.amberText : tone === 'blue' ? colors.blueText : colors.text;
  const lb = tone === 'plain' ? colors.muted : fg;
  return (
    <View style={{ flex: 1, minWidth: 70, gap: 2, padding: 12, borderRadius: 12, backgroundColor: bg }}>
      <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: fg }}>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: '600', color: lb }}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40, color = colors.greenSoft, textColor = colors.greenText }: { name: string; size?: number; color?: string; textColor?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: textColor }}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function Tag({ text, tone = 'gray' }: { text: string; tone?: 'green' | 'blue' | 'amber' | 'gray' | 'red' }) {
  const map = {
    green: [colors.greenSoft, colors.greenText],
    blue: [colors.blueSoft, colors.blueText],
    amber: [colors.amberSoft, colors.amberText],
    gray: [colors.graySoft, colors.grayText],
    red: [colors.redSoft, colors.redText],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: fg }}>{text}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function RowLink({ title, subtitle, right, onPress, icon, danger }: {
  title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; icon?: IconName; danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgSoft }]}>
      {icon ? <Feather name={icon} size={20} color={danger ? colors.red : colors.green} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: danger ? colors.red : colors.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: colors.muted }}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && !danger ? <Feather name="chevron-right" size={20} color={colors.muted} /> : null}
    </Pressable>
  );
}

export function Empty({ title, text, icon = 'inbox' }: { title: string; text?: string; icon?: IconName }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, padding: 32 }}>
      <Feather name={icon} size={36} color={colors.gray} />
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 }}>{text}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.green} size="large" />
    </View>
  );
}

export function IconButton({ icon, onPress, label, style, ...rest }: PressableProps & { icon: IconName; label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }, style]}
      {...rest}
    >
      <Feather name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

export const styles = themed(() => StyleSheet.create({
  button: {
    height: 56, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 16,
  },
  buttonSmall: { height: 44, borderRadius: 12 },
  buttonText: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.label },
  input: {
    height: 50, borderWidth: 1.5, borderColor: colors.input, borderRadius: radius.input, paddingHorizontal: 14, fontSize: 16, color: colors.text, backgroundColor: colors.bg,
  },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: colors.bgSoft },
  segment: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentOn: { backgroundColor: colors.bg, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.label },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: colors.input, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  card: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, padding: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSoft },
}));
