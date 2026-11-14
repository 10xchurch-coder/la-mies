// El punto azul de "estás acá", con el abanico que muestra hacia dónde mirás (como en Google Maps).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from './map';
import type { MyLocation } from '../lib/useMyLocation';

const BLUE = '#1A73E8';
const SIZE = 96; // cuadro donde entran el punto y el abanico

export function MyLocationMarker({ pos, heading }: { pos: MyLocation | null; heading: number | null }) {
  if (!pos) return null;
  return (
    <Marker coordinate={{ latitude: pos.lat, longitude: pos.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges zIndex={999}>
      <View style={styles.box} pointerEvents="none" accessibilityLabel="Tu ubicación">
        {heading !== null ? (
          // El abanico apunta hacia arriba y se gira todo el cuadro según la brújula.
          <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${heading}deg` }] }]}>
            <View style={styles.fanWide} />
            <View style={styles.fanNarrow} />
          </View>
        ) : null}
        <View style={styles.halo} />
        <View style={styles.dot} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  // Dos triángulos, uno ancho y suave y otro más angosto y fuerte: dan el degradé del abanico.
  fanWide: {
    position: 'absolute', top: 2, left: SIZE / 2 - 30, width: 0, height: 0,
    borderLeftWidth: 30, borderRightWidth: 30, borderTopWidth: SIZE / 2 - 2,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(26,115,232,0.20)',
  },
  fanNarrow: {
    position: 'absolute', top: 14, left: SIZE / 2 - 17, width: 0, height: 0,
    borderLeftWidth: 17, borderRightWidth: 17, borderTopWidth: SIZE / 2 - 14,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(26,115,232,0.30)',
  },
  halo: { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(26,115,232,0.16)' },
  dot: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: BLUE, borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3,
  },
});
