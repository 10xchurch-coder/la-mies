// Estilo del mapa, a elección de cada hermano (se recuerda en su teléfono):
//  - Satélite: la foto desde arriba.
//  - Calles: el mapa común con nombres de calles.
//  - Simple: solo las líneas de las calles, sin comercios ni lugares.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapStyleElement, MapType } from './map';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, themed } from '../theme';

export type MapStyle = 'satellite' | 'standard' | 'simple';
const OPTIONS: { value: MapStyle; label: string }[] = [
  { value: 'satellite', label: 'Satélite' },
  { value: 'standard', label: 'Calles' },
  { value: 'simple', label: 'Simple' },
];
const KEY = 'lamies.mapStyle';

// Android (Google Maps): sin nombres ni lugares, solo las calles.
const SIMPLE_ANDROID: MapStyleElement[] = [
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', stylers: [{ color: '#F2F3EF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#C9CEC6' }] },
  { featureType: 'water', stylers: [{ color: '#CFE0EE' }] },
];

/** Lo que hay que pasarle al mapa para cada estilo. */
export function mapStyleProps(style: MapStyle): { mapType: MapType; customMapStyle?: MapStyleElement[]; showsPointsOfInterest: boolean; showsBuildings: boolean } {
  if (style === 'satellite') return { mapType: 'satellite', showsPointsOfInterest: false, showsBuildings: false };
  if (style === 'simple') {
    // iPhone (Apple Maps) no permite ocultar los nombres de las calles: usamos su versión "apagada".
    return Platform.OS === 'ios'
      ? { mapType: 'mutedStandard', showsPointsOfInterest: false, showsBuildings: false }
      : { mapType: 'standard', customMapStyle: SIMPLE_ANDROID, showsPointsOfInterest: false, showsBuildings: false };
  }
  return { mapType: 'standard', showsPointsOfInterest: true, showsBuildings: true };
}

export function useMapStyle(): [MapStyle, (s: MapStyle) => void] {
  const [style, setStyle] = useState<MapStyle>('standard');
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'satellite' || v === 'standard' || v === 'simple') setStyle(v);
      })
      .catch(() => undefined);
  }, []);
  const choose = (s: MapStyle) => {
    setStyle(s);
    AsyncStorage.setItem(KEY, s).catch(() => undefined);
  };
  return [style, choose];
}

/** Tres botones juntos, siempre a la vista, para cambiar en cualquier momento. */
export function MapTypeButton({ style, onChange, top = 60 }: { style: MapStyle; onChange: (s: MapStyle) => void; top?: number }) {
  return (
    <View style={[styles.wrap, { top }]} accessibilityRole="radiogroup" accessibilityLabel="Estilo del mapa">
      {OPTIONS.map((o) => {
        const on = o.value === style;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.option, on && styles.optionOn]}
          >
            <Text style={[styles.text, on && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: {
    position: 'absolute', right: 12, flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: colors.bg,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  option: { height: 36, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  optionOn: { backgroundColor: colors.green },
  text: { fontSize: 12, fontWeight: '700', color: colors.text },
  textOn: { color: '#FFFFFF' },
}));
