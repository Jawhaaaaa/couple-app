import { useEffect } from 'react';

import { useCoupleQuery } from '@/api/queries/pairing';
import { usePrefsStore } from '@/stores/prefsStore';
import { mascotColors, paletteNames } from '@/theme/tokens';

/**
 * Серверийн тохиргоог локал `prefsStore`-д тусгана (харагдах UI-гүй, root layout-д нэг удаа):
 * - хосын сэдэв `Couple.theme` → палитр (`ThemeProvider` дахин ачаалалгүй cross-fade). Хамтрагч саналыг
 *   зөвшөөрөхөд realtime `couple.updated` → `['couple']` дахин татагдана → хоёр апп ≤ 5 с-д (AC-138)
 * - миний сонгосон маскотын өнгө `Couple.myView.mascotColor` (AC-190)
 */
export function SettingsSync() {
  const couple = useCoupleQuery().data;
  const theme = couple?.theme;
  const mascot = couple?.myView?.mascotColor;

  useEffect(() => {
    if (!theme || !paletteNames.includes(theme)) return;
    if (usePrefsStore.getState().palette !== theme) usePrefsStore.getState().set({ palette: theme });
  }, [theme]);

  useEffect(() => {
    if (!mascot || !(mascot in mascotColors)) return;
    const name = mascot as keyof typeof mascotColors;
    if (usePrefsStore.getState().mascotColor !== name) usePrefsStore.getState().set({ mascotColor: name });
  }, [mascot]);

  return null;
}
