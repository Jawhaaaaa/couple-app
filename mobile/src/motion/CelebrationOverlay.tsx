import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';

import { AnimatedMoment } from './AnimatedMoment';
import type { AnimId } from './anims';
import { Confetti } from './Confetti';
import { playHaptic } from './haptics';

/** Баярын мөч ≤ 2.5 с (§3.4 зарчим 2). */
export function celebrationDuration(ms: number): number {
  return Math.min(ms, motion.duration.celebrationMax);
}

interface Props {
  anim: AnimId;
  visible: boolean;
  /** Нэг удаа л дуудагдана: товшилт эсвэл ≤ 2.5 с-ийн дараа (AC-MO-02). */
  onDismiss: () => void;
  children: ReactNode;
  confetti?: boolean;
  durationMs?: number;
}

/**
 * Бүтэн дэлгэцийн баярын мөч (ANIM-05, 14, 18, 20, 21). Товшиход шууд хаагдана;
 * хаагдсан эсэхийг дуудагч тэмдэглэж дахин үзүүлэхгүй (GAP-23 — сервер тэмдэглэнэ).
 */
export function CelebrationOverlay({
  anim,
  visible,
  onDismiss,
  children,
  confetti = true,
  durationMs = motion.duration.celebrationMax,
}: Props) {
  const colors = useColors();
  const t = useT();
  const dismissed = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;
    dismissed.current = false;
    playHaptic(anim);
    const timer = setTimeout(dismiss, celebrationDuration(durationMs));
    return () => clearTimeout(timer);
  }, [anim, dismiss, durationMs, visible]);

  if (!visible) return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}>
      <Pressable
        style={styles.fill}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        testID="celebration-overlay"
      >
        <AnimatedMoment anim={anim} playing style={styles.fill}>
          {() => (
            <>
              {confetti ? <Confetti /> : null}
              {children}
            </>
          )}
        </AnimatedMoment>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
