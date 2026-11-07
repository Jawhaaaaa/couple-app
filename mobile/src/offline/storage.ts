import AsyncStorage from '@react-native-async-storage/async-storage';

/** Түлхүүр-утгын энгийн сан: native — AsyncStorage (вэбийн хувилбар `storage.web.ts` — IndexedDB). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const kvStore: KeyValueStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};
