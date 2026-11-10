// Certificado de bautismo. Todo el tamaño se calcula a partir del ancho (w), así se ve igual en el teléfono y al guardarlo grande.
import React from 'react';
import { Image, Platform, Text, View } from 'react-native';

export type Cert = { full_name: string; baptized_on: string; church_name: string; city: string | null; pastor: string; number: string };

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });
const GOLD = '#B08A2E';
const INK = '#1F2A44';
const VERSE = 'Porque somos sepultados juntamente con él para muerte por el bautismo, a fin de que como Cristo resucitó de los muertos por la gloria del Padre, así también nosotros andemos en vida nueva.';

export function BaptismCertificate({ cert, w }: { cert: Cert; w: number }) {
  const u = w / 1000; // una unidad = 1/1000 del ancho
  const h = w * 0.7071;
  const place = [cert.church_name, cert.city].filter(Boolean).join(', ');
  return (
    <View style={{ width: w, height: h, backgroundColor: '#FFFDF6', padding: 18 * u }}>
      <View style={{ flex: 1, borderWidth: 5 * u, borderColor: GOLD, padding: 8 * u }}>
        <View style={{ flex: 1, borderWidth: 1.5 * u, borderColor: GOLD, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 26 * u, paddingHorizontal: 60 * u }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: SERIF, fontSize: 17 * u, letterSpacing: 5 * u, color: GOLD, fontWeight: '700' }}>{cert.church_name.toUpperCase()}</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 62 * u, color: INK, fontWeight: '700', marginTop: 8 * u }}>Certificado de Bautismo</Text>
            <View style={{ width: 150 * u, height: 3 * u, backgroundColor: GOLD, marginTop: 10 * u }} />
          </View>
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Text style={{ fontFamily: SERIF, fontSize: 20 * u, color: INK, fontStyle: 'italic' }}>Se certifica que</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 52 * u, color: INK, fontWeight: '700', marginVertical: 6 * u, textAlign: 'center' }} numberOfLines={2} adjustsFontSizeToFit>{cert.full_name}</Text>
            <View style={{ width: '70%', height: 1.5 * u, backgroundColor: GOLD }} />
            <Text style={{ fontFamily: SERIF, fontSize: 20 * u, color: INK, textAlign: 'center', lineHeight: 30 * u, marginTop: 12 * u }}>
              habiendo confiado en el Señor Jesucristo como su Salvador, fue bautizado(a) por inmersión en agua, en el nombre del Padre, del Hijo y del Espíritu Santo, el {longDate(cert.baptized_on)}, en {place}.
            </Text>
            <Text style={{ fontFamily: SERIF, fontSize: 15 * u, color: '#4A5470', textAlign: 'center', lineHeight: 22 * u, marginTop: 12 * u, fontStyle: 'italic' }}>
              “{VERSE}” — Romanos 6:4
            </Text>
          </View>
          <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ width: 230 * u }}>
              <Text style={{ fontFamily: SERIF, fontSize: 13 * u, color: '#4A5470' }}>N.º {cert.number}</Text>
            </View>
            <View style={{ alignItems: 'center', width: 330 * u }}>
              <Image source={require('../../assets/firma-pastor.png')} style={{ width: 150 * u, height: 98 * u, marginBottom: -6 * u }} resizeMode="contain" />
              <View style={{ width: '100%', height: 1.5 * u, backgroundColor: INK }} />
              <Text style={{ fontFamily: SERIF, fontSize: 17 * u, color: INK, fontWeight: '700', marginTop: 4 * u }}>{cert.pastor}</Text>
              <Text style={{ fontFamily: SERIF, fontSize: 12 * u, color: '#4A5470' }}>{cert.church_name}</Text>
            </View>
            <View style={{ width: 230 * u }} />
          </View>
        </View>
      </View>
    </View>
  );
}
