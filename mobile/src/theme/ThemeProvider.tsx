import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, useColorScheme, View } from 'react-native';

import { usePrefsStore } from '@/stores/prefsStore';

import { type ColorTokens, colorsFor, motion, type PaletteName, type ThemeMode } from './tokens';

export interface ThemeValue {
  mode: ThemeMode;
  palette: PaletteName;
  colors: ColorTokens;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Системийн/хэрэглэгчийн сонголтоос бараан эсвэл цайвар горимыг гаргана. */
export function resolveMode(preference: 'dark' | 'light' | 'system', system: string | null | undefined): ThemeMode {
  if (preference === 'system') return system === 'light' ? 'light' : 'dark';
  return preference;
}

/**
 * Theme-ийг дахин ачаалалгүй солино: хуучин дэвсгэрийн өнгөтэй давхарга 300 ms-д
 * уусаж шинэ палитр гарч ирнэ (AC-DS-03). Давхарга хүрэлцээг хаахгүй.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = usePrefsStore((s) => s.theme);
  const palette = usePrefsStore((s) => s.palette);
  const system = useColorScheme();
  const mode = resolveMode(preference, system);
  const colors = colorsFor(palette, mode);

  const [fadeFrom, setFadeFrom] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const previousBg = useRef(colors.bg);

  useEffect(() => {
    if (previousBg.current === colors.bg) return;
    setFadeFrom(previousBg.current);
    previousBg.current = colors.bg;
    opacity.setValue(1);
    Animated.timing(opacity, {
      toValue: 0,
      duration: motion.themeCrossFade,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => setFadeFrom(null));
  }, [colors.bg, opacity]);

  const value = useMemo(() => ({ mode, palette, colors }), [mode, palette, colors]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[styles.root, { backgroundColor: colors.bg }]} testID="theme-root" data-theme={mode}>
        {children}
        {fadeFrom ? (
          <Animated.View
            pointerEvents="none"
            testID="theme-crossfade"
            style={[StyleSheet.absoluteFill, { backgroundColor: fadeFrom, opacity }]}
          />
        ) : null}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme нь ThemeProvider дотор л ажиллана');
  return value;
}

export function useColors(): ColorTokens {
  return useTheme().colors;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
