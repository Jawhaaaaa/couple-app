import { Mail } from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, motion, radius, spacing } from '@/theme/tokens';

interface Props {
  /** Аль хэдийн нээгдсэн (уншсан, эсвэл зохиогч) бол дугтуйгүй шууд агуулга. */
  initiallyOpen: boolean;
  from: string;
  /** Нээх товч дарагдахад (уншсан болгох). */
  onOpen: () => void;
  children: ReactNode;
}

/**
 * ANIM-06 дугтуй нээх (S-67, AC-111): хаалт нь эргэж, захидал дээш гулсан гарна (haptic
 * `impactLight`). Reduce motion / «Багасгах»-д зөвхөн fade, «Унтраах»-д шууд.
 */
export function Envelope({ initiallyOpen, from, onOpen, children }: Props) {
  const t = useT();
  const colors = useColors();
  const level = useMotionPreference();
  const [open, setOpen] = useState(initiallyOpen);
  const [playing, setPlaying] = useState(false);
  const flap = useSharedValue(initiallyOpen ? 1 : 0);
  const rise = useSharedValue(initiallyOpen ? 1 : 0);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setPlaying(false), motion.duration.long * 3);
    return () => clearTimeout(timer);
  }, [playing]);

  const openNow = () => {
    playHaptic('ANIM-06');
    if (level === 'full') {
      setPlaying(true);
      flap.value = withTiming(1, { duration: motion.duration.long, easing: Easing.out(Easing.cubic) });
      rise.value = withDelay(motion.duration.short, withTiming(1, { duration: motion.duration.long }));
    } else {
      flap.value = 1;
      rise.value = 1;
    }
    setOpen(true);
    onOpen();
  };

  const flapStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { rotateX: `${flap.value * 180}deg` }], opacity: 1 - flap.value }));
  const letterStyle = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ translateY: 32 * (1 - rise.value) }] }));

  let content: ReactNode;
  if (!open) {
    content = (
      <View style={[styles.envelope, { backgroundColor: colors.surfaceRaised, borderColor: colors.secondary }]} testID="letter-envelope">
        <Animated.View style={[styles.flap, { borderTopColor: colors.secondary }, flapStyle]} />
        <Mail size={40} color={colors.primary} strokeWidth={iconStroke} />
        <AppText variant="h3">{t('letters.read.from', { name: from })}</AppText>
        <AppButton label={t('letters.read.open')} onPress={openNow} testID="letter-open" />
      </View>
    );
  } else if (level === 'full') {
    content = (
      <Animated.View style={letterStyle} testID="letter-content">
        {children}
      </Animated.View>
    );
  } else {
    content = (
      <Animated.View entering={level === 'reduced' ? FadeIn : undefined} testID="letter-content">
        {children}
      </Animated.View>
    );
  }

  return (
    <AnimatedMoment anim="ANIM-06" playing={playing}>
      {() => content}
    </AnimatedMoment>
  );
}

const styles = StyleSheet.create({
  envelope: { borderWidth: 2, borderRadius: radius.card, padding: spacing.lg, paddingTop: spacing.xxl, alignItems: 'center', gap: spacing.sm, overflow: 'hidden' },
  flap: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderTopWidth: 48,
    borderLeftWidth: 160,
    borderRightWidth: 160,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
