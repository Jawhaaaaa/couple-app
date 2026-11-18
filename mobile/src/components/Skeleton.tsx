import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useMotionPreference } from '@/motion/useMotionPreference';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Skeleton shimmer (ANIM-16). Reduce motion-д хөдөлгөөнгүй. */
export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const colors = useColors();
  const level = useMotionPreference();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    if (level === 'full') pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [level, pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.block, { backgroundColor: colors.surfaceRaised }, animated, style]} />;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <View style={styles.list} testID="skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} style={{ height: 96 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: radius.card, width: '100%' },
  list: { gap: spacing.md, padding: spacing.screen, width: '100%' },
});
