import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

const KEY = 'trackzio.deviceId';
let pending: Promise<string> | null = null;

/**
 * Anonymous identity that owns this install's wishlist on the server. Generated once and kept in AsyncStorage
 * (survives closing the app; lost on uninstall or "clear data"). If storage fails we fall back to a per-session id so
 * the app still works, just without surviving a restart. The promise is memoised so concurrent first calls share one id.
 */
export function getDeviceId(): Promise<string> {
  pending ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved) return saved;
      const id = randomUUID();
      await AsyncStorage.setItem(KEY, id);
      return id;
    } catch {
      return randomUUID();
    }
  })();
  return pending;
}

/** Test hook: forget the memoised id, as a fresh app launch would. */
export function resetDeviceIdCache() {
  pending = null;
}
