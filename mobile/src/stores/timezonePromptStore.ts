import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { rememberZone } from '@/auth/timezonePrompt';

/** Цагийн бүсийн асуултад хариулсан бүсүүд (AC-64, LLD §4.4) — persist. */
export interface TimezonePromptState {
  answeredZones: string[];
  markAnswered: (zone: string) => void;
}

export const useTimezonePromptStore = create<TimezonePromptState>()(
  persist(
    (set) => ({
      answeredZones: [],
      markAnswered: (zone) => set((s) => ({ answeredZones: rememberZone(s.answeredZones, zone) })),
    }),
    {
      name: 'aura.timezone-prompt',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ answeredZones }) => ({ answeredZones }),
    },
  ),
);
