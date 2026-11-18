import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useColors } from '@/theme/ThemeProvider';

import { useMotionPreference } from './useMotionPreference';

const HEART = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.6 1.1 4.6 2.6C12 6.1 13.6 5 15.6 5 19 5 21.1 8.4 19.6 11.8 17.5 16.4 12 21 12 21z';

interface ParticleProps {
  index: number;
  count: number;
  color: string;
  distance: number;
  duration: number;
}

function Particle({ index, count, color, distance, duration }: ParticleProps) {
  const progress = useSharedValue(0);
  const spread = ((index / Math.max(count - 1, 1)) - 0.5) * 2;
  const size = 10 + ((index * 7) % 8);

  useEffect(() => {
    progress.value = withDelay(index * 40, withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
  }, [duration, index, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateY: -distance * progress.value },
      { translateX: spread * 28 * progress.value },
      { scale: 0.6 + 0.6 * progress.value },
    ],
  }));

  return (
    <Animated.View style={[styles.particle, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={HEART} fill={color} />
      </Svg>
    </Animated.View>
  );
}

interface Props {
  /** 6–10 бөөм (ANIM-01). */
  count?: number;
  distance?: number;
  duration?: number;
  /** Өдөөгдөх бүрд шинэ бөөм гаргахын тулд түлхүүр солино. */
  burstKey: number | string;
}

/**
 * Дээш хөвж уусах SVG зүрхнүүд (ANIM-01, ANIM-03). Reduce motion / «Багасгах» /
 * «Унтраах»-д бөөм огт рендэрлэгдэхгүй (AC-MO-01, AC-MO-03) — утгын бичвэр нь
 * дуудагчийн талд хэвээр харагдана.
 */
export function ParticleBurst({ count = 8, distance = 90, duration = 900, burstKey }: Props) {
  const level = useMotionPreference();
  const colors = useColors();
  const items = useMemo(() => Array.from({ length: Math.min(10, Math.max(6, count)) }, (_, i) => i), [count]);
  if (level !== 'full') return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="particle-burst" key={burstKey}>
      {items.map((i) => (
        <Particle
          key={i}
          index={i}
          count={items.length}
          color={i % 3 === 0 ? colors.secondary : colors.primary}
          distance={distance}
          duration={duration}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', left: '50%', top: '50%' },
});
