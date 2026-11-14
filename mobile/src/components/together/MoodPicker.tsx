import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { MOOD_LEVELS } from '@/domain/moodChart';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import type { LottieLoader } from '@/motion/lottieSource';
import { SizedLottie } from '@/motion/SizedLottie';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing, touchTarget } from '@/theme/tokens';

/** Lottie JSON сонгох үед л татагдана (AC-160) — эхний ачааллын bundle-д орохгүй. */
const MOOD_LOTTIE: Record<number, LottieLoader> = {
  1: () => import('../../../assets/lottie/noto/mood-1.json'),
  2: () => import('../../../assets/lottie/noto/mood-2.json'),
  3: () => import('../../../assets/lottie/noto/mood-3.json'),
  4: () => import('../../../assets/lottie/noto/mood-4.json'),
  5: () => import('../../../assets/lottie/noto/mood-5.json'),
};
export const MOOD_EMOJI: Record<number, string> = { 1: '😢', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };

interface Props {
  value: number | null;
  onChange: (level: number) => void;
  disabled?: boolean;
}

/**
 * 5 түвшний сонголт (S-69, ANIM-15): сонгосон түвшин Noto emoji Lottie-гоор (`SizedLottie` — хэмжээ
 * тогтмол, «Унтраах»-д статик emoji) хөдөлж haptic `selection` өгнө.
 */
export function MoodPicker({ value, onChange, disabled }: Props) {
  const t = useT();
  const colors = useColors();
  const [playing, setPlaying] = useState(false);
  return (
    <AnimatedMoment anim="ANIM-15" playing={playing} style={styles.row}>
      {() =>
        MOOD_LEVELS.map((level) => {
          const selected = value === level;
          const emoji = <AppText style={styles.emoji}>{MOOD_EMOJI[level]}</AppText>;
          return (
            <Pressable
              key={level}
              onPress={() => {
                playHaptic('ANIM-15');
                setPlaying(true);
                onChange(level);
              }}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              aria-checked={selected}
              accessibilityLabel={t(`checkin.level.${level}`)}
              testID={`checkin-level-${level}`}
              style={[styles.option, { backgroundColor: selected ? colors.surfaceRaised : 'transparent', borderColor: selected ? colors.primary : colors.border }]}
            >
              {selected ? <SizedLottie source={MOOD_LOTTIE[level]} size={44} fallback={emoji} onFinish={() => setPlaying(false)} /> : <View style={styles.box}>{emoji}</View>}
              <AppText variant="caption" color={selected ? 'text' : 'textMuted'} numberOfLines={1}>
                {t(`checkin.level.${level}`)}
              </AppText>
            </Pressable>
          );
        })
      }
    </AnimatedMoment>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xxs },
  option: { flex: 1, minHeight: touchTarget, alignItems: 'center', gap: 2, paddingVertical: spacing.xs, borderRadius: radius.input, borderWidth: 1 },
  box: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28, lineHeight: 36 },
});
