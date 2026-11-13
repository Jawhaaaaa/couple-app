// Aura k6-ийн нийтлэг хэсэг (T-93, AC-150): хаяг, детерминист тестийн хэрэглэгч, бүртгэл, нэвтрэлт, STOMP.
import http from 'k6/http';
import { check, fail } from 'k6';

/** UUIDv4 (clientId, clientMessageId) — гадаад jslib-гүй, сүлжээгүй орчинд ажиллана. */
export function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
export const API = `${BASE_URL}/api/v1`;
export const WS_URL = (__ENV.WS_URL || `${BASE_URL.replace(/^http/, 'ws')}/ws`);
// Spring-ийн WebSocket origin шалгалт — AURA_CORS_ALLOWED_ORIGINS-д байх ёстой
export const ORIGIN = __ENV.ORIGIN || 'http://localhost:8090';
export const COUPLES = Number(__ENV.COUPLES || 1000);
export const PREFIX = (__ENV.SEED_PREFIX || 'load').toLowerCase();
// Тестийн хэрэглэгчийн нууц үг — зөвхөн DEV/e2e орчны seed, нууц биш
export const PASSWORD = __ENV.SEED_PASSWORD || 'Load-Test-Nuur-2026';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Accept-Language': 'mn' };

/** Хос i-ийн хоёр хэрэглэгчийн имэйл (детерминист — seed ба ачааллын скрипт ижил тоолно). */
export function emailOf(i, side) {
  return `${PREFIX}-${i}-${side}@load.aura.test`;
}

export function authHeaders(token, extra = {}) {
  return { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` }, ...extra };
}

export function post(path, body, params = {}) {
  return http.post(`${API}${path}`, body === undefined ? null : JSON.stringify(body), {
    ...params,
    headers: { ...JSON_HEADERS, ...(params.headers || {}) },
  });
}

/** Backend хүрч байгаа эсэх (`/me` → 401 хүлээгдэнэ). */
export function assertReachable() {
  const res = http.get(`${API}/me`, { tags: { name: 'reachability' }, responseCallback: http.expectedStatuses(401) });
  if (res.status !== 401) fail(`${BASE_URL} хүрэхгүй байна (GET /api/v1/me → ${res.status})`);
}

/** Бодлогын хувилбар: `/policies/current` (байхгүй бол POLICY_VERSION, анхдагч aura.policy.version). */
export function policyVersion() {
  assertReachable();
  const res = http.get(`${API}/policies/current`, { tags: { name: 'seed' }, responseCallback: http.expectedStatuses(200, 404) });
  return res.status === 200 ? res.json('version') : (__ENV.POLICY_VERSION || '2026-11-07');
}

/** Хэрэглэгч бүртгэж, `e2e` profile-ийн `/test/mail/last` кодоор баталгаажуулна. Access token буцаана. */
export function registerVerified(email, displayName, policy) {
  const tags = { tags: { name: 'seed' } };
  const reg = post('/auth/register', {
    email,
    password: PASSWORD,
    displayName,
    birthDate: '1996-04-12',
    locale: 'mn',
    timezone: 'Asia/Ulaanbaatar',
    acceptedPolicyVersion: policy,
  }, tags);
  if (reg.status !== 202) return null;
  const mail = http.get(`${API}/test/mail/last?to=${encodeURIComponent(email)}`, tags);
  if (mail.status !== 200) {
    fail(`GET /test/mail/last → ${mail.status}: backend-ийг SPRING_PROFILES_ACTIVE=dev,e2e-ээр асаа`);
  }
  const code = mail.json('code');
  if (!code) return null;
  const ver = post('/auth/verify-email', { email, code }, tags);
  return ver.status === 200 ? ver.json('accessToken') : null;
}

export function login(email, tags = { name: 'POST /auth/login' }, responseCallback = undefined) {
  const params = responseCallback ? { tags, responseCallback } : { tags };
  const res = post('/auth/login', { email, password: PASSWORD, device: { name: 'k6', platform: 'WEB' } }, params);
  return res.status === 200 ? res.json('accessToken') : null;
}

/** Хоёр хэрэглэгчийг хос болгоно: A урилга → B нэгдэх → A батлах (e2e/support/couple.ts-тэй ижил). */
export function link(tokenA, tokenB) {
  const tags = { tags: { name: 'seed' } };
  const inv = http.post(`${API}/invites`, null, authHeaders(tokenA, tags));
  if (inv.status !== 200 && inv.status !== 201) return false;
  const pairing = http.post(`${API}/pairings`, JSON.stringify({ code: inv.json('code') }), authHeaders(tokenB, tags));
  if (pairing.status !== 200 && pairing.status !== 201) return false;
  const conf = http.post(`${API}/pairings/${pairing.json('id')}/confirm`, null, authHeaders(tokenA, tags));
  return check(conf, { 'хос холбогдов': (r) => r.status === 200 || r.status === 204 });
}

// --- STOMP 1.2 (SockJS-гүй, DD-AURA-008) ---------------------------------------------------------
const NUL = '\u0000';

export function stompFrame(command, headers = {}, body = '') {
  const lines = Object.entries(headers).map(([k, v]) => `${k}:${v}`);
  return `${command}\n${lines.join('\n')}\n\n${body}${NUL}`;
}

/** Ирсэн өгөгдлөөс STOMP командуудыг ялгана (heartbeat — хоосон мөр — алгасна). */
export function stompCommands(data) {
  return String(data)
    .split(NUL)
    .map((f) => f.replace(/^\n+/, ''))
    .filter((f) => f.length > 0)
    .map((f) => f.slice(0, f.indexOf('\n') === -1 ? f.length : f.indexOf('\n')));
}
