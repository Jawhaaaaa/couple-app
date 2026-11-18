import { createApiClient } from '@/api/client';
import { useSessionStore } from '@/stores/sessionStore';

import { simpleUpload } from '../simpleUpload';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const BASE = 'http://api.test/api/v1';
const UPLOAD_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const media = {
  id: '0192f3a4-0000-7000-8000-0000000000aa',
  kind: 'IMAGE',
  status: 'READY',
  mime: 'image/jpeg',
  sizeBytes: 12,
  urls: { original: 'https://s3.aura.test/a.jpg' },
  urlsExpireAt: '2026-11-07T12:45:00Z',
};

interface Seen {
  method: string;
  path: string;
  contentType: string | null;
  body: Uint8Array | unknown;
}

function server({ chunkSize, received = [] as number[] }: { chunkSize: number; received?: number[] }) {
  const seen: Seen[] = [];
  const fetchFn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const path = req.url.replace(BASE, '');
    const contentType = req.headers.get('Content-Type');
    if (req.method === 'POST' && path === '/uploads') {
      const body = await req.json();
      seen.push({ method: req.method, path, contentType, body });
      return json(201, { id: UPLOAD_ID, chunkSize, totalChunks: Math.ceil(body.totalBytes / chunkSize), receivedChunks: received });
    }
    if (req.method === 'PUT') {
      seen.push({ method: req.method, path, contentType, body: new Uint8Array(await req.arrayBuffer()) });
      return json(200, { id: UPLOAD_ID, chunkSize, totalChunks: 3, receivedChunks: [] });
    }
    if (req.method === 'POST' && path === `/uploads/${UPLOAD_ID}/complete`) {
      seen.push({ method: req.method, path, contentType, body: null });
      return json(200, media);
    }
    return json(404, { code: 'NOT_FOUND', message: 'x', traceId: 't' });
  }) as unknown as typeof fetch;
  return { seen, client: createApiClient({ baseUrl: BASE, fetch: fetchFn }) };
}

const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i + 1));

beforeEach(() => useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false }));

describe('simpleUpload — гэрээний chunk протокол', () => {
  it('session → chunk бүр яг chunkSize (сүүлийнх нь үлдэгдэл) octet-stream → complete → MediaRef', async () => {
    const { seen, client } = server({ chunkSize: 5 });
    const progress: number[] = [];
    const result = await simpleUpload(
      { purpose: 'AVATAR', fileName: 'avatar.jpg', mime: 'image/jpeg', data: new Blob([bytes(12)]), onProgress: (f) => progress.push(f) },
      client,
    );

    expect(result).toEqual(media);
    expect(seen[0]).toMatchObject({
      method: 'POST',
      path: '/uploads',
      body: { purpose: 'AVATAR', fileName: 'avatar.jpg', mime: 'image/jpeg', totalBytes: 12 },
    });
    const chunks = seen.filter((s) => s.method === 'PUT');
    expect(chunks.map((c) => c.path)).toEqual([0, 1, 2].map((i) => `/uploads/${UPLOAD_ID}/chunks/${i}`));
    expect(chunks.map((c) => (c.body as Uint8Array).length)).toEqual([5, 5, 2]);
    expect(chunks.every((c) => c.contentType === 'application/octet-stream')).toBe(true);
    expect(Array.from(chunks[2].body as Uint8Array)).toEqual([11, 12]);
    expect(seen.at(-1)).toMatchObject({ method: 'POST', path: `/uploads/${UPLOAD_ID}/complete` });
    expect(progress.at(-1)).toBe(1);
  });

  it('сервер аль хэдийн авсан chunk-ийг дахин илгээхгүй', async () => {
    const { seen, client } = server({ chunkSize: 4, received: [0, 1] });
    await simpleUpload({ purpose: 'AVATAR', fileName: 'a.jpg', mime: 'image/jpeg', data: new Blob([bytes(10)]) }, client);
    expect(seen.filter((s) => s.method === 'PUT').map((c) => c.path)).toEqual([`/uploads/${UPLOAD_ID}/chunks/2`]);
  });

  it('chunk алдаатай бол complete дуудахгүй, ApiRequestError шидэнэ', async () => {
    const fetchFn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      if (req.method === 'POST' && req.url.endsWith('/uploads')) return json(201, { id: UPLOAD_ID, chunkSize: 5, totalChunks: 1, receivedChunks: [] });
      if (req.method === 'PUT') return json(409, { code: 'CHUNK_SIZE_MISMATCH', message: 'x', traceId: 't' });
      throw new Error(`гэнэтийн ${req.method} ${req.url}`);
    }) as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: BASE, fetch: fetchFn });
    await expect(
      simpleUpload({ purpose: 'AVATAR', fileName: 'a.jpg', mime: 'image/jpeg', data: new Blob([bytes(3)]) }, client),
    ).rejects.toMatchObject({ status: 409, code: 'CHUNK_SIZE_MISMATCH' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
