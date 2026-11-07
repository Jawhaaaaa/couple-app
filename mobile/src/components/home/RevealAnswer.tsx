import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const REVEAL_MS = 700;
/** Нэг асуултын тайлалтыг апп-ын нэг ажиллалтад нэг л удаа тоглуулна. */
const revealed = new Set<string>();

/** Тестэд — тоглуулсан асуултын тэмдэглэгээг цэвэрлэнэ. */
export function resetRevealMemory() {
  revealed.clear();
}

/**
 * ANIM-19 «Өдрийн асуулт тайлах» (AC-15): хамтрагчийн хариулт царцсан шилнээс тодорч
 * гарна (`impactLight`). Reduce motion-д энгийн fade, «Унтраах»-д шууд.
 */
export function RevealAnswer({ questionKey, label, text }: { questionKey: string; label: string; text: string }) {
  const colors = useColors();
  const level = useMotionPreference();
  const [fresh] = useState(() => !revealed.has(questionKey));
  const [playing, setPlaying] = useState(fresh);
  const frost = useSharedValue(fresh && level !== 'off' ? 1 : 0);

  useEffect(() => {
    if (!fresh) return;
    revealed.add(questionKey);
    playHaptic('ANIM-19');
    frost.value = withTiming(0, { duration: level === 'full' ? REVEAL_MS : REVEAL_MS / 2 });
    const timer = setTimeout(() => setPlaying(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [fresh, frost, level, questionKey]);

  const frostStyle = useAnimatedStyle(() => ({ opacity: frost.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: 1 - frost.value * 0.85 }));
  return (
    <AnimatedMoment anim="ANIM-19" playing={playing} style={[styles.box, { backgroundColor: colors.surfaceRaised }]}>
      {() => (
        <>
          <AppText variant="label" color="textMuted">
            {label}
          </AppText>
          <Animated.View style={textStyle}>
            <AppText testID="question-partner-answer">{text}</AppText>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frost, { backgroundColor: colors.surfaceRaised }, frostStyle]} />
        </>
      )}
    </AnimatedMoment>
  );
}

/** Хамтрагч хараахан хариулаагүй / хариулт нууцлагдсан үеийн царцсан орлуулга. */
export function FrostedPlaceholder({ label, text, testID }: { label: string; text: string; testID: string }) {
  const colors = useColors();
  return (
    <View style={[styles.box, { backgroundColor: colors.surfaceRaised }]} testID={testID}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <View style={styles.lines} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {(['90%', '75%', '50%'] as const).map((width) => (
          <View key={width} style={[styles.line, { width, backgroundColor: colors.border }]} />
        ))}
      </View>
      <AppText color="textMuted" accessibilityLiveRegion="polite">
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.input, padding: spacing.md, gap: spacing.xs, overflow: 'hidden' },
  frost: { borderRadius: radius.input },
  lines: { gap: spacing.xs },
  line: { height: 12, borderRadius: radius.pill },
});
