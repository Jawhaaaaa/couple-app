import * as LocalAuthentication from 'expo-local-authentication';
import { Delete, Fingerprint } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { Mascot } from '@/components/Mascot';
import { useNow } from '@/hooks/useNow';
import { useT } from '@/i18n';
import { PIN_MAX, registerFailure, RESET_ATTEMPTS, waitRemainingMs } from '@/lock/lockPolicy';
import { readPinSecret, writePinSecret } from '@/lock/lockSecret';
import { useLockStore } from '@/lock/lockStore';
import { verifyPin } from '@/lock/pinHash';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/** PIN-ийг шалгаж түгжээг тайлна; 10 буруу бол түгжээг арилгаж нууц үгээр нэвтрүүлнэ (AC-52). */
export async function submitPin(pin: string, now: number = Date.now()): Promise<'ok' | 'wrong' | 'wait' | 'signedOut'> {
  const store = useLockStore.getState();
  if (waitRemainingMs(store, now) > 0) return 'wait';
  const secret = await readPinSecret();
  if (secret && verifyPin(pin, secret)) {
    store.set({ locked: false, ...RESET_ATTEMPTS });
    return 'ok';
  }
  const { state, verdict } = registerFailure(store, now);
  store.set(state);
  if (verdict.kind === 'signOut') {
    await writePinSecret(null);
    store.set({ enabled: false, biometric: false, locked: false, ...RESET_ATTEMPTS });
    await api.signOut();
    return 'signedOut';
  }
  return verdict.kind === 'wait' ? 'wait' : 'wrong';
}

export async function unlockWithBiometric(prompt: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  if (!hardware || !enrolled) return false;
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: true, cancelLabel: undefined });
  if (result.success) useLockStore.getState().set({ locked: false, ...RESET_ATTEMPTS });
  return result.success;
}

/**
 * S-14 Түгжээ (FR-14.1): PIN гар (4–6 орон), биометр товч (native), буруу оролдлогын хүлээлт
 * (5 → 1 мин), 10 буруу → нууц үгээр нэвтрэх. Түгжигдсэн үед апп-ын агуулгыг бүхэлд нь хаана.
 */
export function LockScreen({ onPasskey }: { onPasskey?: () => Promise<boolean> }) {
  const t = useT();
  const colors = useColors();
  const now = useNow(1000);
  const failures = useLockStore((s) => s.failures);
  const lockedUntil = useLockStore((s) => s.lockedUntil);
  const biometric = useLockStore((s) => s.biometric);
  const pinLength = useLockStore((s) => s.pinLength);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wait = Math.ceil(waitRemainingMs({ failures, lockedUntil }, now) / 1000);

  const press = async (key: (typeof KEYS)[number]) => {
    if (busy || wait > 0 || key === '') return;
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, PIN_MAX);
    setPin(next);
    if (next.length < pinLength) return;
    setBusy(true);
    const result = await submitPin(next);
    setBusy(false);
    setPin('');
    setMessage(result === 'wrong' ? t('lock.wrong') : null);
  };

  const bio = async () => {
    const ok = onPasskey ? await onPasskey() : await unlockWithBiometric(t('lock.biometricPrompt'));
    if (!ok) setMessage(t('lock.biometricFailed'));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="screen-S-14" accessibilityViewIsModal>
      <Mascot size={88} pose="wave" />
      <AppText variant="h2" accessibilityRole="header">
        {t('lock.title')}
      </AppText>
      <View style={styles.dots} accessibilityLabel={t('lock.entered', { count: pin.length })} testID="lock-dots">
        {Array.from({ length: pinLength }, (_, i) => (
          <View key={i} style={[styles.dot, { borderColor: colors.primary, backgroundColor: i < pin.length ? colors.primary : 'transparent' }]} />
        ))}
      </View>
      {wait > 0 ? <FormMessage kind="info" text={t('lock.waitCountdown', { seconds: wait })} testID="lock-wait" /> : null}
      {message && wait === 0 ? <FormMessage text={message} testID="lock-message" /> : null}
      {failures >= 5 && wait === 0 ? (
        <AppText variant="caption" color="textMuted" testID="lock-remaining">
          {t('lock.untilSignOut', { left: 10 - failures })}
        </AppText>
      ) : null}
      <View style={styles.pad}>
        {KEYS.map((k, i) =>
          k === '' ? (
            biometric || onPasskey ? (
              <Pressable key={i} onPress={() => void bio()} accessibilityRole="button" accessibilityLabel={t('lock.biometric')} style={styles.key} testID="lock-biometric">
                <Fingerprint size={28} color={colors.primary} strokeWidth={iconStroke} />
              </Pressable>
            ) : (
              <View key={i} style={styles.key} />
            )
          ) : (
            <Pressable
              key={i}
              onPress={() => void press(k)}
              disabled={wait > 0}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? t('lock.delete') : k}
              style={({ pressed }) => [styles.key, { backgroundColor: pressed ? colors.surfaceRaised : colors.surface, borderColor: colors.border, opacity: wait > 0 ? 0.4 : 1 }]}
              testID={`lock-key-${k}`}
            >
              {k === 'del' ? <Delete size={24} color={colors.text} strokeWidth={iconStroke} /> : <AppText variant="h2">{k}</AppText>}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const KEY = touchTarget + 28;
const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, zIndex: 1000 },
  dots: { flexDirection: 'row', gap: spacing.sm, minHeight: 24 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: KEY * 3 + spacing.md * 2, gap: spacing.md, justifyContent: 'center' },
  key: { width: KEY, height: KEY, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
});
