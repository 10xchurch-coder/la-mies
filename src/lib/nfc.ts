// Chips NFC (credenciales, pulseras o tarjetas): se graba la entrada en el chip y en la puerta se apoya el teléfono para leerla.
// Solo funciona en la app instalada desde la tienda que ya trae el lector (compilación nueva); en la web y en versiones viejas no aparece.
import { Platform, TurboModuleRegistry } from 'react-native';

/** ¿Esta app trae el lector de chips? */
export const nfcBuilt: boolean = Platform.OS !== 'web' && !!TurboModuleRegistry.get('NfcManager');

type Lib = typeof import('react-native-nfc-manager');
let lib: Lib | null = null;
let started = false;

async function mod(): Promise<Lib> {
  if (!nfcBuilt) throw new Error('Este teléfono o esta versión de la app no lee chips.');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!lib) lib = require('react-native-nfc-manager') as Lib;
  if (!started) { await lib.default.start(); started = true; }
  return lib;
}

/** 'ok' = se puede usar; 'off' = el teléfono tiene el NFC apagado; 'none' = el teléfono no tiene NFC. */
export async function nfcState(): Promise<'ok' | 'off' | 'none'> {
  if (!nfcBuilt) return 'none';
  try {
    const m = await mod();
    if (!(await m.default.isSupported())) return 'none';
    if (Platform.OS === 'android' && !(await m.default.isEnabled())) return 'off';
    return 'ok';
  } catch { return 'none'; }
}

const friendly = (e: unknown): Error => {
  const msg = String((e as { message?: string } | null)?.message ?? e ?? '');
  if (/cancel/i.test(msg) || /UserCancel/i.test(String((e as { constructor?: { name?: string } } | null)?.constructor?.name ?? ''))) return new Error('cancelado');
  return new Error('No se pudo leer el chip. Apoyalo otra vez contra la parte de arriba del teléfono y no lo muevas.');
};

/** Lee el texto grabado en un chip. Null si el chip está vacío. Tira 'cancelado' si la persona cerró el lector. */
export async function readChip(message = 'Acercá la credencial a la parte de arriba del teléfono'): Promise<string | null> {
  const m = await mod();
  const { default: Nfc, NfcTech, Ndef } = m;
  try {
    await Nfc.requestTechnology(NfcTech.Ndef, { alertMessage: message });
    const tag = await Nfc.getTag();
    for (const rec of tag?.ndefMessage ?? []) {
      try {
        const text = Ndef.text.decodePayload(Uint8Array.from(rec.payload as number[]));
        if (text) return text;
      } catch { /* no es un registro de texto: se prueba el siguiente */ }
    }
    return null;
  } catch (e) {
    throw friendly(e);
  } finally {
    Nfc.cancelTechnologyRequest().catch(() => undefined);
  }
}

/** Graba un texto en el chip (pisa lo que tenía). */
export async function writeChip(text: string): Promise<void> {
  const m = await mod();
  const { default: Nfc, NfcTech, Ndef } = m;
  try {
    await Nfc.requestTechnology(NfcTech.Ndef, { alertMessage: 'Acercá el chip a la parte de arriba del teléfono' });
    const bytes = Ndef.encodeMessage([Ndef.textRecord(text)]);
    if (!bytes) throw new Error('vacío');
    await Nfc.ndefHandler.writeNdefMessage(bytes);
    if (Platform.OS === 'ios') await Nfc.setAlertMessageIOS('Listo, chip grabado');
  } catch (e) {
    const f = friendly(e);
    throw f.message === 'cancelado' ? f : new Error('No se pudo grabar el chip. Puede estar bloqueado o no ser del tipo NTAG. Probá con otro.');
  } finally {
    Nfc.cancelTechnologyRequest().catch(() => undefined);
  }
}

/** Deja de esperar un chip (para cuando se cierra la pantalla que estaba leyendo sin parar). */
export function cancelChip(): void {
  if (!nfcBuilt || !lib) return;
  lib.default.cancelTechnologyRequest().catch(() => undefined);
}
