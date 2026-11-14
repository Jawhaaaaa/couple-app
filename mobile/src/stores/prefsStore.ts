import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MascotColorName, PaletteName, ThemePreference } from '@/theme/tokens';

/** Огнооны формат (FR-18.2): 2026.11.07 / 07/11/2026 / 11/07/2026. */
export type DateFormat = 'YMD_DOT' | 'DMY_SLASH' | 'MDY_SLASH';
/** Апп доторх анимацийн тохиргоо (§3.4 зарчим 4). */
export type AnimationSetting = 'ALL' | 'REDUCED' | 'OFF';
export type Locale = 'mn' | 'en';

export interface PrefsState {
  theme: ThemePreference;
  palette: PaletteName;
  locale: Locale;
  dateFormat: DateFormat;
  animation: AnimationSetting;
  haptics: boolean;
  sound: boolean;
  /** Маскотын бүсний өнгө (FR-18.7, AC-190) — серверийн `Preferences.mascotColor`/`Couple.myView`-ээс. */
  mascotColor: MascotColorName;
  set: (patch: Partial<Omit<PrefsState, 'set'>>) => void;
}

/** Анхдагч утга: LLD §3 `user_preference` (DARK, YMD_DOT, ALL, haptics асаалттай, дуу унтраастай). */
export const defaultPrefs = {
  theme: 'dark',
  palette: 'CORAL',
  locale: 'mn',
  dateFormat: 'YMD_DOT',
  animation: 'ALL',
  haptics: true,
  sound: false,
  mascotColor: 'coral',
} as const satisfies Omit<PrefsState, 'set'>;

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...defaultPrefs,
      set: (patch) => set(patch),
    }),
    {
      name: 'aura.prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
);
