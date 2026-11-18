import { useSessionStore } from '@/stores/sessionStore';

import { createApiClient } from '../client';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => 'rt-1'),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const tokens = { accessToken: 'a-1', accessExpiresAt: '2026-11-07T12:15:00Z', refreshToken: 'rt-2', user: { id: 'u-1' } };

describe('S-01 сесс сэргээх (AC-168)', () => {
  beforeEach(() => useSessionStore.setState({ accessToken: null, userId: null, signedOut: false }));

  it('хадгалсан refresh хүчинтэй → restored, access token санах ойд', async () => {
    const client = createApiClient({ baseUrl: 'http://api.test', fetch: (async () => json(200, tokens)) as typeof fetch });
    await expect(client.restoreSession()).resolves.toBe('restored');
    expect(useSessionStore.getState().accessToken).toBe('a-1');
  });

  it('refresh хүчингүй (401) → none, S-03', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async () => json(401, { code: 'TOKEN_EXPIRED', message: 'x', traceId: 't' })) as typeof fetch,
    });
    await expect(client.restoreSession()).resolves.toBe('none');
  });

  it('сервер хүрэхгүй эсвэл 5xx → unreachable (кэштэй бол offline-д үргэлжилнэ)', async () => {
    const offline = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async () => {
        throw new TypeError('Network request failed');
      }) as typeof fetch,
    });
    await expect(offline.restoreSession()).resolves.toBe('unreachable');
    const down = createApiClient({ baseUrl: 'http://api.test', fetch: (async () => json(503, {})) as typeof fetch });
    await expect(down.restoreSession()).resolves.toBe('unreachable');
    expect(useSessionStore.getState().signedOut).toBe(false);
  });

  it('access token аль хэдийн байвал refresh хийхгүй', async () => {
    useSessionStore.setState({ accessToken: 'live' });
    const fetchFn = jest.fn();
    const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchFn as unknown as typeof fetch });
    await expect(client.restoreSession()).resolves.toBe('restored');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('вэб client-ийн толгой (X-Aura-Client) native-д илгээгдэхгүй', async () => {
    const seen: (string | null)[] = [];
    useSessionStore.setState({ accessToken: 'live' });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async (req: Request) => {
        seen.push(req.headers.get('X-Aura-Client'));
        return json(200, {});
      }) as unknown as typeof fetch,
    });
    await client.GET('/version');
    expect(seen).toEqual([null]);
  });
});
