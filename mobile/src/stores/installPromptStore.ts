import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * PWA-ийн саналууд хэзээ гарсан (LLD §4.4, FR-19.2, FR-19.3) — persist:
 *  - S-100 суулгах заавар хаагдсан агшин (7 хоног дахин гарахгүй, AC-153);
 *  - S-101 мэдэгдлийн тайлбарыг нэвтэрсний дараа автоматаар нэг удаа санал болгосон эсэх.
 */
export interface InstallPromptState {
  dismissedAt: number | null;
  pushOffered: boolean;
  dismiss: (now?: number) => void;
  markPushOffered: () => void;
}

export const useInstallPromptStore = create<InstallPromptState>()(
  persist(
    (set) => ({
      dismissedAt: null,
      pushOffered: false,
      dismiss: (now = Date.now()) => set({ dismissedAt: now }),
      markPushOffered: () => set({ pushOffered: true }),
    }),
    {
      name: 'aura.install-prompt',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ dismissedAt, pushOffered }) => ({ dismissedAt, pushOffered }),
    },
  ),
);
