import { Heart } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { useColors } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

function WaveHeart({ index, animate }: { index: number; animate: boolean }) {
  const colors = useColors();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    y.value = withDelay(index * 140, withRepeat(withSequence(withTiming(-4, { duration: 260 }), withTiming(0, { duration: 260 })), -1));
  }, [animate, index, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={style}>
      <Heart size={10} color={colors.primary} fill={colors.primary} />
    </Animated.View>
  );
}

/** ANIM-08 «Бичиж байна»: гурван жижиг зүрх долгион шиг; reduce motion-д хөдөлгөөнгүй. */
export function TypingHearts({ name }: { name: string }) {
  const level = useMotionPreference();
  const animate = level === 'full';
  return (
    <View testID="chat-typing" accessibilityLiveRegion="polite">
      <AnimatedMoment anim="ANIM-08" playing>
        {() => (
          <View style={styles.row}>
            <AppText variant="caption" color="textMuted" style={styles.name}>
              {name}
            </AppText>
            {[0, 1, 2].map((i) => (
              <WaveHeart key={i} index={i} animate={animate} />
            ))}
          </View>
        )}
      </AnimatedMoment>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.screen, minHeight: 24 },
  name: { fontStyle: 'italic' },
});
