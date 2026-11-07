import { MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { RecapSlide } from '@/api/queries/recaps';
import { AppText } from '@/components/AppText';
import { Mascot } from '@/components/Mascot';
import { formatNumber, useT } from '@/i18n';
import type { MotionLevel } from '@/motion/useMotionPreference';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

import { MemoryCover } from './MemoryCover';

export const COUNT_MS = 1200;

/** Тоолж өсөх тоо (STAT): `full`-д 0 → утга, бусад үед шууд эцсийн утга. */
export function CountUp({ value, level, testID }: { value: number; level: MotionLevel; testID?: string }) {
  const locale = usePrefsStore((s) => s.locale);
  const animate = level === 'full' && value > 0;
  const [shown, setShown] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt) / COUNT_MS);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(value * eased));
      if (p >= 1) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [animate, value]);
  return (
    <AppText variant="display" accessibilityLabel={formatNumber(value, locale)} testID={testID}>
      {formatNumber(animate ? shown : value, locale)}
    </AppText>
  );
}

/** Ken Burns (MEMORY): удаан томорч бага зэрэг шилжинэ; reduce motion-д хөдөлгөөнгүй. */
function KenBurns({ slide, durationMs, level }: { slide: RecapSlide; durationMs: number; level: MotionLevel }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (level !== 'full') return;
    progress.value = withTiming(1, { duration: durationMs, easing: Easing.linear });
  }, [durationMs, level, progress]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.12 * progress.value }, { translateX: -12 * progress.value }, { translateY: -8 * progress.value }],
  }));
  return (
    <View style={styles.photoFrame} testID="recap-kenburns">
      <Animated.View style={[styles.fill, style]}>
        <MemoryCover media={slide.media} size="lg" alt={slide.title} style={styles.fill} />
      </Animated.View>
    </View>
  );
}

/**
 * Жилийн хураангуйн нэг слайд (FR-5.11, ANIM-22): TITLE · STAT (тоолж өсөх) · MEMORY (Ken
 * Burns) · PLACE · CLOSING. Хөдөлгөөний түвшин `level`-ээр — reduce motion-д статик.
 */
export function RecapSlideView({ slide, level, durationMs, yearLabel }: { slide: RecapSlide; level: MotionLevel; durationMs: number; yearLabel: string }) {
  const t = useT();
  const colors = useColors();
  return (
    <View style={styles.slide} testID={`recap-slide-${slide.kind}`}>
      {slide.kind === 'TITLE' ? (
        <>
          <AppText variant="label" color="textMuted">
            {yearLabel}
          </AppText>
          <AppText variant="display" style={styles.center}>
            {slide.title}
          </AppText>
        </>
      ) : null}
      {slide.kind === 'STAT' ? (
        <>
          <CountUp value={slide.value ?? 0} level={level} testID="recap-stat-value" />
          <AppText variant="h2" style={styles.center}>
            {slide.title}
          </AppText>
        </>
      ) : null}
      {slide.kind === 'MEMORY' ? (
        <>
          <KenBurns slide={slide} durationMs={durationMs} level={level} />
          <AppText variant="h2" style={styles.center}>
            {slide.title}
          </AppText>
        </>
      ) : null}
      {slide.kind === 'PLACE' ? (
        <>
          <View style={[styles.badge, { backgroundColor: colors.surfaceRaised }]}>
            <MapPin size={40} color={colors.primary} strokeWidth={iconStroke} />
          </View>
          <AppText variant="h2" style={styles.center}>
            {slide.title}
          </AppText>
        </>
      ) : null}
      {slide.kind === 'CLOSING' ? (
        <>
          <Mascot size={120} pose="wave" />
          <AppText variant="h1" style={styles.center}>
            {slide.title}
          </AppText>
        </>
      ) : null}
      {slide.body ? (
        <AppText color="textMuted" style={styles.center} testID="recap-slide-body">
          {slide.body}
        </AppText>
      ) : null}
      {slide.kind === 'CLOSING' ? (
        <AppText variant="caption" color="textMuted" style={styles.center}>
          {t('memories.recap.thanks')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  center: { textAlign: 'center' },
  fill: { width: '100%', height: '100%' },
  photoFrame: { width: '100%', maxWidth: 420, aspectRatio: 4 / 5, borderRadius: radius.image, overflow: 'hidden' },
  badge: { width: 88, height: 88, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
