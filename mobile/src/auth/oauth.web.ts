import type { OAuthProvider } from '@/api/queries/auth';
import { API_BASE } from '@/config';

import type { OAuthOutcome } from './oauth';

export type { OAuthOutcome } from './oauth';
export const NATIVE_OAUTH_CALLBACK = 'aura://oauth-callback';

/**
 * Вэб: бүтэн хуудсаар `/auth/oauth/{provider}/start?client=web` руу шилжинэ
 * (state-ийн nonce cookie хөтөчид тогтоно); backend `/oauth-callback?code=…` руу буцаана.
 */
export async function startOAuth(provider: OAuthProvider): Promise<OAuthOutcome | null> {
  window.location.assign(`${API_BASE}/auth/oauth/${provider}/start?client=web`);
  return null;
}
