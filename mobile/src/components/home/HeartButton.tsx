import { useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { DASHBOARD_KEY } from '@/api/queries/dashboard';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { useErrorText } from '@/hooks/useErrorText';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic, playHugHaptic } from '@/motion/haptics';
import { ParticleBurst } from '@/motion/ParticleBurst';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { HUG_PRESS_MS, type SendOutcome, sendSignal, type SignalKind } from '@/signals/sendSignal';
import { useColors } from '@/theme/ThemeProvider';
import { motion, spacing } from '@/theme/tokens';

const SIZE = 96;
/** ANIM-01-ийн бүтэн мөч (бөөм хөвж уусах хүртэл). */
const FX_MS = 1100;

type Fx = 'HEART' | 'HUG' | null;
type Status = { kind: 'sent' | 'queued'; signal: SignalKind } | { kind: 'failed'; error: unknown } | null;

/**
 * Зүрхний товч (FR-4.1, FR-4.2, FR-4.4). Товшилт → `HEART` (ANIM-01: 0.92→1.06→1 squish +
 * хөвөх SVG зүрх, `impactMedium` ×2); ≥ 0.6 с дарвал → `HUG` (өөр haptic хээ ба гэрэлтэх
 * тэврэлт, AC-76). Offline бол outbox-д (FR-6.4). 429 `RATE_LIMITED` нь алдаа биш —
 * `retryAfterSeconds` хүртэл товч зөөлөн амарна (AC-19).
 */
export function HeartButton({ testID = 'heart-button' }: { testID?: string }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const level = useMotionPreference();
  const queryClient = useQueryClient();
  const { offline } = useNetworkStatus();
  const [fx, setFx] = useState<Fx>(null);
  const [burst, setBurst] = useState(0);
  const [status, setStatus] = useState<Status>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const ring = useSharedValue(0);

  const remaining = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;
  const cooling = remaining > 0;

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= cooldownUntil) setCooldownUntil(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  // Cooldown — алдаа биш, зөөлөн «амьсгалах» (Reduce motion-д тогтмол бүдэг)
  useEffect(() => {
    if (cooling && level === 'full') {
      scale.value = withRepeat(withSequence(withTiming(0.96, { duration: 700 }), withTiming(1, { duration: 700 })), -1, true);
    } else {
      scale.value = withTiming(1, { duration: motion.duration.short });
    }
  }, [cooling, level, scale]);

  useEffect(() => {
    if (!fx) return;
    const timer = setTimeout(() => setFx(null), FX_MS);
    return () => clearTimeout(timer);
  }, [fx]);

  useEffect(() => {
    if (!status || status.kind === 'failed') return;
    const timer = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  // Үйлдлийн handler-аас shared value-г `.set()`-ээр (React Compiler-ийн дүрэм)
  const animate = (signal: SignalKind) => {
    if (level === 'off') return;
    if (level === 'reduced') {
      opacity.set(withSequence(withTiming(0.6, { duration: motion.duration.feedback }), withTiming(1, { duration: motion.duration.base })));
      return;
    }
    if (signal === 'HUG') {
      scale.set(withSequence(withSpring(1.12, motion.springSoft), withSpring(1, motion.springSoft)));
      ring.set(0);
      ring.set(withTiming(1, { duration: FX_MS }));
    } else {
      scale.set(
        withSequence(withTiming(0.92, { duration: motion.duration.feedback }), withSpring(1.06, motion.springBouncy), withSpring(1, motion.spring)),
      );
    }
  };

  const send = async (signal: 'HEART' | 'HUG') => {
    if (cooling) return;
    setFx(signal);
    setBurst((b) => b + 1);
    animate(signal);
    if (signal === 'HUG') playHugHaptic();
    else playHaptic('ANIM-01');
    const outcome: SendOutcome = await sendSignal({ kind: signal }, { offline });
    if (outcome.status === 'cooldown') {
      const until = Date.now() + outcome.seconds * 1000;
      setNow(Date.now());
      setCooldownUntil(until);
      setStatus(null);
      return;
    }
    if (outcome.status === 'failed') {
      setStatus({ kind: 'failed', error: outcome.error });
      return;
    }
    setStatus({ kind: outcome.status, signal });
    if (outcome.status === 'sent') void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
  };

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'longpress') void send('HUG');
    else void send('HEART');
  };

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - ring.value, transform: [{ scale: 1 + ring.value * 0.6 }] }));

  const label = cooling ? t('home.heart.cooldownA11y', { seconds: remaining }) : t('home.heart.a11y');
  return (
    <View style={styles.root}>
      <AnimatedMoment anim="ANIM-01" playing={fx === 'HEART'} style={styles.stage}>
        {() => (
          <>
            {fx === 'HUG' ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.ring, { borderColor: colors.primary, backgroundColor: colors.glow }, ringStyle]}
                testID="anim-HUG"
                {...({ dataSet: { anim: 'HUG', animState: level === 'full' ? 'playing' : level } } as object)}
              />
            ) : null}
            <Animated.View style={buttonStyle}>
              <Pressable
                onPress={() => void send('HEART')}
                onLongPress={() => void send('HUG')}
                delayLongPress={HUG_PRESS_MS}
                disabled={cooling}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint={cooling ? undefined : t('home.heart.hint')}
                accessibilityState={{ disabled: cooling }}
                accessibilityActions={[
                  { name: 'activate', label: t('home.heart.a11y') },
                  { name: 'longpress', label: t('home.heart.hugA11y') },
                ]}
                onAccessibilityAction={onAction}
                testID={testID}
                style={({ pressed }) => [
                  styles.button,
                  {
                    backgroundColor: colors.primary,
                    shadowColor: colors.primary,
                    opacity: cooling ? 0.55 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Heart size={44} color={colors.onPrimary} fill={colors.onPrimary} strokeWidth={1.5} />
              </Pressable>
            </Animated.View>
            {fx === 'HEART' ? <ParticleBurst burstKey={burst} count={8} distance={110} /> : null}
          </>
        )}
      </AnimatedMoment>
      {cooling ? (
        <AppText color="textMuted" variant="caption" accessibilityLiveRegion="polite" testID="heart-cooldown">
          {t('home.heart.cooldown', { seconds: remaining })}
        </AppText>
      ) : status && status.kind !== 'failed' ? (
        <AppText color="textMuted" variant="caption" accessibilityLiveRegion="polite" testID={`heart-${status.kind}`}>
          {status.kind === 'queued' ? t('home.heart.queued') : status.signal === 'HUG' ? t('home.heart.hugSent') : t('home.heart.sent')}
        </AppText>
      ) : null}
      {status?.kind === 'failed' ? <FormMessage text={errorText(status.error)} testID="heart-error" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.xs },
  stage: { width: SIZE * 1.8, height: SIZE * 1.4, alignItems: 'center', justifyContent: 'center' },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2 },
});
