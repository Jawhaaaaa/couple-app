import LottieView from 'lottie-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { type LottieInput, useLottieSource } from './lottieSource';
import { useMotionPreference } from './useMotionPreference';

export interface SizedLottieProps {
  /** JSON объект, URI эсвэл хэрэгтэй үед татах loader (`() => import('…json')`, AC-160). */
  source: LottieInput;
  /** Контейнерийн тогтоосон хэмжээ (dp) — Lottie контейнерээ дүүргэж томрохгүй (AC-MO-05). */
  size: number;
  loop?: boolean;
  /** «Унтраах» үед Lottie-гийн оронд үзүүлэх статик дүрс (emoji, зураг). */
  fallback?: ReactNode;
  onFinish?: () => void;
  testID?: string;
}

/**
 * Native Lottie. «Унтраах»-д LottieView огт mount хийгдэхгүй — нэг ч frame тоглохгүй
 * (AC-MO-03); «Багасгах»/Reduce motion-д тоглуулахгүй, статик дүрс fade-ээр гарна. Loader-тэй
 * эх сурвалж татагдаж дуустал статик дүрс харагдана.
 */
export function SizedLottie({ source, size, loop = false, fallback = null, onFinish, testID }: SizedLottieProps) {
  const level = useMotionPreference();
  const resolved = useLottieSource(source, level === 'full');
  const box = { width: size, height: size };
  if (level !== 'full' || !resolved) {
    return (
      <Animated.View entering={level === 'reduced' ? FadeIn : undefined} style={box} testID={testID}>
        {fallback}
      </Animated.View>
    );
  }
  return (
    <View style={[box, { overflow: 'hidden' }]} testID={testID}>
      <LottieView
        source={resolved}
        autoPlay
        loop={loop}
        style={box}
        onAnimationFinish={onFinish ? () => onFinish() : undefined}
      />
    </View>
  );
}
