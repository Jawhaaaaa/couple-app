import { router } from 'expo-router';
import { Pause, Play, X } from 'lucide-react-native';
import { type ReactNode, type Ref, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { RecapSlide } from '@/api/queries/recaps';
import { AppButton } from '@/components/AppButton';
import { RecapSlideView } from '@/components/memories/RecapSlides';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { type MotionLevel, useMotionPreference } from '@/motion/useMotionPreference';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** Слайд бүрийн хугацаа — дараагийнх руу автоматаар шилжинэ. */
export const SLIDE_MS = 6000;

function ProgressSegment({ state, level, paused }: { state: 'done' | 'current' | 'todo'; level: MotionLevel; paused: boolean }) {
  const colors = useColors();
  const progress = useSharedValue(state === 'done' ? 1 : 0);
  useEffect(() => {
    if (state !== 'current') {
      progress.value = state === 'done' ? 1 : 0;
      return;
    }
    if (level !== 'full') {
      progress.value = 1;
      return;
    }
    if (paused) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear });
  }, [level, paused, progress, state]);
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View style={[styles.segment, { backgroundColor: colors.border }]}>
      <Animated.View style={[styles.segmentFill, { backgroundColor: colors.primary }, style]} />
    </View>
  );
}

/**
 * Story хэлбэрийн слайдууд (ANIM-22) — S-38 (ойн хураангуй) ба S-72 («Бидний жил») хуваалцана:
 * автоматаар солигдоно, баруун/зүүн талыг товшиж шилжинэ, түр зогсоох (WCAG 2.2.2), reduce motion-д fade.
 */
export function RecapStory({
  slides,
  yearLabel,
  onClose,
  lastActions,
  stageRef,
}: {
  slides: RecapSlide[];
  yearLabel: string;
  onClose: () => void;
  /** Сүүлийн слайдын нэмэлт товч (S-72 «Зураг болгон хадгалах»). */
  lastActions?: ReactNode;
  /** Слайдын талбайн ref (зураг болгох). */
  stageRef?: Ref<unknown>;
}) {
  const t = useT();
  const colors = useColors();
  const level = useMotionPreference();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = slides.length;
  const slide = slides[index];
  const last = index >= total - 1;

  useEffect(() => {
    if (paused || last) return;
    const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, total - 1)), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, last, paused, total]);

  const next = () => (last ? onClose() : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <View style={styles.flex} testID="recap-story">
      <View style={styles.progress} accessible accessibilityLabel={t('memories.recap.position', { index: index + 1, total })} testID="recap-position">
        {slides.map((s, i) => (
          <ProgressSegment key={`${s.kind}-${i}`} state={i < index ? 'done' : i === index ? 'current' : 'todo'} level={level} paused={paused} />
        ))}
      </View>
      <View style={styles.bar}>
        <Pressable
          onPress={() => setPaused((p) => !p)}
          accessibilityRole="button"
          accessibilityLabel={paused ? t('memories.recap.play') : t('memories.recap.pause')}
          style={styles.icon}
          testID="recap-pause"
        >
          {paused ? <Play size={22} color={colors.text} strokeWidth={iconStroke} /> : <Pause size={22} color={colors.text} strokeWidth={iconStroke} />}
        </Pressable>
        <View style={styles.flex} />
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.icon} testID="recap-close">
          <X size={26} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
      </View>

      <View style={styles.stage} ref={stageRef as never} collapsable={false}>
        {slide ? (
          <AnimatedMoment key={index} anim="ANIM-22" playing={level === 'full' && !paused} style={styles.flex}>
            {(motion) => (
              <Animated.View style={styles.flex} entering={motion === 'off' ? undefined : FadeIn.duration(motion === 'full' ? 450 : 200)}>
                <RecapSlideView slide={slide} level={motion} durationMs={SLIDE_MS} yearLabel={yearLabel} />
              </Animated.View>
            )}
          </AnimatedMoment>
        ) : null}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={styles.zones} pointerEvents="box-none">
            <Pressable onPress={prev} style={styles.zonePrev} accessibilityRole="button" accessibilityLabel={t('memories.recap.prev')} testID="recap-prev" />
            <Pressable onPress={next} style={styles.zoneNext} accessibilityRole="button" accessibilityLabel={t('memories.recap.next')} testID="recap-next" />
          </View>
        </View>
      </View>
      {slide?.kind === 'MEMORY' && slide.memoryId ? (
        <AppButton
          variant="secondary"
          label={t('memories.recap.openMemory')}
          onPress={() => {
            const target = slide.memoryId;
            onClose();
            router.push(`/memories/${target}`);
          }}
          style={styles.cta}
          testID="recap-open-memory"
        />
      ) : null}
      {last ? lastActions : null}
      {last ? <AppButton label={t('memories.recap.done')} onPress={onClose} style={styles.cta} testID="recap-done" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progress: { flexDirection: 'row', gap: spacing.xxs, paddingHorizontal: spacing.screen, paddingTop: spacing.xs },
  segment: { flex: 1, height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  segmentFill: { height: '100%' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1 },
  zones: { flex: 1, flexDirection: 'row' },
  zonePrev: { flex: 1 },
  zoneNext: { flex: 2 },
  cta: { marginHorizontal: spacing.screen, marginBottom: spacing.md },
});
