import { create } from 'zustand';

/**
 * Нэвтрэлтийн төлөв. Access token зөвхөн санах ойд (DD-AURA-006) — persist хийхгүй;
 * refresh нь native-д secure-store, вэбэд HttpOnly cookie.
 */
export interface SessionState {
  accessToken: string | null;
  accessExpiresAt: string | null;
  userId: string | null;
  /** `AUTH_SESSION_REVOKED` эсвэл гарах үед true — S-03 руу шилжүүлнэ. */
  signedOut: boolean;
  setSession: (s: { accessToken: string; accessExpiresAt: string; userId: string }) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  accessToken: null,
  accessExpiresAt: null,
  userId: null,
  signedOut: false,
  setSession: ({ accessToken, accessExpiresAt, userId }) =>
    set({ accessToken, accessExpiresAt, userId, signedOut: false }),
  clear: () => set({ accessToken: null, accessExpiresAt: null, userId: null, signedOut: true }),
}));
