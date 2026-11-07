import { Platform } from 'react-native';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { deviceInfo } from '@/auth/device';
import { APP_VERSION } from '@/config';
import type { Locale } from '@/stores/prefsStore';

type S = components['schemas'];
export type Me = S['Me'];
export type PolicyDocument = S['PolicyDocument'];
export type VersionInfo = S['VersionInfo'];
export type CityRef = S['CityRef'];
export type RegisterRequest = S['RegisterRequest'];
export type ProfileUpdate = S['ProfileUpdate'];
export type OAuthExchangeResponse = S['OAuthExchangeResponse'];
export type OAuthProvider = 'google' | 'apple';

/**
 * Нэвтрэлтийн (FR-1) REST дуудлагууд — гэрээ `contracts/openapi.yaml`. Алдаа бүр
 * `ApiRequestError` (код нь `errors.json`-ээр мессеж болно).
 */

export function fetchVersion(): Promise<VersionInfo> {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  return unwrap(api.GET('/version', { params: { query: { platform, current: APP_VERSION } } }));
}

export function fetchMe(): Promise<Me> {
  return unwrap(api.GET('/me'));
}

export function fetchCurrentPolicy(locale: Locale): Promise<PolicyDocument> {
  return unwrap(api.GET('/policies/current', { params: { query: { locale } } }));
}

export function login(email: string, password: string) {
  return unwrap(api.POST('/auth/login', { body: { email: email.trim(), password, device: deviceInfo() } }));
}

export function register(body: RegisterRequest) {
  return unwrap(api.POST('/auth/register', { body }));
}

export function verifyEmail(email: string, code: string) {
  return unwrap(api.POST('/auth/verify-email', { body: { email: email.trim(), code } }));
}

export function verifyEmailLink(token: string) {
  return unwrap(api.POST('/auth/verify-email/link', { body: { token } }));
}

export function resendVerification(email: string) {
  return unwrap(api.POST('/auth/verify-email/resend', { body: { email: email.trim() } }));
}

export function requestPasswordReset(email: string) {
  return unwrap(api.POST('/auth/password-reset/request', { body: { email: email.trim() } }));
}

export function confirmPasswordReset(token: string, newPassword: string) {
  return unwrap(api.POST('/auth/password-reset/confirm', { body: { token, newPassword } }));
}

export function reportNotMe(token: string) {
  return unwrap(api.POST('/auth/not-me', { body: { token } }));
}

export function exchangeOAuthCode(code: string): Promise<OAuthExchangeResponse> {
  return unwrap(api.POST('/auth/oauth/exchange', { body: { code, device: deviceInfo() } }));
}

export function linkOAuthAccount(linkToken: string, password: string) {
  return unwrap(api.POST('/auth/oauth/link', { body: { linkToken, password } }));
}

export function acceptPolicy(version: string) {
  return unwrap(api.POST('/me/policy-acceptance', { body: { version } }));
}

export function updateMe(patch: ProfileUpdate): Promise<Me> {
  return unwrap(api.PATCH('/me', { body: patch }));
}

export function searchCities(q: string, locale: Locale): Promise<CityRef[]> {
  return unwrap(api.GET('/geo/cities', { params: { query: { q, locale } } }));
}

/**
 * `PATCH /me`-ийн `version` (optimistic lock). Гэрээний `Me`-д `version` талбар
 * одоогоор алга (T-26-д `PATCH /me` хэрэгжинэ) — тэр болтол 0 илгээнэ.
 */
export function profileVersion(_me: Me): number {
  return 0;
}
