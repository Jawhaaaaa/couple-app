/** Upload-ын эх файлын сан (native — `blobStore.ts`, вэб — `blobStore.web.ts`). */
export interface BlobStore {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  remove(key: string): Promise<void>;
}

/** Санах ойн сан — тухайн ажиллалтад л (тест ба native-ийн URI-гүй `Blob`). */
export function memoryBlobStore(): BlobStore {
  const map = new Map<string, Blob>();
  return {
    put: async (key, blob) => {
      map.set(key, blob);
    },
    get: async (key) => map.get(key) ?? null,
    remove: async (key) => {
      map.delete(key);
    },
  };
}
