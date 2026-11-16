import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

import { kvStore } from './storage';

/**
 * Кэшээс нээх (NFR-03, AC-16, AC-156): нүүр, timeline, чат г.м.-ийг persist хийнэ.
 * Нууц үг, токен хэзээ ч кэшид орохгүй (`sessionStore` нь persist хийгддэггүй).
 */
export const PERSISTED_ROOT_KEYS = ['me', 'couple', 'dashboard', 'messages', 'memories', 'plans', 'notifications'] as const;
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && (PERSISTED_ROOT_KEYS as readonly string[]).includes(queryKey[0]);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: PERSIST_MAX_AGE,
      staleTime: 30_000,
      // Offline үед кэшээс харуулж, сүлжээ сэргэхэд дахин татна
      networkMode: 'offlineFirst',
      retry: 2,
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({
    storage: { getItem: kvStore.get, setItem: kvStore.set, removeItem: kvStore.remove },
    key: 'aura.query-cache.v1',
    throttleTime: 1000,
  }),
  maxAge: PERSIST_MAX_AGE,
  dehydrateOptions: {
    shouldDehydrateQuery: (q) => q.state.status === 'success' && shouldPersistQuery(q.queryKey),
  },
};

/**
 * Persist-ээс сэргээж дууссаны дараа: сэргээсэн бүх query нь өмнөх сессийнх тул шууд харуулсан
 * хэвээр (кэшээс нээх, AC-156) ар талд дахин татна. Үгүй бол `staleTime`-ийн дотор «шинэ» гэж
 * тооцогдоод татагдахгүй, апп хаалттай/reload хийгдэж байх үеийн өөрчлөлт (WS үйл явдал алдагдсан)
 * 30 с хуучин харагддаг байв — хамтрагчийн 🌙 (AC-123), үзсэн зүрхний карт (AC-18).
 * Сэргээх үед query татагддаггүй (`isRestoring`) тул энэ үед кэшид байгаа бүхэн сэргээгдсэн.
 */
export function refreshRestoredQueries(client: QueryClient): Promise<void> {
  return client.invalidateQueries();
}
