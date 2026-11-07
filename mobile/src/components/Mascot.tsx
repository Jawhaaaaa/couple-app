import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useT } from '@/i18n';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { useColors } from '@/theme/ThemeProvider';
import { type MascotColorName, mascotColors } from '@/theme/tokens';

const BEAR = require('../../assets/fluent/bear.png');

export type MascotName = 'bombolog' | 'bombii';
export type MascotPose = 'idle' | 'wave' | 'tilt';

interface Props {
  /** «Бөмбөлөг» эсвэл «Бөмбий» — хоёр дахь нь толин тусгалаар харагдана. */
  name?: MascotName;
  size?: number;
  /** Хэрэглэгчийн сонгосон бүсний өнгө (FR-18.7). */
  beltColor?: MascotColorName;
  pose?: MascotPose;
  testID?: string;
}

/**
 * Маскот бамбарууш (шаардлага §3.5): Fluent Emoji 3D 🐻 суурь зураг, Reanimated-аар
 * амьсгалах (scale 1→1.03), нүд ирмэх, толгой хазайлгах, даллах. Reduce motion /
 * «Унтраах»-д статик (ANIM-11).
 */
export function Mascot({ name = 'bombolog', size = 120, beltColor = 'coral', pose = 'idle', testID }: Props) {
  const t = useT();
  const colors = useColors();
  const level = useMotionPreference();
  const breathe = useSharedValue(1);
  const blink = useSharedValue(0);
  const tilt = useSharedValue(0);

  useEffect(() => {
    if (level !== 'full') {
      cancelAnimation(breathe);
      cancelAnimation(blink);
      cancelAnimation(tilt);
      breathe.value = 1;
      blink.value = 0;
      tilt.value = 0;
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    breathe.value = withRepeat(
      withSequence(withTiming(1.03, { duration: 1600, easing: ease }), withTiming(1, { duration: 1600, easing: ease })),
      -1,
    );
    blink.value = withRepeat(
      withSequence(withDelay(3200, withTiming(1, { duration: 80 })), withTiming(0, { duration: 120 })),
      -1,
    );
    if (pose === 'wave') {
      tilt.value = withRepeat(
        withSequence(withTiming(-8, { duration: 220 }), withTiming(8, { duration: 220 }), withTiming(0, { duration: 220 })),
        3,
      );
    } else if (pose === 'tilt') {
      tilt.value = withTiming(-6, { duration: 300 });
    }
  }, [blink, breathe, level, pose, tilt]);

  const mirror = name === 'bombii' ? -1 : 1;
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: mirror }, { scale: breathe.value }, { rotate: `${tilt.value}deg` }],
  }));
  const lidStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  const eye = size * 0.075;
  return (
    <View
      style={{ width: size, height: size * 1.08 }}
      accessibilityRole="image"
      accessibilityLabel={t('a11y.mascot')}
      testID={testID ?? `mascot-${name}`}
    >
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        <Image source={BEAR} style={{ width: size, height: size }} contentFit="contain" />
        {/* Нүд ирмэх давхарга — нүдний байрлалд зураасан зовхи */}
        <Animated.View pointerEvents="none" style={[styles.lids, { top: size * 0.4 }, lidStyle]}>
          <View style={[styles.lid, { width: eye * 1.6, height: eye * 0.45, backgroundColor: colors.onPrimary, left: size * 0.33 }]} />
          <View style={[styles.lid, { width: eye * 1.6, height: eye * 0.45, backgroundColor: colors.onPrimary, left: size * 0.55 }]} />
        </Animated.View>
        <View
          style={[
            styles.belt,
            { backgroundColor: mascotColors[beltColor], width: size * 0.5, height: size * 0.08, left: size * 0.25, top: size * 0.94 },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  lids: { position: 'absolute', left: 0, right: 0 },
  lid: { position: 'absolute', borderRadius: 999 },
  belt: { position: 'absolute', borderRadius: 999 },
});
