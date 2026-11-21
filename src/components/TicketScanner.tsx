// Lee el QR de una entrada con la cámara. La cámara es una pieza nueva del teléfono: en las versiones que todavía no la traen
// (o en la web), `scannerAvailable` da false y la pantalla ofrece escribir el código a mano.
import React, { useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { colors } from '@/theme';

type CameraMod = {
  CameraView: React.ComponentType<Record<string, unknown>>;
  useCameraPermissions: () => [{ granted: boolean; canAskAgain: boolean } | null, () => Promise<unknown>];
};

function loadCamera(): CameraMod | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-camera') as CameraMod;
    return m?.CameraView && typeof m.useCameraPermissions === 'function' ? m : null;
  } catch {
    return null;
  }
}

const camera = loadCamera();
export const scannerAvailable = camera !== null;

function Live({ cam, onCode, onClose }: { cam: CameraMod; onCode: (text: string) => void; onClose: () => void }) {
  const [perm, ask] = cam.useCameraPermissions();
  const last = useRef<{ t: string; at: number } | null>(null);
  const View_ = cam.CameraView;
  if (!perm) return null;
  if (!perm.granted) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, color: colors.text }}>Para leer las entradas hace falta permitir la cámara.</Text>
        <Button title="Permitir la cámara" onPress={() => { ask(); }} />
        <Button title="Cerrar" variant="ghost" onPress={onClose} />
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: 280, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
        <View_ style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(e: { data?: string }) => {
            const t = e?.data ?? '';
            const now = Date.now();
            if (!t || (last.current && last.current.t === t && now - last.current.at < 3000)) return;   // no repetir el mismo QR enseguida
            last.current = { t, at: now };
            onCode(t);
          }} />
      </View>
      <Button title="Cerrar la cámara" variant="ghost" onPress={onClose} />
    </View>
  );
}

export function TicketScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  if (!camera) return null;
  return <Live cam={camera} onCode={onCode} onClose={onClose} />;
}
