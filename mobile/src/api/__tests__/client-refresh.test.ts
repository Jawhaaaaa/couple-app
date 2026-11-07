import { useSessionStore } from '@/stores/sessionStore';

import { createApiClient, unwrap } from '../client';

jest.mock('@/auth/tokenStore', () => {
  let token: string | null = 'rt-1';
  return {
    usesCookieRefresh: false,
    getRefreshToken: jest.fn(async () => token),
    setRefreshToken: jest.fn(async (t: string) => {
      token = t;
    }),
    clearRefreshToken: jest.fn(async () => {
      token = null;
    }),
  };
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const me = { id: '0192f3a4-5b6c-7d8e-9f01-23456789abcd' };

describe('AC-168 access token чимээгүй сэргээх', () => {
  beforeEach(() => {
    useSessionStore.setState({ accessToken: 'old', userId: me.id, signedOut: false });
  });

  it('зэрэг 3 хүсэлт 401 TOKEN_EXPIRED → нэг л refresh, шинэ токеноор давтана', async () => {
    let refreshCalls = 0;
    const seenAuth: string[] = [];
    const fetchFn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      if (req.url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        expect(await req.json()).toEqual({ refreshToken: 'rt-1' });
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { accessToken: 'new', accessExpiresAt: '2026-11-07T12:15:00Z', refreshToken: 'rt-2', user: me });
      }
      const auth = req.headers.get('Authorization') ?? '';
      seenAuth.push(auth);
      if (auth === 'Bearer old') return json(401, { code: 'TOKEN_EXPIRED', message: 'x', traceId: 't' });
      return json(200, { ok: true, method: req.method, body: req.method === 'POST' ? await req.json() : null });
    }) as unknown as typeof fetch;

    const client = createApiClient({ baseUrl: 'http://api.test/api/v1', fetch: fetchFn });
    const results = await Promise.all([
      unwrap(client.GET('/me' as never)),
      unwrap(client.GET('/couple' as never)),
      unwrap(client.POST('/signals' as never, { body: { kind: 'HEART' } } as never)),
    ]);
    expect(refreshCalls).toBe(1);
    expect(useSessionStore.getState().accessToken).toBe('new');
    expect(results[2]).toMatchObject({ method: 'POST', body: { kind: 'HEART' } });
    expect(seenAuth.filter((a) => a === 'Bearer new')).toHaveLength(3);
  });

  it('AC-56 AUTH_SESSION_REVOKED → session цэвэрлэгдэж S-03 руу', async () => {
    const fetchFn = jest.fn(async () =>
      json(401, { code: 'AUTH_SESSION_REVOKED', message: 'x', traceId: 't' }),
    ) as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api.test/api/v1', fetch: fetchFn });
    await expect(unwrap(client.GET('/me' as never))).rejects.toMatchObject({ status: 401, code: 'AUTH_SESSION_REVOKED' });
    expect(useSessionStore.getState()).toMatchObject({ accessToken: null, signedOut: true });
  });

  it('refresh амжилтгүй бол гаргана', async () => {
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/auth/refresh')) return json(401, { code: 'TOKEN_INVALID', message: 'x', traceId: 't' });
      return json(401, { code: 'TOKEN_EXPIRED', message: 'x', traceId: 't' });
    }) as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api.test/api/v1', fetch: fetchFn });
    await expect(unwrap(client.GET('/me' as never))).rejects.toMatchObject({ status: 401 });
    expect(useSessionStore.getState().signedOut).toBe(true);
  });
});
