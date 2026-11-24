// Certificado para imprimir (bautismo o membresía), con el nombre y el logo de la iglesia.
// Todo el tamaño se calcula a partir del ancho (w): se ve igual en la pantalla, impreso o guardado como imagen.
// La firma va a mano: queda la línea con el nombre del pastor abajo.
import React from 'react';
import { Image, Platform, Text, View } from 'react-native';
import type { CertData, CertKind } from '@/lib/personasApi';
import { tx, txList } from '@/lib/i18n';

const MONTHS = txList(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']);
export function longDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return tx('{d} de {month} de {y}', { d, month: MONTHS[m - 1], y });
}

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });
const GOLD = '#B08A2E';
const INK = '#1F2A44';
const SOFT = '#4A5470';

// Los versículos, completos, en Reina-Valera 1960.
const TEXTS: Record<CertKind, { title: string; verse: string; ref: string }> = {
  bautismo: {
    get title() { return tx('Certificado de Bautismo'); },
    verse: 'Porque somos sepultados juntamente con él para muerte por el bautismo, a fin de que como Cristo resucitó de los muertos por la gloria del Padre, así también nosotros andemos en vida nueva.',
    ref: 'Romanos 6:4',
  },
  miembro: {
    get title() { return tx('Certificado de Membresía'); },
    verse: 'Así que ya no sois extranjeros ni advenedizos, sino conciudadanos de los santos, y miembros de la familia de Dios,',
    ref: 'Efesios 2:19',
  },
};

export function certTitle(kind: CertKind): string {
  return TEXTS[kind].title;
}

export function PrintCertificate({ cert, kind, w, logo }: { cert: CertData; kind: CertKind; w: number; logo?: string | null }) {
  const u = w / 1000; // una unidad = 1/1000 del ancho
  const h = w * 0.7071; // hoja A4 acostada
  const t = TEXTS[kind];
  const place = [cert.church, cert.city].filter(Boolean).join(', ');
  const body = kind === 'bautismo'
    ? tx('habiendo confiado en el Señor Jesucristo como su Salvador, fue bautizado(a) por inmersión en agua, en el nombre del Padre, del Hijo y del Espíritu Santo, el {longDay}, en {place}.', { longDay: longDay(cert.on_date), place })
    : tx('fue recibido(a) como miembro de {place}, el {longDay}.', { place, longDay: longDay(cert.on_date) });
  return (
    <View style={{ width: w, height: h, backgroundColor: '#FFFDF6', padding: 18 * u }}>
      <View style={{ flex: 1, borderWidth: 5 * u, borderColor: GOLD, padding: 8 * u }}>
        <View style={{ flex: 1, borderWidth: 1.5 * u, borderColor: GOLD, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 24 * u, paddingHorizontal: 60 * u }}>
          <View style={{ alignItems: 'center' }}>
            {logo ? <Image source={{ uri: logo }} style={{ width: 70 * u, height: 70 * u, marginBottom: 6 * u }} resizeMode="contain" /> : null}
            <Text style={{ fontFamily: SERIF, fontSize: 17 * u, letterSpacing: 5 * u, color: GOLD, fontWeight: '700', textAlign: 'center' }}>{cert.church.toUpperCase()}</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 56 * u, color: INK, fontWeight: '700', marginTop: 6 * u, textAlign: 'center' }}>{t.title}</Text>
            <View style={{ width: 150 * u, height: 3 * u, backgroundColor: GOLD, marginTop: 8 * u }} />
          </View>
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Text style={{ fontFamily: SERIF, fontSize: 20 * u, color: INK, fontStyle: 'italic' }}>{tx('Se certifica que')}</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 50 * u, color: INK, fontWeight: '700', marginVertical: 6 * u, textAlign: 'center' }} numberOfLines={2} adjustsFontSizeToFit>{cert.name}</Text>
            <View style={{ width: '70%', height: 1.5 * u, backgroundColor: GOLD }} />
            <Text style={{ fontFamily: SERIF, fontSize: 20 * u, color: INK, textAlign: 'center', lineHeight: 30 * u, marginTop: 12 * u }}>{body}</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 15 * u, color: SOFT, textAlign: 'center', lineHeight: 22 * u, marginTop: 12 * u, fontStyle: 'italic' }}>
              “{t.verse}” — {t.ref}
            </Text>
          </View>
          <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ width: 230 * u }}>
              <Text style={{ fontFamily: SERIF, fontSize: 13 * u, color: SOFT }}>N.º {cert.number}</Text>
            </View>
            <View style={{ alignItems: 'center', width: 330 * u }}>
              <View style={{ height: 60 * u }} />
              <View style={{ width: '100%', height: 1.5 * u, backgroundColor: INK }} />
              <Text style={{ fontFamily: SERIF, fontSize: 17 * u, color: INK, fontWeight: '700', marginTop: 4 * u }}>{cert.pastor}</Text>
              <Text style={{ fontFamily: SERIF, fontSize: 12 * u, color: SOFT }}>{cert.church}</Text>
            </View>
            <View style={{ width: 230 * u }} />
          </View>
        </View>
      </View>
    </View>
  );
}
