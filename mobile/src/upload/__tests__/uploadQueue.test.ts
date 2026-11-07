import { createApiClient } from '@/api/client';
import type { KeyValueStore } from '@/offline/storage';
import { useSessionStore } from '@/stores/sessionStore';

import { type BlobStore, memoryBlobStore } from '../blobStoreTypes';
import { sentBytesOf, UploadError, UploadQueue } from '../uploadQueue';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const BASE = 'http://api.test/api/v1';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string) => json(status, { code, message: code, traceId: 't' });
const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => (i % 250) + 1));

const media = (id: string) => ({
  id,
  kind: 'IMAGE',
  status: 'READY',
  mime: 'image/jpeg',
  sizeBytes: 12,
  urls: { original: `https://s3.aura.test/${id}.jpg` },
  urlsExpireAt: '2026-11-07T12:45:00Z',
});

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => {
      map.set(k, v);
    },
    remove: async (k) => {
      map.delete(k);
    },
  };
}

interface Session {
  id: string;
  chunkSize: number;
  totalChunks: number;
  received: Set<number>;
  gone?: boolean;
}

/**
 * Upload протоколын жижиг сервер (`UploadSessionService`-ийн зан төлөв): chunk бүрийг
 * хадгалж, `GET /uploads/{id}`-д `receivedChunks` буцаана. `dropAfter` — тэр тооны PUT-ийн
 * дараа сүлжээ тасарна (fetch reject).
 */
function fakeServer({ chunkSize = 4 }: { chunkSize?: number } = {}) {
  const sessions = new Map<string, Session>();
  const puts: { uploadId: string; index: number; size: number }[] = [];
  const calls: string[] = [];
  const state = { dropAfterPuts: Infinity, offline: false, createStatus: 0, createCode: '', chunkStatus: 0, chunkCode: '', counter: 0 };

  const fetchFn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const path = req.url.replace(BASE, '');
    calls.push(`${req.method} ${path}`);
    if (state.offline) throw new TypeError('Network request failed');
    if (req.method === 'POST' && path === '/uploads') {
      if (state.createStatus) return apiError(state.createStatus, state.createCode);
      const body = await req.json();
      state.counter += 1;
      const id = `0192f3a4-0000-7000-8000-00000000000${state.counter}`;
      const session = { id, chunkSize, totalChunks: Math.ceil(body.totalBytes / chunkSize), received: new Set<number>() };
      sessions.set(id, session);
      return json(201, { id, chunkSize, totalChunks: session.totalChunks, receivedChunks: [] });
    }
    const m = /^\/uploads\/([^/]+)(\/chunks\/(\d+)|\/complete)?$/.exec(path);
    const session = m ? sessions.get(m[1]) : undefined;
    if (!m || !session) return apiError(404, 'NOT_FOUND');
    if (session.gone) return apiError(410, 'NOT_FOUND');
    const view = () => ({ id: session.id, chunkSize, totalChunks: session.totalChunks, receivedChunks: [...session.received] });
    if (req.method === 'GET' && !m[2]) return json(200, view());
    if (req.method === 'PUT' && m[3]) {
      if (puts.length >= state.dropAfterPuts) throw new TypeError('Network request failed');
      if (state.chunkStatus) return apiError(state.chunkStatus, state.chunkCode);
      const index = Number(m[3]);
      const size = (await req.arrayBuffer()).byteLength;
      puts.push({ uploadId: session.id, index, size });
      session.received.add(index);
      return json(200, view());
    }
    if (req.method === 'POST' && m[2] === '/complete') {
      if (session.received.size < session.totalChunks) return apiError(409, 'UPLOAD_INCOMPLETE');
      return json(200, media(`media-${session.id.slice(-1)}`));
    }
    return apiError(404, 'NOT_FOUND');
  }) as unknown as typeof fetch;

  return { sessions, puts, calls, state, client: createApiClient({ baseUrl: BASE, fetch: fetchFn }) };
}

function newQueue(server: ReturnType<typeof fakeServer>, store: KeyValueStore, blobs: BlobStore, onQuotaExceeded = jest.fn()) {
  return new UploadQueue({ store, blobs, client: server.client, onQuotaExceeded });
}

const input = (n: number) => ({ purpose: 'MEMORY' as const, fileName: 'a.jpg', mime: 'image/jpeg', data: new Blob([bytes(n)]) });

beforeEach(() => useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false }));

