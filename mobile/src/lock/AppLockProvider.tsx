import * as ScreenCapture from 'expo-screen-capture';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Platform, StyleSheet, View } from 'react-native';

import { LockScreen } from '@/components/lock/LockScreen';
import { Mascot } from '@/components/Mascot';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';

import { shouldLock } from './lockPolicy';
import { useLockStore } from './lockStore';

/**
 * Апп түгжээ (FR-14.1, DD-AURA-033, AC-124): арын төлөвт `timeoutSec`-ээс удаан байсны дараа урд
 * гарахад (вэбэд `visibilitychange` — RN Web-ийн AppState) S-14-ийг бүх агуулгын дээр харуулна.
 * App switcher-ийн preview: iOS — `enableAppSwitcherProtectionAsync`, бусад — апп идэвхгүй үед
 * агуулгыг хаах бүрхэвч (вэбэд баталгаагүй — GAP-20).
 */
export function AppLockProvider({ children, onPasskey }: { children: ReactNode; onPasskey?: () => Promise<boolean> }) {
  const colors = useColors();
  const enabled = useLockStore((s) => s.enabled);
  const locked = useLockStore((s) => s.locked);
  const signedIn = useSessionStore((s) => !!s.accessToken);
  const [covered, setCovered] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      const lock = useLockStore.getState();
      if (state === 'active') {
        setCovered(false);
        if (shouldLock({ enabled: lock.enabled, timeoutSec: lock.timeoutSec, backgroundAt: backgroundAt.current ?? Date.now(), now: Date.now() })) {
          lock.set({ locked: true });
        }
        backgroundAt.current = null;
      } else {
        if (backgroundAt.current === null) backgroundAt.current = Date.now();
        if (lock.enabled) setCovered(true);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (enabled) void ScreenCapture.enableAppSwitcherProtectionAsync(0.9).catch(() => undefined);
    else void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => undefined);
  }, [enabled]);

  const showLock = enabled && locked && signedIn;
  return (
    <View style={styles.fill}>
      {children}
      {covered && !showLock ? (
        <View style={[styles.cover, { backgroundColor: colors.bg }]} testID="lock-privacy-cover">
          <Mascot size={96} pose="idle" />
        </View>
      ) : null}
      {showLock ? <LockScreen onPasskey={onPasskey} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 999 },
});
