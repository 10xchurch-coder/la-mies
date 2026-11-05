// Guarda la sesión de la app cifrada.
// expo-secure-store (Keychain en iPhone, Keystore en Android) solo admite valores chicos, así que
// la clave AES va al Keychain/Keystore y el dato cifrado va a AsyncStorage. Sin la clave, el dato no sirve.
// La lógica está en secureStoreCore.ts (probada en tests/secureStore.test.ts).
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createLargeSecureStore } from './secureStoreCore';

export class LargeSecureStore {
  private store = createLargeSecureStore({
    secure: {
      getItemAsync: (k) => SecureStore.getItemAsync(k),
      setItemAsync: (k, v) => SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
      deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
    },
    plain: {
      getItem: (k) => AsyncStorage.getItem(k),
      setItem: (k, v) => AsyncStorage.setItem(k, v),
      removeItem: (k) => AsyncStorage.removeItem(k),
    },
    random: (n) => Crypto.getRandomValues(new Uint8Array(n)),
  });

  getItem(key: string): Promise<string | null> {
    return this.store.getItem(key);
  }

  setItem(key: string, value: string): Promise<void> {
    return this.store.setItem(key, value);
  }

  removeItem(key: string): Promise<void> {
    return this.store.removeItem(key);
  }
}
