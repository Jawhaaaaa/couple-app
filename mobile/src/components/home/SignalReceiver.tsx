import { useQueryClient } from '@tanstack/react-query';
import type { AnimationObject } from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { type Dashboard, DASHBOARD_KEY, type SignalKind } from '@/api/queries/dashboard';
import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic, playHugHaptic } from '@/motion/haptics';
import { SizedLottie } from '@/motion/SizedLottie';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { onRealtime } from '@/realtime/eventRouter';
import { markSignalsSeen } from '@/signals/seen';
import { useSignalFx } from '@/signals/sendSignal';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const heartLottie = require('../../../assets/lottie/noto/red-heart.json') as AnimationObject;
const hugLottie = require('../../../assets/lottie/noto/hug.json') as AnimationObject;

/** ANIM-02 ≈ 1.6 с; «Чамайг бодож байна»-ын бичвэрийг уншихад арай урт. */
export const RECEIVE_MS: Record<SignalKind, number> = { HEART: 1600, HUG: 1600, THINKING: 3200 };

interface Received {
  key: string;
  kind: SignalKind;
  text: string | null;
}

interface SignalPayload {
  signalId?: string;
  kind?: SignalKind;
  text?: string | null;
}

/**
 * Хамтрагчийн дохио ирэхэд (WebSocket `signal.received`, AC-17) аль ч дэлгэц дээр богино
 * overlay: `HEART` → ANIM-02 (Lottie 💗 + захын гэрэлтэлт, `notificationSuccess`), `HUG` →
 * өөр анимаци ба haptic хээ (AC-76), `THINKING` → бичвэртэй ANIM-03 (AC-77). Дарааллыг
 * хаахгүй (`pointerEvents="none"`). Тоглуулмагц `POST /signals/seen` — дараа нь нүүрний
 * «үзээгүй» картад дахин гарахгүй (AC-18).
 */
export function SignalReceiver() {
  const t = useT();
  const colors = useColors();
  const level = useMotionPreference();
  const queryClient = useQueryClient();
  const markLive = useSignalFx((s) => s.markLive);
  const [current, setCurrent] = useState<Received | null>(null);
  const counter = useRef(0);

  useEffect(
    () =>
      onRealtime('signal.received', (event) => {
        const payload = (event.payload ?? {}) as SignalPayload;
        const kind: SignalKind = payload.kind ?? 'HEART';
        counter.current += 1;
        markLive();
        setCurrent({ key: `${event.id}-${counter.current}`, kind, text: payload.text ?? null });
        if (kind === 'HUG') playHugHaptic();
        else playHaptic(kind === 'THINKING' ? 'ANIM-03' : 'ANIM-02');
        markSignalsSeen()
          .then(() => queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY }))
          // Үзсэн гэж тэмдэглэж чадаагүй бол нүүрний карт дараа нь нэгтгэж үзүүлнэ — алдаа харуулахгүй
          .catch(() => undefined);
      }),
    [markLive, queryClient],
  );

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), RECEIVE_MS[current.kind]);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  const name = queryClient.getQueryData<Dashboard>(DASHBOARD_KEY)?.partner?.name ?? t('home.partnerFallback');
  const entering = level === 'off' ? undefined : level === 'reduced' ? FadeIn : ZoomIn.springify();
  const message =
    current.kind === 'HUG'
      ? t('signals.hugFrom', { name })
      : current.kind === 'THINKING'
        ? t('signals.thinkingFrom', { name })
        : t('signals.heartFrom', { name });

  const body = (
    <Animated.View entering={entering} style={[styles.bubble, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      {current.kind === 'THINKING' ? null : (
        <SizedLottie
          source={current.kind === 'HUG' ? hugLottie : heartLottie}
          size={140}
          fallback={<AppText style={styles.emoji}>{current.kind === 'HUG' ? '🤗' : '💗'}</AppText>}
        />
      )}
      <AppText variant="h3" style={styles.centerText} testID="signal-overlay-text">
        {message}
      </AppText>
      {current.text ? (
        <AppText variant="quote" style={styles.centerText} testID="signal-overlay-quote">
          {t('signals.quote', { text: current.text })}
        </AppText>
      ) : null}
    </Animated.View>
  );

  return (
    <Animated.View
      key={current.key}
      pointerEvents="none"
      exiting={level === 'off' ? undefined : FadeOut}
      style={StyleSheet.absoluteFill}
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      testID={`signal-overlay-${current.kind}`}
    >
      <View style={[StyleSheet.absoluteFill, styles.glow, { borderColor: colors.glow }]} />
      {current.kind === 'HUG' ? (
        <View style={styles.center} testID="anim-HUG-received">
          {body}
        </View>
      ) : (
        <AnimatedMoment anim={current.kind === 'THINKING' ? 'ANIM-03' : 'ANIM-02'} playing style={styles.centerFill}>
          {() => body}
        </AnimatedMoment>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: { borderWidth: 10, borderRadius: radius.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bubble: { alignItems: 'center', gap: spacing.xs, padding: spacing.lg, borderRadius: radius.card, borderWidth: 1, maxWidth: 320 },
  emoji: { fontSize: 72, lineHeight: 84, textAlign: 'center' },
});
