import { createWebBlobStore, type KeyValueBackend } from '../blobStore.web';

/** IndexedDB-ийн орлуулга; `rejectBlobs` бол Safari Private / WebKit ephemeral шиг `Blob`-ийг татгалзана. */
function fakeIdb(rejectBlobs: boolean): KeyValueBackend & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (key) => map.get(key),
    set: async (key, value) => {
      // idb-keyval нь transaction.error-ыг шиддэг — WebKit-д энэ нь null
      if (rejectBlobs && value instanceof Blob) throw null;
      map.set(key, value);
    },
    del: async (key) => {
      map.delete(key);
    },
  };
}

const bytes = new Uint8Array([1, 2, 3, 250]);

async function readBack(blob: Blob | null) {
  expect(blob).not.toBeNull();
  return { type: blob!.type, bytes: Array.from(new Uint8Array(await blob!.arrayBuffer())) };
}

describe('blobStore.web (AC-20)', () => {
  it('Blob-ийг шууд хадгалж буцаана', async () => {
    const kv = fakeIdb(false);
    const store = createWebBlobStore(kv);
    await store.put('a', new Blob([bytes], { type: 'image/jpeg' }));
    expect(kv.map.get('aura.upload.blob.a')).toBeInstanceOf(Blob);
    expect(await readBack(await store.get('a'))).toEqual({ type: 'image/jpeg', bytes: [1, 2, 3, 250] });
  });

  it('Blob хадгалагдахгүй хөтөчид (Safari Private) байтаар хадгалж, ижил Blob буцаана', async () => {
    const kv = fakeIdb(true);
    const store = createWebBlobStore(kv);
    await store.put('a', new Blob([bytes], { type: 'image/jpeg' }));
    expect(kv.map.get('aura.upload.blob.a')).not.toBeInstanceOf(Blob);
    expect(await readBack(await store.get('a'))).toEqual({ type: 'image/jpeg', bytes: [1, 2, 3, 250] });
  });

  it('хадгалалт бүрмөсөн бүтэлгүйтвэл null биш, харагдах алдаа шиднэ', async () => {
    const store = createWebBlobStore({
      get: async () => undefined,
      set: async () => {
        throw null;
      },
      del: async () => {},
    });
    await expect(store.put('a', new Blob([bytes]))).rejects.toThrow('Файлыг төхөөрөмжид түр хадгалж чадсангүй');
  });

  it('байхгүй түлхүүр → null, устгасны дараа null', async () => {
    const store = createWebBlobStore(fakeIdb(true));
    expect(await store.get('missing')).toBeNull();
    await store.put('a', new Blob([bytes]));
    await store.remove('a');
    expect(await store.get('a')).toBeNull();
  });
});
