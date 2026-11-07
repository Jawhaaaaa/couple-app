import { del, get, set } from 'idb-keyval';

import type { KeyValueStore } from './storage';

/** Вэб (PWA): IndexedDB (`idb-keyval`) — localStorage-оос том, service worker-тэй хуваалцана (FR-19.5). */
export const kvStore: KeyValueStore = {
  get: async (key) => (await get<string>(key)) ?? null,
  set: (key, value) => set(key, value),
  remove: (key) => del(key),
};

export type { KeyValueStore };
