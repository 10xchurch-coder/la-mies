// El mapa en la web: Leaflet con mapas de OpenStreetMap (calles), CARTO (simple) y Esri (satélite).
// Acepta las mismas props que usamos de react-native-maps, así las pantallas no cambian.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type MapType = 'standard' | 'satellite' | 'hybrid' | 'terrain' | 'none' | 'mutedStandard' | 'satelliteFlyover' | 'hybridFlyover';
export type MapStyleElement = { featureType?: string; elementType?: string; stylers: object[] };
type LatLng = { latitude: number; longitude: number };

export type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  region?: Region;
  mapType?: MapType;
  customMapStyle?: MapStyleElement[];
  showsPointsOfInterest?: boolean;
  showsUserLocation?: boolean;
  toolbarEnabled?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  onRegionChangeComplete?: (r: Region) => void;
  onPress?: (e: { nativeEvent: { coordinate: LatLng } }) => void;
  children?: React.ReactNode;
};

const MapCtx = createContext<L.Map | null>(null);

const TILES = {
  standard: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap', maxZoom: 19 },
  simple: { url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Esri, Maxar, Earthstar Geographics', maxZoom: 19 },
};

function tileKind(p: MapViewProps): keyof typeof TILES {
  if (p.mapType === 'satellite' || p.mapType === 'hybrid') return 'satellite';
  if (p.mapType === 'mutedStandard' || (p.customMapStyle && p.customMapStyle.length)) return 'simple';
  return 'standard';
}

function boundsOf(r: Region): L.LatLngBounds {
  return L.latLngBounds(
    [r.latitude - r.latitudeDelta / 2, r.longitude - r.longitudeDelta / 2],
    [r.latitude + r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2],
  );
}

function regionOf(map: L.Map): Region {
  const b = map.getBounds();
  const c = map.getCenter();
  return { latitude: c.lat, longitude: c.lng, latitudeDelta: b.getNorth() - b.getSouth(), longitudeDelta: b.getEast() - b.getWest() };
}

export function MapView(props: MapViewProps) {
  const { style, initialRegion, region, scrollEnabled = true, zoomEnabled = true, onRegionChangeComplete, onPress, children } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const lastEmitted = useRef<Region | null>(null);
  const kind = tileKind(props);

  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, {
      zoomControl: false,
      dragging: scrollEnabled,
      scrollWheelZoom: zoomEnabled,
      touchZoom: zoomEnabled,
      doubleClickZoom: zoomEnabled,
      boxZoom: false,
      attributionControl: true,
    });
    const r = initialRegion ?? region ?? { latitude: -27.3671, longitude: -55.896, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    m.fitBounds(boundsOf(r), { animate: false });
    if (zoomEnabled) L.control.zoom({ position: 'bottomright' }).addTo(m);
    setMap(m);
    return () => {
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capa de mapa según el estilo elegido.
  useEffect(() => {
    if (!map) return;
    tiles.current?.remove();
    const t = TILES[kind];
    tiles.current = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom }).addTo(map);
  }, [map, kind]);

  // Avisar cuando el usuario mueve el mapa.
  useEffect(() => {
    if (!map) return;
    const onMove = () => {
      const r = regionOf(map);
      lastEmitted.current = r;
      onRegionChangeComplete?.(r);
    };
    const onClick = (e: L.LeafletMouseEvent) => onPress?.({ nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } } });
    map.on('moveend', onMove);
    map.on('click', onClick);
    return () => {
      map.off('moveend', onMove);
      map.off('click', onClick);
    };
  }, [map, onRegionChangeComplete, onPress]);

  // Si la pantalla cambia la región (por ejemplo, centrar en mi ubicación), seguirla.
  useEffect(() => {
    if (!map || !region) return;
    const last = lastEmitted.current;
    if (last && Math.abs(last.latitude - region.latitude) < 1e-6 && Math.abs(last.longitude - region.longitude) < 1e-6) return;
    map.fitBounds(boundsOf(region), { animate: false });
  }, [map, region]);

  // El contenedor puede cambiar de tamaño (ventana, pestaña): avisarle a Leaflet.
  useEffect(() => {
    if (!map || !ref.current) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [map]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <div ref={ref} style={{ width: '100%', height: '100%', background: '#E3E7DF' }} />
      <MapCtx.Provider value={map}>{map ? children : null}</MapCtx.Provider>
    </View>
  );
}

export type MarkerProps = {
  coordinate: LatLng;
  pinColor?: string;
  title?: string;
  description?: string;
  anchor?: { x: number; y: number };
  tracksViewChanges?: boolean;
  onPress?: () => void;
  onCalloutPress?: () => void;
  children?: React.ReactNode;
};

export function Marker({ coordinate, pinColor = '#B3261E', title, description, onPress, onCalloutPress, children }: MarkerProps) {
  const map = useContext(MapCtx);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const layer = useRef<L.Layer | null>(null);
  const hasChildren = !!children;

  useEffect(() => {
    if (!map) return;
    if (hasChildren) {
      const icon = L.divIcon({ className: 'lamies-marker', html: '<div></div>', iconSize: undefined });
      const mk = L.marker([coordinate.latitude, coordinate.longitude], { icon, interactive: true }).addTo(map);
      layer.current = mk;
      const root = mk.getElement()?.firstElementChild as HTMLElement | null;
      if (root) root.style.cssText = 'transform:translate(-50%,-50%);display:inline-block';
      setEl(root);
      mk.on('click', () => onPress?.());
    } else {
      const c = L.circleMarker([coordinate.latitude, coordinate.longitude], { radius: 9, color: '#FFFFFF', weight: 2, fillColor: pinColor, fillOpacity: 1 }).addTo(map);
      layer.current = c;
      if (title) {
        const html = `<b>${title}</b>${description ? `<br>${description}` : ''}${onCalloutPress ? '<br><span style="color:#1F6B45;font-weight:700;cursor:pointer">Ver ficha</span>' : ''}`;
        const popup = c.bindPopup(html);
        popup.on('popupopen', (e) => {
          const node = (e as L.PopupEvent).popup.getElement();
          node?.querySelector('span')?.addEventListener('click', () => onCalloutPress?.());
        });
      }
      c.on('click', () => onPress?.());
    }
    return () => {
      layer.current?.remove();
      layer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, coordinate.latitude, coordinate.longitude, pinColor, title, description, hasChildren]);

  return el && children ? createPortal(<>{children}</>, el) : null;
}

export type PolylineProps = {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  lineCap?: string;
  lineJoin?: string;
  tappable?: boolean;
  onPress?: () => void;
};

export function Polyline({ coordinates, strokeColor = '#1F6B45', strokeWidth = 4, onPress }: PolylineProps) {
  const map = useContext(MapCtx);
  const points = useMemo(() => coordinates.map((c) => [c.latitude, c.longitude] as [number, number]), [coordinates]);
  useEffect(() => {
    if (!map || points.length < 2) return;
    const line = L.polyline(points, { color: strokeColor, weight: strokeWidth, lineCap: 'round', interactive: !!onPress }).addTo(map);
    if (onPress) line.on('click', (e) => { L.DomEvent.stopPropagation(e); onPress(); });
    return () => {
      line.remove();
    };
  }, [map, points, strokeColor, strokeWidth, onPress]);
  return null;
}
