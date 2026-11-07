import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { OAuthProvider } from '@/api/queries/auth';
import { API_BASE } from '@/config';

/** Backend-ийн буцаах хаяг (`OAuthFlowService.NATIVE_CALLBACK`). */
export const NATIVE_OAUTH_CALLBACK = 'aura://oauth-callback';

export interface OAuthOutcome {
  code?: string;
  error?: string;
}

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Backend дамжсан OAuth (DD-AURA-032): native-д системийн auth session-оор
 * `/auth/oauth/{provider}/start?client=native` нээж `aura://oauth-callback?code=…`-ийг
 * барина. Хэрэглэгч цуцалбал `null`.
 */
export async function startOAuth(provider: OAuthProvider): Promise<OAuthOutcome | null> {
  const url = `${API_BASE}/auth/oauth/${provider}/start?client=native`;
  const result = await WebBrowser.openAuthSessionAsync(url, NATIVE_OAUTH_CALLBACK);
  if (result.type !== 'success') return null;
  const { queryParams } = Linking.parse(result.url);
  return { code: param(queryParams?.code as string | string[] | undefined), error: param(queryParams?.error as string | string[] | undefined) };
}
