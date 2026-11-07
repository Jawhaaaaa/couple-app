import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { type MotionLevel, useMotionPreference } from '@/motion/useMotionPreference';
import { fontFamily } from '@/theme/typography';

/** ANIM-04 бүтэн хугацаа ≤ 900 мс (AC-13). */
export const ODOMETER_MS = 900;
const DIGIT_H = 56;
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Цифр бүрийн эргэлтийн хугацаа: зүүнээс баруун тийш шатлан, хамгийн урт нь 900 мс. */
export function digitDurations(count: number, total = ODOMETER_MS): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(total * (0.55 + (0.45 * (i + 1)) / count)));
}

function RollingDigit({ digit, duration }: { digit: number; duration: number }) {
  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = withTiming(-digit * DIGIT_H, { duration, easing: Easing.out(Easing.cubic) });
  }, [digit, duration, offset]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  return (
    <View style={styles.digitWindow}>
      <Animated.View style={style}>
        {DIGITS.map((d) => (
          <AppText key={d} style={[styles.digit, styles.cell]}>
            {d}
          </AppText>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * Хоногийн тоолуур (ANIM-04): одометр шиг цифр бүр 0-оос эргэлдэж зогсоно (≤ 900 мс,
 * Playfair italic). Эргэлт дуусмагц цифрийн багана энгийн бичвэрээр солигдоно — дэлгэц
 * уншигч, хайлт, E2E зөв тоог л уншина. «Багасгах»/Reduce motion-д тоо fade-ээр,
 * «Унтраах»-д шууд гарна (утга ижил).
 */
export function CounterOdometer({ value, testID = 'counter-days' }: { value: number; testID?: string }) {
  const level = useMotionPreference();
  const text = String(Math.max(0, Math.floor(value)));
  const [rolledFor, setRolledFor] = useState<string | null>(null);
  const rolling = level === 'full' && rolledFor !== text;

  useEffect(() => {
    if (level !== 'full') return;
    const timer = setTimeout(() => setRolledFor(text), ODOMETER_MS);
    return () => clearTimeout(timer);
  }, [level, text]);

  return (
    <AnimatedMoment anim="ANIM-04" playing={rolling} style={styles.row}>
      {(motion: MotionLevel) =>
        rolling ? (
          <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[...text].map((d, i) => (
              <RollingDigit key={`${i}-${text.length}`} digit={Number(d)} duration={digitDurations(text.length)[i]} />
            ))}
          </View>
        ) : (
          <Animated.View entering={motion === 'reduced' ? FadeIn.duration(ODOMETER_MS / 2) : undefined}>
            <AppText style={styles.digit} testID={testID}>
              {text}
            </AppText>
          </Animated.View>
        )
      }
    </AnimatedMoment>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  digitWindow: { height: DIGIT_H, overflow: 'hidden' },
  digit: { fontFamily: fontFamily.serifItalic, fontSize: 48, lineHeight: DIGIT_H },
  cell: { height: DIGIT_H },
});
