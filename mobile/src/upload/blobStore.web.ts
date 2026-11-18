import { del, get, set } from 'idb-keyval';

import type { BlobStore } from './blobStoreTypes';

const PREFIX = 'aura.upload.blob.';

/** `Blob`-ийг IndexedDB-д шууд хадгалж чадаагүй үеийн хэлбэр. */
interface StoredBytes {
  kind: 'aura-bytes';
  type: string;
  bytes: ArrayBuffer;
}

export interface KeyValueBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

function isStoredBytes(value: unknown): value is StoredBytes {
  return typeof value === 'object' && value !== null && (value as StoredBytes).kind === 'aura-bytes';
}

/**
 * Upload-ын эх файлын сан (вэб). Эхлээд `Blob`-ийг шууд хадгална (том видеог санах ойд
 * уншихгүй). Safari-гийн Private горим ба WebKit-ийн ephemeral session `Blob`-ийг IndexedDB-д
 * хадгалж чаддаггүй — transaction `error: null`-оор унадаг тул upload чимээгүй гацдаг байсан
 * (CI run 43790105841, WebKit). Тэр үед `ArrayBuffer` + MIME болгон хадгална.
 */
export function createWebBlobStore(kv: KeyValueBackend): BlobStore {
  return {
    put: async (key, blob) => {
      try {
        await kv.set(PREFIX + key, blob);
        return;
      } catch {
        // Blob хадгалагдсангүй — байтаар нь дахин оролдоно (доор)
      }
      try {
        await kv.set(PREFIX + key, { kind: 'aura-bytes', type: blob.type, bytes: await blob.arrayBuffer() } satisfies StoredBytes);
      } catch (error) {
        // idb-keyval нь transaction.error-ыг (null байж болно) шиднэ — UI-д харагдах алдаа болгоно
        throw error instanceof Error ? error : new Error('Файлыг төхөөрөмжид түр хадгалж чадсангүй');
      }
    },
    get: async (key) => {
      const value = await kv.get(PREFIX + key);
      if (value == null) return null;
      if (isStoredBytes(value)) return new Blob([value.bytes], { type: value.type });
      return value as Blob;
    },
    remove: (key) => kv.del(PREFIX + key),
  };
}

/** Вэб (PWA): сонгосон файлыг IndexedDB-д — хуудас дахин ачаалсны дараа ч upload үргэлжилнэ (AC-20). */
export const blobStore: BlobStore = createWebBlobStore({ get, set, del });
