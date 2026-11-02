// Versión web: el navegador no tiene llavero; la sesión queda en el almacenamiento del navegador
// (Supabase usa localStorage por defecto, así que esta clase casi no se usa en la web).
import AsyncStorage from '@react-native-async-storage/async-storage';

export class LargeSecureStore {
  getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  }
  setItem(key: string, value: string): Promise<void> {
    return AsyncStorage.setItem(key, value);
  }
  removeItem(key: string): Promise<void> {
    return AsyncStorage.removeItem(key);
  }
}
