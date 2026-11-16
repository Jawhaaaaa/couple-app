import type { BrowserContext } from '@playwright/test';

import { startOAuthIdp, type IdpUser, type OAuthIdpMock } from '../mocks/oauthIdp';
import { API_BASE } from './env';

/**
 * Google OAuth-ийн E2E (AC-06, GAP-18). Backend нь `aura.oauth.google.issuer`-ийг ажиллаж
 * эхлэхдээ уншдаг тул stub IdP тогтмол порт дээр байх ёстой — портыг backend-ийн өөрийнх нь
 * `start` redirect-ээс уншина (тохиргоог хоёр газар давхардуулахгүй).
 *
 * Backend контейнер дотор ажилладаг тул issuer нь `http://host.docker.internal:<порт>`; хост дээрх
 * хөтөч тэр нэрийг шийддэггүй (Windows hosts / CI runner) — `start`-ийн 302-ийн `Location`-ыг
 * `localhost` болгож буцаана. Playwright redirect-ийн дараагийн хүсэлтийг барьдаггүй тул эхний
 * хүсэлтийг (`start`) өөрийг нь барина.
 *
 * Backend-ийн орчин: `AURA_GOOGLE_CLIENT_ID` (дурын), `AURA_GOOGLE_CLIENT_SECRET=e2e-google-secret`
 * (эсвэл `E2E_GOOGLE_CLIENT_SECRET`), `AURA_GOOGLE_ISSUER=http://host.docker.internal:<порт>`,
 * `AURA_GOOGLE_ID_TOKEN_ALG=HS256`; web export-д `EXPO_PUBLIC_OAUTH_GOOGLE=true`.
 */
export const GOOGLE_CLIENT_SECRET = process.env.E2E_GOOGLE_CLIENT_SECRET ?? 'e2e-google-secret';

const START = `${API_BASE}/auth/oauth/google/start`;

/** Хост дээрээс хүрэх хаяг (`host.docker.internal` → `localhost`). */
export function hostReachable(url: string): string {
  const u = new URL(url);
  if (u.hostname === 'host.docker.internal') u.hostname = 'localhost';
  return u.toString();
}

/** Backend-ийн тохируулсан issuer (`start`-ийн redirect-ээс). Google идэвхгүй бол тодорхой алдаа. */
export async function configuredIssuer(): Promise<URL> {
  const res = await fetch(`${START}?client=web`, { redirect: 'manual' });
  const location = res.headers.get('location');
  if (res.status !== 302 || !location) {
    throw new Error(
      `GET /auth/oauth/google/start → ${res.status}: backend-д AURA_GOOGLE_CLIENT_ID/SECRET, AURA_GOOGLE_ISSUER (stub IdP), AURA_GOOGLE_ID_TOKEN_ALG=HS256 тохируулаагүй`,
    );
  }
  const issuer = new URL(location);
  if (/google\.com$/.test(issuer.hostname)) {
    throw new Error(`AURA_GOOGLE_ISSUER нь бодит Google (${issuer.origin}) — E2E-д stub IdP-ийн хаяг тавина (GAP-18)`);
  }
  return issuer;
}

/** Backend-ийн issuer-ийн порт дээр stub IdP асаана. */
export async function startConfiguredIdp(): Promise<OAuthIdpMock> {
  const issuer = await configuredIssuer();
  return startOAuthIdp({ port: Number(issuer.port || 80), clientSecret: GOOGLE_CLIENT_SECRET });
}

/** Хөтчийн `start` хүсэлтийг барьж IdP руу чиглэсэн redirect-ийг хост дээрээс хүрэх хаяг болгоно. */
export async function routeOAuthStart(context: BrowserContext) {
  await context.route(`${START}**`, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers().location;
    if (!location) return route.fulfill({ response });
    // WebKit нь 3xx-ээр fulfill хийхийг зөвшөөрдөггүй — state cookie-г (`Set-Cookie`) хэвээр нь
    // өгч, IdP руу хуудсаар шилжүүлнэ (хэрэглэгчийн хувьд ижил: нэг навигаци).
    const target = JSON.stringify(hostReachable(location));
    const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
    const cookie = response.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie');
    if (cookie) headers['Set-Cookie'] = cookie.value;
    await route.fulfill({ status: 200, headers, body: `<!doctype html><script>location.replace(${target})</script>` });
  });
}

export interface OAuthTokens {
  accessToken: string;
  isNewUser: boolean;
  user: { id: string; email: string };
}

/**
 * UI-гүй OAuth нэвтрэлт (бэлтгэлд): start → IdP authorize → callback (state cookie-той) →
 * `POST /auth/oauth/exchange`. UI-ийн урсгалыг `oauth.spec.ts` шалгана.
 */
export async function oauthLoginApi(idp: OAuthIdpMock, user: IdpUser): Promise<OAuthTokens> {
  idp.setUser(user);
  const start = await fetch(`${START}?client=web`, { redirect: 'manual' });
  const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
  const authorize = await fetch(hostReachable(start.headers.get('location') ?? ''), { redirect: 'manual' });
  const callback = await fetch(authorize.headers.get('location') ?? '', { redirect: 'manual', headers: { Cookie: cookie } });
  const code = new URL(callback.headers.get('location') ?? '').searchParams.get('code');
  if (!code) throw new Error(`OAuth callback → ${callback.headers.get('location')}`);
  const res = await fetch(`${API_BASE}/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, device: { name: 'E2E API', platform: 'WEB' } }),
  });
  if (!res.ok) throw new Error(`POST /auth/oauth/exchange → ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { isNewUser: boolean; tokens?: { accessToken: string; user: { id: string; email: string } } };
  if (!body.tokens) throw new Error('OAuth exchange: токен алга (linkRequired?)');
  return { accessToken: body.tokens.accessToken, isNewUser: body.isNewUser, user: body.tokens.user };
}
