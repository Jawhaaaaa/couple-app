import { Heart } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { UserAvatar } from '@/components/UserAvatar';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { type MotionLevel, useMotionPreference } from '@/motion/useMotionPreference';
import type { Person } from '@/plans/people';
import { useColors } from '@/theme/ThemeProvider';
import { motion, radius, spacing } from '@/theme/tokens';

const AVATAR = 56;
const GAP = 72;
/** ANIM-12 нь баярын мөч биш — ≤ 1.6 с-д өөрөө хаагдана. */
export const CONFIRMED_MOMENT_MS = 1600;

function Avatars({ me, partner, level }: { me: Person | null; partner: Person | null; level: MotionLevel }) {
  const colors = useColors();
  const moving = level === 'full';
  const offset = useSharedValue(moving ? GAP : AVATAR / 2);
  const heart = useSharedValue(moving ? 0 : 1);

  useEffect(() => {
    if (!moving) return;
    offset.value = withSpring(AVATAR / 2, motion.spring);
    heart.value = withDelay(motion.duration.base, withSequence(withSpring(1.25, motion.springBouncy), withTiming(1, { duration: motion.duration.short })));
  }, [heart, moving, offset]);

  const left = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.value }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const heartStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, heart.value), transform: [{ scale: heart.value }] }));

  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.slot, left]}>
        <UserAvatar uri={me?.avatarUri} label={me?.name ?? ''} size={AVATAR} />
      </Animated.View>
      <Animated.View style={[styles.slot, right]}>
        <UserAvatar uri={partner?.avatarUri} label={partner?.name ?? ''} size={AVATAR} />
      </Animated.View>
      <Animated.View style={[styles.heart, { backgroundColor: colors.primary }, heartStyle]}>
        <Heart size={22} color={colors.onPrimary} fill={colors.onPrimary} />
      </Animated.View>
    </View>
  );
}

/**
 * ANIM-12 «Болзоо зөвшөөрөх» (AC-33): хоёр аватар төвд нийлж зүрх болно; reduce motion /
 * «Багасгах»-д зөвхөн fade, «Унтраах»-д хөдөлгөөнгүй. Товшиход эсвэл ≤ 1.6 с-д хаагдана.
 */
export function PlanConfirmedMoment({ me, partner, onDone }: { me: Person | null; partner: Person | null; onDone: () => void }) {
  const t = useT();
  const colors = useColors();
  useEffect(() => {
    playHaptic('ANIM-12');
    const timer = setTimeout(onDone, CONFIRMED_MOMENT_MS);
    return () => clearTimeout(timer);
  }, [onDone]);
  const level = useMotionPreference();
  return (
    <Animated.View entering={level === 'off' ? undefined : FadeIn} style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.primary }]}>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="plan-confirmed-moment">
        <AnimatedMoment anim="ANIM-12" playing style={styles.inner}>
          {(l) => (
            <>
              <Avatars me={me} partner={partner} level={l} />
              <AppText variant="h3" accessibilityLiveRegion="polite">
                {t('plans.confirmedMoment')}
              </AppText>
            </>
          )}
        </AnimatedMoment>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md },
  inner: { alignItems: 'center', gap: spacing.sm },
  stage: { height: AVATAR + spacing.md, width: GAP * 2 + AVATAR * 2, alignItems: 'center', justifyContent: 'center' },
  slot: { position: 'absolute' },
  heart: { position: 'absolute', width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
