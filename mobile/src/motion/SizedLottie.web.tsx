import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { SizedLottieProps } from './SizedLottie';
import { useMotionPreference } from './useMotionPreference';

/**
 * Вэбийн Lottie (dotLottie). Хэмжээгүй контейнерт бүтэн дэлгэцийг эзэлдэг тул
 * (2026-11-07-ны туршилт) тогтоосон хэмжээтэй, `overflow: hidden` хайрцагт
 * рендэрлэнэ (AC-MO-05).
 */
export function SizedLottie({ source, size, loop = false, fallback = null, onFinish, testID }: SizedLottieProps) {
  const level = useMotionPreference();
  const box = { width: size, height: size };
  const data = useMemo(() => ('uri' in source ? undefined : JSON.stringify(source)), [source]);
  const src = 'uri' in source ? source.uri : undefined;

  if (level !== 'full') {
    return (
      <Animated.View entering={level === 'reduced' ? FadeIn : undefined} style={box} testID={testID}>
        {fallback}
      </Animated.View>
    );
  }
  return (
    <View style={[box, { overflow: 'hidden' }]} testID={testID}>
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
    </View>
  );
}