describe('AC-20 uploadQueue — тасарсан upload үргэлжилнэ', () => {
  it('chunk бүрийг нэг удаа илгээж complete → MediaRef; явц илгээсэн байт / нийт', async () => {
    const server = fakeServer({ chunkSize: 4 });
    const queue = newQueue(server, memoryStore(), memoryBlobStore());
    // Явцын сонсогчийг эхний chunk-ээс өмнө бүртгэхийн тулд эхлээд offline-д нэмнэ
    server.state.offline = true;
    const item = await queue.add(input(10));
    await queue.resume();
    const progress: [number, number][] = [];
    queue.onProgress(item.localId, (sent, total) => progress.push([sent, total]));
    server.state.offline = false;
    const pending = queue.wait(item.localId);
    await queue.resume();
    const result = await pending;

    expect(result.id).toBe('media-1');
    expect(server.puts.map((p) => [p.index, p.size])).toEqual([
      [0, 4],
      [1, 4],
      [2, 2],
    ]);
    expect(progress.at(-1)).toEqual([10, 10]);
    expect(progress.map(([sent]) => sent)).toEqual([...progress.map(([sent]) => sent)].sort((a, b) => a - b));
    expect((await queue.item(item.localId))?.status).toBe('done');
  });

  it('AC-20 серверийн receivedChunks-аас үргэлжилж, хүлээн авсан chunk-ийг ДАХИН илгээхгүй', async () => {
    const server = fakeServer({ chunkSize: 4 });
    const store = memoryStore();
    const blobs = memoryBlobStore();
    const queue = newQueue(server, store, blobs);

    // 2 chunk-ийн дараа сүлжээ тасарна
    server.state.dropAfterPuts = 2;
    const item = await queue.add(input(14));
    await queue.resume();
    const halfway = await queue.item(item.localId);
    expect(halfway?.status).toBe('pending');
    expect(halfway?.received).toEqual([0, 1]);
    expect(server.puts.map((p) => p.index)).toEqual([0, 1]);

    // Сервер өөр замаар (жишээ нь хариу ирэхээс өмнө тасарсан) chunk 2-ыг авсан байна
    server.sessions.get(halfway!.uploadId!)!.received.add(2);

    server.state.dropAfterPuts = Infinity;
    await queue.resume();
    expect(server.calls).toContain(`GET /uploads/${halfway!.uploadId}`);
    expect(server.puts.map((p) => p.index)).toEqual([0, 1, 3]);
    const sentBytes = server.puts.reduce((s, p) => s + p.size, 0);
    expect(sentBytes).toBeLessThan(14);
    expect((await queue.item(item.localId))?.status).toBe('done');
  });

  it('AC-20 апп хаагдаж нээгдэхэд (дарааллыг сангаас дахин үүсгэхэд) үргэлжилнэ', async () => {
    const server = fakeServer({ chunkSize: 4 });
    const store = memoryStore();
    const blobs = memoryBlobStore();

    const first = newQueue(server, store, blobs);
    server.state.dropAfterPuts = 1;
    const item = await first.add(input(12));
    await first.resume();
    expect(server.puts.map((p) => p.index)).toEqual([0]);

    // «Апп хаагдсан» — санах ойн төлөвгүй шинэ дараалал, ижил сан
    server.state.dropAfterPuts = Infinity;
    const second = newQueue(server, store, blobs);
    const restored = await second.items();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ localId: item.localId, received: [0], status: 'pending' });

    const done = second.wait(item.localId);
    await second.resume();
    await expect(done).resolves.toMatchObject({ id: 'media-1' });
    expect(server.puts.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(server.calls.filter((c) => c === 'POST /uploads')).toHaveLength(1);
  });

  it('сүлжээгүй үед төлөв хадгалагдаж, алдаа шидэхгүй', async () => {
    const server = fakeServer();
    const queue = newQueue(server, memoryStore(), memoryBlobStore());
    server.state.offline = true;
    const item = await queue.add(input(5));
    await queue.resume();
    expect(await queue.item(item.localId)).toMatchObject({ status: 'pending', uploadId: null, received: [] });
  });

  it('410 (24 цаг өнгөрсөн) → шинэ session-оос эхэлнэ', async () => {
    const server = fakeServer({ chunkSize: 4 });
    const store = memoryStore();
    const queue = newQueue(server, store, memoryBlobStore());
    server.state.dropAfterPuts = 1;
    const item = await queue.add(input(8));
    await queue.resume();
    const old = (await queue.item(item.localId))!.uploadId!;
    server.sessions.get(old)!.gone = true;

    server.state.dropAfterPuts = Infinity;
    await queue.resume();
    const done = await queue.item(item.localId);
    expect(done?.status).toBe('done');
    expect(done?.uploadId).not.toBe(old);
    expect(server.puts.filter((p) => p.uploadId === done?.uploadId).map((p) => p.index)).toEqual([0, 1]);
  });

  it('415 MEDIA_TYPE_FORBIDDEN → шалтгаантай бүтэлгүйтнэ, дахин оролдохгүй', async () => {
    const server = fakeServer();
    const queue = newQueue(server, memoryStore(), memoryBlobStore());
    server.state.chunkStatus = 415;
    server.state.chunkCode = 'MEDIA_TYPE_FORBIDDEN';
    const item = await queue.add(input(3));
    await expect(queue.wait(item.localId)).rejects.toEqual(expect.objectContaining({ reason: 'MEDIA_TYPE_FORBIDDEN' }));
    await queue.resume();
    expect(server.calls.filter((c) => c.startsWith('PUT'))).toHaveLength(1);
    expect(await queue.item(item.localId)).toMatchObject({ status: 'failed', failure: 'MEDIA_TYPE_FORBIDDEN' });
  });

  it('AC-200 507 STORAGE_QUOTA_EXCEEDED → S-98 (onQuotaExceeded) ба UploadError', async () => {
    const server = fakeServer();
    const onQuota = jest.fn();
    const queue = newQueue(server, memoryStore(), memoryBlobStore(), onQuota);
    server.state.createStatus = 507;
    server.state.createCode = 'STORAGE_QUOTA_EXCEEDED';
    const item = await queue.add(input(3));
    const error = await queue.wait(item.localId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).reason).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(onQuota).toHaveBeenCalledWith(expect.objectContaining({ localId: item.localId, status: 'failed' }));
  });

  it('sentBytesOf — сүүлийн chunk богино', () => {
    expect(sentBytesOf({ received: [0, 2], chunkSize: 4, totalBytes: 10 })).toBe(6);
    expect(sentBytesOf({ received: [], chunkSize: null, totalBytes: 10 })).toBe(0);
  });
});
