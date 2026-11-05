import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as aesjs from 'aes-js';
import { createLargeSecureStore, type SecureDeps } from '../src/lib/secureStoreCore';

// Teléfono simulado: dos "discos" (Keychain y AsyncStorage) que tardan un poco en responder,
// para que las operaciones se puedan mezclar como pasa en la realidad.
function fakePhone(delayMs = 3) {
  const secure = new Map<string, string>();
  const plain = new Map<string, string>();
  const wait = () => new Promise((r) => setTimeout(r, Math.random() * delayMs));
  const deps: SecureDeps = {
    secure: {
      getItemAsync: async (k) => { await wait(); return secure.get(k) ?? null; },
      setItemAsync: async (k, v) => { await wait(); secure.set(k, v); },
      deleteItemAsync: async (k) => { await wait(); secure.delete(k); },
    },
    plain: {
      getItem: async (k) => { await wait(); return plain.get(k) ?? null; },
      setItem: async (k, v) => { await wait(); plain.set(k, v); },
      removeItem: async (k) => { await wait(); plain.delete(k); },
    },
    random: (n) => new Uint8Array(randomBytes(n)),
  };
  return { deps, secure, plain };
}

const KEY = 'sb-test-auth-token';
const session = (n: number) => JSON.stringify({ access_token: `token-${n}`, refresh_token: `r-${n}`, expires_at: 1700000000 + n });

test('guarda y lee la sesión (y otra instancia la lee del disco)', async () => {
  const phone = fakePhone();
  const a = createLargeSecureStore(phone.deps);
  await a.setItem(KEY, session(1));
  assert.equal(await a.getItem(KEY), session(1));
  const b = createLargeSecureStore(phone.deps); // como si se reabriera la app
  assert.equal(await b.getItem(KEY), session(1));
  assert.ok(phone.plain.get(KEY)?.startsWith('v2:'));
  assert.ok(!phone.plain.get(KEY)?.includes('token-1'), 'el dato queda cifrado');
});

test('lecturas en medio de escrituras nunca devuelven basura (el error del 5 de noviembre)', async () => {
  const phone = fakePhone(5);
  const store = createLargeSecureStore(phone.deps);
  await store.setItem(KEY, session(0));
  const ops: Promise<unknown>[] = [];
  const reads: (string | null)[] = [];
  for (let i = 1; i <= 40; i++) {
    ops.push(store.setItem(KEY, session(i)));
    ops.push(store.getItem(KEY).then((v) => { reads.push(v); }));
  }
  await Promise.all(ops);
  for (const r of reads) {
    assert.ok(r !== null, 'nunca vuelve vacío');
    assert.doesNotThrow(() => JSON.parse(r as string), 'siempre es una sesión válida');
  }
  // Y al reabrir la app, el disco tiene la última.
  const reopened = createLargeSecureStore(phone.deps);
  assert.equal(await reopened.getItem(KEY), session(40));
});

test('lee el formato viejo (una clave por guardado) y lo pasa al nuevo', async () => {
  const phone = fakePhone();
  const oldKey = new Uint8Array(randomBytes(32));
  const cipher = new aesjs.ModeOfOperation.ctr(oldKey, new aesjs.Counter(1));
  phone.secure.set(KEY, aesjs.utils.hex.fromBytes(oldKey));
  phone.plain.set(KEY, aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(session(7)))));
  const store = createLargeSecureStore(phone.deps);
  assert.equal(await store.getItem(KEY), session(7));
  await store.setItem(KEY, session(8));
  assert.ok(phone.plain.get(KEY)?.startsWith('v2:'));
  assert.equal(phone.secure.has(KEY), false, 'la clave vieja se borra');
  assert.equal(await createLargeSecureStore(phone.deps).getItem(KEY), session(8));
});

test('cerrar sesión borra el dato', async () => {
  const phone = fakePhone();
  const store = createLargeSecureStore(phone.deps);
  await store.setItem(KEY, session(1));
  await store.removeItem(KEY);
  assert.equal(await store.getItem(KEY), null);
  assert.equal(await createLargeSecureStore(phone.deps).getItem(KEY), null);
});
