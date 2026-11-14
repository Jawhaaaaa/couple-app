import { expect, type Page } from '@playwright/test';

import { API_BASE } from './env';
import { uniqueEmail } from './seed';

/**
 * Баталгаажсан тестийн хэрэглэгч (FR-1.1–1.2): `POST /auth/register` → `GET /test/mail/last`
 * (e2e profile) кодоор `POST /auth/verify-email`. UI-ийн бүртгэлийн урсгалыг auth.spec.ts
 * шалгадаг тул бусад spec энд API-аар бэлтгэнэ.
 */
export const PASSWORD = 'Talbai-Nuur-2026';
export const ZONE = 'Asia/Ulaanbaatar';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  accessToken: string;
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`${what} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function policyVersion(): Promise<string> {
  return (await json<{ version: string }>(await fetch(`${API_BASE}/policies/current`), 'GET /policies/current')).version;
}

export async function createVerifiedUser(displayName: string, prefix = 'e2e'): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const register = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      displayName,
      birthDate: '1998-05-14',
      locale: 'mn',
      timezone: ZONE,
      acceptedPolicyVersion: await policyVersion(),
    }),
  });
  await json(register, 'POST /auth/register');
  const mail = await json<{ code: string | null }>(
    await fetch(`${API_BASE}/test/mail/last?to=${encodeURIComponent(email)}`),
    'GET /test/mail/last',
  );
  if (!mail.code) throw new Error(`${email}: баталгаажуулах код алга`);
  const tokens = await json<{ accessToken: string; user: { id: string } }>(
    await fetch(`${API_BASE}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: mail.code }),
    }),
    'POST /auth/verify-email',
  );
  return { id: tokens.user.id, email, password: PASSWORD, displayName, accessToken: tokens.accessToken };
}

/**
 * Дахин нэвтэрч шинэ access token авна (серверийн цагийг 15 минутаас их урагшлуулсны дараа хуучин
 * token хүчингүй болдог).
 */
export async function reloginApi(user: TestUser): Promise<TestUser> {
  const tokens = await json<{ accessToken: string }>(
    await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password, device: { name: 'E2E API', platform: 'WEB' } }),
    }),
    'POST /auth/login',
  );
  user.accessToken = tokens.accessToken;
  return user;
}

/** Хэрэглэгчийн нэрээр API дуудах (UI-гүй бэлтгэл ба шалгалт). */
export async function apiAs(user: TestUser, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      'Accept-Language': 'mn',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiJson<T>(user: TestUser, method: string, path: string, body?: unknown): Promise<T> {
  return json<T>(await apiAs(user, method, path, body), `${method} ${path}`);
}

/** S-03-аар нэвтэрнэ; хаалга (index) хосгүй бол S-13, хостой бол S-20 руу. */
export async function signInUi(page: Page, user: TestUser) {
  await page.goto('/login');
  await expect(page.getByTestId('screen-S-03')).toBeVisible();
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('screen-S-03')).toHaveCount(0);
}
