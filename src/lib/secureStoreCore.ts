// Guarda la sesión de la app cifrada (lógica pura, sin módulos de Expo, para poder probarla).
//
// Cómo funciona:
// - La clave AES de 256 bits se crea UNA vez y queda en el Keychain/Keystore del teléfono.
// - Cada vez que se guarda, se usa un número aleatorio nuevo (IV) y se guarda junto al dato cifrado
//   en AsyncStorage: "v2:<iv>:<cifrado>". Así la clave nunca cambia entre una lectura y una escritura.
// - Todas las operaciones van en fila (una por vez) y el último valor queda en memoria,
//   así una lectura nunca puede mezclar una clave nueva con un dato viejo.
// - Lee también el formato viejo (una clave distinta por cada guardado) y lo pasa al nuevo.
import * as aesjs from 'aes-js';

export type SecureDeps = {
  secure: {
    getItemAsync: (k: string) => Promise<string | null>;
    setItemAsync: (k: string, v: string) => Promise<void>;
    deleteItemAsync: (k: string) => Promise<void>;
  };
  plain: {
    getItem: (k: string) => Promise<string | null>;
    setItem: (k: string, v: string) => Promise<void>;
    removeItem: (k: string) => Promise<void>;
  };
  random: (n: number) => Uint8Array;
};

const hex = (b: Uint8Array) => aesjs.utils.hex.fromBytes(b);
const unhex = (s: string) => aesjs.utils.hex.toBytes(s);

export function createLargeSecureStore(deps: SecureDeps) {
  const cache = new Map<string, string | null>();
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => undefined);
    return p;
  };
  const keyName = (key: string) => `${key}.k2`;

  async function keyFor(key: string, create: boolean): Promise<Uint8Array | null> {
    const stored = await deps.secure.getItemAsync(keyName(key));
    if (stored) return unhex(stored);
    if (!create) return null;
    const k = deps.random(32);
    await deps.secure.setItemAsync(keyName(key), hex(k));
    return k;
  }

  async function readFromDisk(key: string): Promise<string | null> {
    const stored = await deps.plain.getItem(key);
    if (!stored) return null;
    if (stored.startsWith('v2:')) {
      const [, ivHex, dataHex] = stored.split(':');
      const k = await keyFor(key, false);
      if (!k || !ivHex || !dataHex) return null;
      const cipher = new aesjs.ModeOfOperation.ctr(k, new aesjs.Counter(unhex(ivHex)));
      return aesjs.utils.utf8.fromBytes(cipher.decrypt(unhex(dataHex)));
    }
    // Formato viejo: la clave estaba guardada con el mismo nombre y el contador empezaba en 1.
    const oldKey = await deps.secure.getItemAsync(key);
    if (!oldKey) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(unhex(oldKey), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(unhex(stored)));
  }

  async function writeToDisk(key: string, value: string): Promise<void> {
    const k = (await keyFor(key, true)) as Uint8Array;
    const iv = deps.random(16);
    const cipher = new aesjs.ModeOfOperation.ctr(k, new aesjs.Counter(iv));
    const data = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await deps.plain.setItem(key, `v2:${hex(iv)}:${hex(data)}`);
    // La clave del formato viejo ya no hace falta.
    await deps.secure.deleteItemAsync(key).catch(() => undefined);
  }

  return {
    getItem(key: string): Promise<string | null> {
      return run(async () => {
        if (cache.has(key)) return cache.get(key) ?? null;
        try {
          const value = await readFromDisk(key);
          if (value !== null) cache.set(key, value);
          return value;
        } catch {
          return null;
        }
      });
    },
    setItem(key: string, value: string): Promise<void> {
      return run(async () => {
        cache.set(key, value);
        await writeToDisk(key, value);
      });
    },
    removeItem(key: string): Promise<void> {
      return run(async () => {
        cache.delete(key);
        await deps.plain.removeItem(key);
        await deps.secure.deleteItemAsync(key).catch(() => undefined);
      });
    },
  };
}
