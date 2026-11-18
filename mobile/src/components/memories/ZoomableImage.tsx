import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { MediaRef } from '@/api/queries/memories';

import { MemoryCover } from './MemoryCover';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * S-33 томруулдаг зураг: хоёр хуруугаар 1–4×, хоёр товшвол 2.5× ↔ 1×, томруулсан үед
 * чирж харна. Томруулсан эсэхийг `onZoomChange`-оор мэдэгдэнэ — тэр үед хуудас солих
 * гүйлгэлт зогсоно. Callback-ууд JS thread дээр (`runOnJS`) — энгийн, найдвартай.
 */
export function ZoomableImage({
  media,
  alt,
  width,
  height,
  onZoomChange,
}: {
  media: MediaRef;
  alt: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const base = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ x: 0, y: 0 });
  const [zoomed, setZoomed] = useState(false);

  const report = (next: boolean) => {
    if (next === zoomed) return;
    setZoomed(next);
    onZoomChange(next);
  };
  const reset = () => {
    scale.value = withTiming(1);
    base.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    report(false);
  };
  const limitX = (s: number) => (width * (s - 1)) / 2;
  const limitY = (s: number) => (height * (s - 1)) / 2;

  const pinch = usePinchGesture({
    runOnJS: true,
    onUpdate: (e) => {
      scale.value = clamp(base.value * e.scale, 1, MAX_SCALE);
    },
    onDeactivate: () => {
      if (scale.value <= 1.02) reset();
      else {
        base.value = scale.value;
        tx.value = clamp(tx.value, -limitX(scale.value), limitX(scale.value));
        ty.value = clamp(ty.value, -limitY(scale.value), limitY(scale.value));
        report(true);
      }
    },
  });
  const pan = usePanGesture({
    runOnJS: true,
    enabled: zoomed,
    onActivate: () => {
      start.value = { x: tx.value, y: ty.value };
    },
    onUpdate: (e) => {
      tx.value = clamp(start.value.x + e.translationX, -limitX(scale.value), limitX(scale.value));
      ty.value = clamp(start.value.y + e.translationY, -limitY(scale.value), limitY(scale.value));
    },
  });
  const doubleTap = useTapGesture({
    runOnJS: true,
    numberOfTaps: 2,
    onActivate: () => {
      if (base.value > 1) reset();
      else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        base.value = DOUBLE_TAP_SCALE;
        report(true);
      }
    },
  });
  const gesture = useExclusiveGestures(doubleTap, useSimultaneousGestures(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.frame, { width, height }, style]}>
        <MemoryCover media={media} size="lg" alt={alt} fit="contain" style={{ width, height }} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
