import { del, get, set } from 'idb-keyval';

import type { BlobStore } from './blobStoreTypes';

const PREFIX = 'aura.upload.blob.';

/** Вэб (PWA): сонгосон файлыг IndexedDB-д — хуудас дахин ачаалсны дараа ч upload үргэлжилнэ (AC-20). */
export const blobStore: BlobStore = {
  put: (key, blob) => set(PREFIX + key, blob),
  get: async (key) => (await get<Blob>(PREFIX + key)) ?? null,
  remove: (key) => del(PREFIX + key),
};
