import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { TokenResponse } from '@/api/client';
import { useSessionStore } from '@/stores/sessionStore';

import { setRefreshToken } from './tokenStore';

/**
 * Нэвтэрсний дараах нийтлэг алхам: refresh-ийг хадгалах (native — secure-store
 * `aura.refresh`, вэб — HttpOnly cookie-г backend өөрөө тавьсан), `me`-г кэшид,
 * access token-ыг санах ойд. `me`-г эхэлж тавина — `SplashGate` дахин ачаалахгүй.
 */
export function useApplyTokens(): (tokens: TokenResponse) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    async (tokens: TokenResponse) => {
      await setRefreshToken(tokens.refreshToken);
      queryClient.setQueryData(['me'], tokens.user);
      useSessionStore.getState().setSession({
        accessToken: tokens.accessToken,
        accessExpiresAt: tokens.accessExpiresAt,
        userId: tokens.user.id,
      });
    },
    [queryClient],
  );
}
