import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useColors } from '@/theme/ThemeProvider';

import type { HapticSpec } from './anims';
import { onVisualHaptic } from './haptics';
import { useMotionPreference } from './useMotionPreference';

/** Нэг импульсийн хугацаа (мс): тодрох + унтрах. */
export const FLASH_IN_MS = 70;
export const FLASH_OUT_MS = 180;

/** Тод дүрслэлийн нийт хугацаа — haptic-ийн давталтын тоогоор (`notificationSuccess` г.м. 2–3 импульс). */
export function flashDuration(spec: Pick<HapticSpec, 'times'>): number {
  return Math.max(1, spec.times) * (FLASH_IN_MS + FLASH_OUT_MS);
}

/**
 * Haptic-ийн вэб орлуулга (FR-19.7, AC-217 (б)): чичиргээгүй хөтөчид (iOS Safari) haptic бүрд
 * дэлгэцийн захаар богино, тод өнгөт хүрээ анивчина. Хүрэлтийг хаахгүй (`pointerEvents="none"`).
 * Хөдөлгөөн «Унтраах» үед анивчилтгүй, хүрээ хэдхэн агшин тогтмол харагдана (§3.4 зарчим 4).
 * Native-д haptic өөрөө ажиллах тул юу ч рендэрлэхгүй.
 */
export function HapticFlash() {
  if (Platform.OS !== 'web') return null;
  return <HapticFlashWeb />;
}

function HapticFlashWeb() {
  const colors = useColors();
  const motion = useMotionPreference();
  const opacity = useSharedValue(0);
  const [pulse, setPulse] = useState<{ id: number; times: number } | null>(null);

  useEffect(() => onVisualHaptic((spec) => setPulse((p) => ({ id: (p?.id ?? 0) + 1, times: spec.times }))), []);

  useEffect(() => {
    if (!pulse) return;
    if (motion === 'off') opacity.value = 0.9;
    else opacity.value = withRepeat(withSequence(withTiming(0.9, { duration: FLASH_IN_MS }), withTiming(0, { duration: FLASH_OUT_MS })), pulse.times, false);
    const timer = setTimeout(() => {
      opacity.value = 0;
      setPulse(null);
    }, flashDuration(pulse));
    return () => clearTimeout(timer);
  }, [motion, opacity, pulse]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!pulse) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ring, { borderColor: colors.primary }, style]} testID="haptic-visual" />;
}

const styles = StyleSheet.create({
  ring: { borderWidth: 6, zIndex: 9999 },
});
