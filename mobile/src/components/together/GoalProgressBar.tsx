import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { useColors } from '@/theme/ThemeProvider';
import { motion, radius } from '@/theme/tokens';

interface Props {
  /** 0–100 */
  percent: number;
  /** Дэлгэц уншигчид — «40%, 400 000₮ / 1 000 000₮» г.м. */
  label: string;
  height?: number;
  testID?: string;
}

/**
 * ANIM-20 шингэн явц (FR-9.3, AC-42): өөрчлөгдөхөд дүүргэлт зөөлөн өсөж, дээрээ долгион
 * гүйнэ (haptic `notificationSuccess`). «Багасгах»/«Унтраах»-д шууд шинэ утга — хөдөлгөөнгүй.
 */
export function GoalProgressBar({ percent, label, height = 14, testID = 'goal-progress' }: Props) {
  const colors = useColors();
  const level = useMotionPreference();
  const clamped = Math.max(0, Math.min(100, percent));
  const fill = useSharedValue(clamped);
  const wave = useSharedValue(0);
  const previous = useRef(clamped);
  const [shown, setShown] = useState(clamped);
  const [playing, setPlaying] = useState(false);

  // Утга өөрчлөгдсөн рендэрт л ANIM-20 «тоглож буй» төлөвт орно (effect доторх setState-гүй)
  if (shown !== clamped) {
    setShown(clamped);
    setPlaying(level === 'full');
  }

  useEffect(() => {
    if (previous.current === clamped) return;
    const grew = clamped > previous.current;
    previous.current = clamped;
    if (level !== 'full') {
      fill.value = clamped;
      return;
    }
    if (grew) playHaptic('ANIM-20');
    fill.value = withTiming(clamped, { duration: motion.duration.long * 2, easing: Easing.out(Easing.cubic) });
    wave.value = withSequence(withRepeat(withTiming(1, { duration: 600 }), 2, true), withTiming(0, { duration: 200 }));
    const timer = setTimeout(() => setPlaying(false), motion.duration.long * 2 + 200);
    return () => clearTimeout(timer);
  }, [clamped, fill, level, wave]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));
  const waveStyle = useAnimatedStyle(() => ({ opacity: 0.35 * wave.value, transform: [{ translateX: -12 + 24 * wave.value }] }));

  return (
    <AnimatedMoment anim="ANIM-20" playing={playing}>
      {() => (
        <View
          style={[styles.track, { height, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
          testID={testID}
        >
          <Animated.View style={[styles.fill, { backgroundColor: colors.primary }, fillStyle]}>
            {level === 'full' ? <Animated.View style={[styles.wave, { backgroundColor: colors.onPrimary }, waveStyle]} /> : null}
          </Animated.View>
        </View>
      )}
    </AnimatedMoment>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: radius.pill, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, overflow: 'hidden' },
  wave: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 24, borderRadius: radius.pill },
});
