import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * S-02 танилцуулгыг үзсэн эсэх (FR-16.1, AC-133) — «локал туг» (LLD §5): анх суулгахад нэвтрэхээс өмнө
 * гардаг тул төхөөрөмж дээр persist; нэвтэрсний дараа серверийн `Preferences.introSeen`-тэй синк
 * (`usePreferencesSync`). `hydrated` — AsyncStorage-аас сэргэж дуустал хаалга шийдэхгүй (буцаж ирсэн
 * хэрэглэгчид танилцуулга дахин гарахгүй).
 */
export interface OnboardingState {
  introSeen: boolean;
  hydrated: boolean;
  markIntroSeen: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      introSeen: false,
      hydrated: false,
      markIntroSeen: () => set({ introSeen: true }),
    }),
    {
      name: 'aura.onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ introSeen }) => ({ introSeen }),
      onRehydrateStorage: () => () => useOnboardingStore.setState({ hydrated: true }),
    },
  ),
);
