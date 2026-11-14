import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { type AttemptState, type LockTimeout, RESET_ATTEMPTS } from './lockPolicy';

export interface LockState extends AttemptState {
  /** PIN тохируулсан (нууц нь secure store-д). */
  enabled: boolean;
  timeoutSec: LockTimeout;
  /** Native — Face ID / хурууны хээ (`expo-local-authentication`). */
  biometric: boolean;
  /** Вэб — бүртгэсэн passkey-ийн credential id (S-102, AC-157); `null` бол passkey-гүй. */
  passkeyId: string | null;
  /** PIN-ийн урт (4–6) — тэр урттай болмогц автоматаар шалгана. */
  pinLength: number;
  /** Одоо түгжигдсэн (санах ойд; persist хийхгүй — хүйтэн эхлэлд `enabled` бол үргэлж түгжинэ). */
  locked: boolean;
  set: (patch: Partial<Omit<LockState, 'set'>>) => void;
}

export const useLockStore = create<LockState>()(
  persist(
    (set) => ({
      enabled: false,
      timeoutSec: 60,
      biometric: false,
      passkeyId: null,
      pinLength: 4,
      locked: false,
      ...RESET_ATTEMPTS,
      set: (patch) => set(patch),
    }),
    {
      name: 'aura.lock',
      storage: createJSONStorage(() => AsyncStorage),
      // Буруу оролдлогын тоо ч хадгалагдана — апп-ыг дахин нээж тоолуурыг тэглэхгүй (AC-52)
      partialize: ({ enabled, timeoutSec, biometric, passkeyId, pinLength, failures, lockedUntil }) => ({
        enabled,
        timeoutSec,
        biometric,
        passkeyId,
        pinLength,
        failures,
        lockedUntil,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.enabled) state.set({ locked: true });
      },
    },
  ),
);
