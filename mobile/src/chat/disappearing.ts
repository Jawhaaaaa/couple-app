import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { components } from '@/api/schema';

/** Гэрээний `ChatSettings.disappearSeconds`: 0 = унтраастай, 1 мин, 1 цаг, 1 өдөр (FR-6.9). */
export type DisappearSeconds = components['schemas']['ChatSettings']['disappearSeconds'];

export const DISAPPEAR_OPTIONS: readonly DisappearSeconds[] = [0, 60, 3600, 86400];

/** i18n түлхүүр: `chat.disappearing.option.<key>`. */
export function disappearOptionKey(seconds: DisappearSeconds): 'off' | 'minute' | 'hour' | 'day' {
  switch (seconds) {
    case 60:
      return 'minute';
    case 3600:
      return 'hour';
    case 86400:
      return 'day';
    default:
      return 'off';
  }
}

/** Мессеж харагдах үлдсэн секунд (уншаагүй бол `null` — тоолуур эхлээгүй, AC-92). */
export function remainingSeconds(expiresAt: string | null | undefined, now: number): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}

interface ChatPrefsState {
  /** Хосын анхдагч хугацаа — сүүлд энэ төхөөрөмжөөс хадгалсан утга (сервер нь эх үнэн). */
  disappearSeconds: DisappearSeconds;
  setDisappearSeconds: (value: DisappearSeconds) => void;
}

export const useChatPrefsStore = create<ChatPrefsState>()(
  persist(
    (set) => ({
      disappearSeconds: 0,
      setDisappearSeconds: (disappearSeconds) => set({ disappearSeconds }),
    }),
    {
      name: 'aura.chat',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ disappearSeconds }) => ({ disappearSeconds }),
    },
  ),
);
