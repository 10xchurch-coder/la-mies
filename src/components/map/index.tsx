// El mapa. En el teléfono es react-native-maps; en la web (index.web.tsx) es Leaflet.
// En Android, el mapa de Google necesita una clave; sin ella la app se cierra. Hasta tenerla, mostramos un aviso.
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import RNMapView, { Marker, Polyline, type MapViewProps } from 'react-native-maps';

export { Marker, Polyline };
export type { MapViewProps, Region, MapType, MapStyleElement } from 'react-native-maps';

const androidKey = (Constants.expoConfig?.android as { config?: { googleMaps?: { apiKey?: string } } } | undefined)?.config?.googleMaps?.apiKey;
const mapAvailable = Platform.OS !== 'android' || !!androidKey;

export const MapView = React.forwardRef<RNMapView, MapViewProps>(function MapView(props, ref) {
  if (!mapAvailable) {
    return (
      <View style={[StyleSheet.absoluteFill, props.style, styles.missing]}>
        <Text style={styles.title}>El mapa todavía no está activado en Android</Text>
        <Text style={styles.text}>Falta la clave de Google Maps en esta versión de prueba. Todo lo demás funciona.</Text>
      </View>
    );
  }
  return <RNMapView ref={ref} {...props} />;
});
export default MapView;

const styles = StyleSheet.create({
  missing: { backgroundColor: '#E3E7DF', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: '#1F2A24', textAlign: 'center' },
  text: { fontSize: 13, color: '#5B635D', textAlign: 'center', lineHeight: 18 },
});
