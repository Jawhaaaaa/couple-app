import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useColors } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';

import { useMotionPreference } from './useMotionPreference';

interface PieceProps {
  index: number;
  width: number;
  height: number;
  color: string;
  duration: number;
}

function Piece({ index, width, height, color, duration }: PieceProps) {
  const fall = useSharedValue(0);
  const x = ((index * 97) % 100) / 100;
  const drift = ((index * 53) % 40) - 20;
  const spin = ((index * 31) % 360) + 180;

  useEffect(() => {
    fall.value = withDelay((index % 12) * 35, withTiming(1, { duration, easing: Easing.in(Easing.quad) }));
  }, [duration, fall, index]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - fall.value * 0.8,
    transform: [
      { translateX: x * width + drift * fall.value },
      { translateY: -20 + (height + 40) * fall.value },
      { rotate: `${spin * fall.value}deg` },
    ],
  }));

  return <Animated.View style={[styles.piece, { backgroundColor: color }, style]} />;
}

interface Props {
  count?: number;
  /** Баярын мөч ≤ 2.5 с (§3.4 зарчим 2). */
  duration?: number;
}

/** Confetti (ANIM-05, 14, 18, 20). «Багасгах»/«Унтраах»-д рендэрлэгдэхгүй (AC-MO-03). */
export function Confetti({ count = 48, duration = motion.duration.celebrationMax - 300 }: Props) {
  const level = useMotionPreference();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const palette = [colors.primary, colors.secondary, colors.tertiary, colors.success, colors.warning];
  const items = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  if (level !== 'full') return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti">
      {items.map((i) => (
        <Piece key={i} index={i} width={width} height={height} color={palette[i % palette.length]} duration={duration} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, left: 0, width: 8, height: 12, borderRadius: 2 },
});
