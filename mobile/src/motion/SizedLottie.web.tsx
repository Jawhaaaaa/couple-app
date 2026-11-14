import { lazy, Suspense, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useLottieSource } from './lottieSource';
import type { SizedLottieProps } from './SizedLottie';
import { useMotionPreference } from './useMotionPreference';

/**
 * dotLottie тоглуулагч (~0.5 MB) эхний ачааллын bundle-д орохгүй — анхны Lottie харагдах үед л
 * тусдаа chunk болж татагдана (FR-19.10, AC-160). Татагдах хооронд статик дүрс.
 */
const DotLottieReact = lazy(() => import('@lottiefiles/dotlottie-react').then((m) => ({ default: m.DotLottieReact })));

/**
 * Вэбийн Lottie (dotLottie). Хэмжээгүй контейнерт бүтэн дэлгэцийг эзэлдэг тул
 * (2026-11-07-ны туршилт) тогтоосон хэмжээтэй, `overflow: hidden` хайрцагт
 * рендэрлэнэ (AC-MO-05).
 */
export function SizedLottie({ source, size, loop = false, fallback = null, onFinish, testID }: SizedLottieProps) {
  const level = useMotionPreference();
  const resolved = useLottieSource(source, level === 'full');
  const box = { width: size, height: size };
  const data = useMemo(() => (!resolved || 'uri' in resolved ? undefined : JSON.stringify(resolved)), [resolved]);
  const src = resolved && 'uri' in resolved ? resolved.uri : undefined;

  if (level !== 'full' || !resolved) {
    return (
      <Animated.View entering={level === 'reduced' ? FadeIn : undefined} style={box} testID={testID}>
        {fallback}
      </Animated.View>
    );
  }
  return (
    <View style={[box, { overflow: 'hidden' }]} testID={testID}>
      <Suspense fallback={fallback}>
        <DotLottieReact
          data={data}
          src={src}
          autoplay
          loop={loop}
          style={{ width: size, height: size, display: 'block' }}
          dotLottieRefCallback={(player) => {
            if (player && onFinish) player.addEventListener('complete', () => onFinish());
          }}
        />
      </Suspense>
    </View>
  );
}
