import createClient, { type Middleware } from 'openapi-fetch';

import { clearRefreshToken, getRefreshToken, setRefreshToken, usesCookieRefresh } from '@/auth/tokenStore';
import { API_BASE } from '@/config';
import { useSessionStore } from '@/stores/sessionStore';
import { usePrefsStore } from '@/stores/prefsStore';

import type { components, paths } from './schema';

export type ApiError = components['schemas']['ApiError'];
export type ErrorCode = components['schemas']['ErrorCode'];
export type TokenResponse = components['schemas']['TokenResponse'];

/** Сервер `ApiError` буцаасан үед шидэгдэнэ. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.message ?? `HTTP ${status}`);
  }
  get code(): ErrorCode | undefined {
    return this.body?.code;
  }
}

type FetchFn = typeof fetch;

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: FetchFn;
}

/**
 * Access token дууссан (401 `TOKEN_EXPIRED`) үед нэг л удаа `/auth/refresh`
 * дуудна; зэрэг хүсэлтүүд нэг promise хүлээнэ (AC-168). `AUTH_SESSION_REVOKED`
 * эсвэл refresh амжилтгүй бол session цэвэрлэж S-03 руу (AC-56).
 */
export function createApiClient({ baseUrl = API_BASE, fetch: fetchFn = globalThis.fetch }: ApiClientOptions = {}) {
  let refreshing: Promise<string | null> | null = null;

  async function doRefresh(): Promise<string | null> {
    const refreshToken = usesCookieRefresh ? null : await getRefreshToken();
    if (!usesCookieRefresh && !refreshToken) return null;
    const res = await fetchFn(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(usesCookieRefresh ? { 'X-Aura-Client': 'web' } : {}),
      },
      body: JSON.stringify(usesCookieRefresh ? {} : { refreshToken }),
    });
    if (!res.ok) return null;
    const tokens = (await res.json()) as TokenResponse;
    await setRefreshToken(tokens.refreshToken);
    useSessionStore.getState().setSession({
      accessToken: tokens.accessToken,
      accessExpiresAt: tokens.accessExpiresAt,
      userId: tokens.user.id,
    });
    return tokens.accessToken;
  }

  async function signOut() {
    await clearRefreshToken();
    useSessionStore.getState().clear();
  }

  /** Зэрэг дуудлагад нэг refresh. */
  function refreshOnce(): Promise<string | null> {
    if (!refreshing) {
      refreshing = doRefresh()
        .catch(() => null)
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  /** Body-г дахин илгээхийн тулд анхны хүсэлтийн хуулбар (id → Request). */
  const originals = new Map<string, Request>();

  const auth: Middleware = {
    async onRequest({ request, id }) {
      const token = useSessionStore.getState().accessToken;
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      request.headers.set('Accept-Language', usePrefsStore.getState().locale);
      originals.set(id, request.clone());
      return request;
    },
    async onResponse({ response, id }) {
      const original = originals.get(id);
      originals.delete(id);
      if (response.status !== 401 || !original) return response;
      const body = (await response.clone().json().catch(() => null)) as ApiError | null;
      if (body?.code === 'AUTH_SESSION_REVOKED') {
        await signOut();
        return response;
      }
      if (body?.code !== 'TOKEN_EXPIRED') return response;
      const token = await refreshOnce();
      if (!token) {
        await signOut();
        return response;
      }
      original.headers.set('Authorization', `Bearer ${token}`);
      return fetchFn(original);
    },
  };

  const client = createClient<paths>({ baseUrl, fetch: (req: Request) => fetchFn(req), credentials: 'include' });
  client.use(auth);
  return Object.assign(client, { refreshOnce, signOut });
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** `{ data, error, response }`-ийг өгөгдөл эсвэл `ApiRequestError` болгоно. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (!response.ok || error !== undefined) throw new ApiRequestError(response.status, (error as ApiError) ?? null);
  return data as T;
}

export const api = createApiClient();
