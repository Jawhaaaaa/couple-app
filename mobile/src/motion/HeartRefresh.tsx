import { Heart } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';

import { AnimatedMoment } from './AnimatedMoment';
import { playHaptic } from './haptics';

/** Зүрх дүүрэх хугацаа (мс), дараа нь цохилно (§3.4: шилжилт 200–350 мс). */
export const HEART_FILL_MS = 320;
export const HEART_BEAT_MS = 260;

/**
 * Системийн refresh spinner-ийг нуух (ANIM-09-ийн зүрх түүний оронд харагдана): iOS `tintColor`,
 * Android `colors`/`progressBackgroundColor`. `RefreshControl`-д дэлгэнэ.
 */
export const HIDDEN_REFRESH_SPINNER = {
  tintColor: 'transparent',
  colors: ['transparent'],
  progressBackgroundColor: 'transparent',
} as const;

/**
 * Хэрэглэгч өөрөө татсан шинэчлэлийн төлөв: арын (WS, focus) refetch-д зүрх гарч layout шилжихгүй.
 * `onRefresh` нь haptic (`impactLight`) тоглуулж, `refresh` дуустал `refreshing=true`.
 */
export function usePullRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    playHaptic('ANIM-09');
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);
  return { refreshing, onRefresh };
}

/**
 * ANIM-09 (§3.4): pull-to-refresh үед жагсаалтын дээд талд хоосон зүрх дүүрч, дараа нь шинэчлэл
 * дуустал цохилно. Haptic (`impactLight`) нь дуудагч талд `playHaptic('ANIM-09')`-оор.
 * «Багасгах»/«Унтраах» үед хөдөлгөөнгүй — дүүрсэн зүрх л харагдана (AC-MO-01, AC-MO-03).
 */
export function HeartRefresh({ refreshing }: { refreshing: boolean }) {
  const colors = useColors();
  const t = useT();

  return (
    <AnimatedMoment anim="ANIM-09" playing={refreshing} style={refreshing ? styles.wrap : styles.hidden} pointerEvents="none">
      {(level) =>
        refreshing ? (
          <HeartRefreshBody animate={level === 'full'} color={colors.primary} label={t('common.refreshing')} />
        ) : null
      }
    </AnimatedMoment>
  );
}

function HeartRefreshBody({ animate, color, label }: { animate: boolean; color: string; label: string }) {
  const fill = useSharedValue(animate ? 0 : 1);
  const beat = useSharedValue(1);
  useEffect(() => {
    if (!animate) {
      fill.value = 1;
      beat.value = 1;
      return;
    }
    fill.value = 0;
    beat.value = 1;
    fill.value = withTiming(1, { duration: HEART_FILL_MS, easing: Easing.out(Easing.cubic) });
    beat.value = withSequence(
      withTiming(1, { duration: HEART_FILL_MS }),
      withRepeat(withSequence(withTiming(1.18, { duration: HEART_BEAT_MS / 2 }), withTiming(1, { duration: HEART_BEAT_MS / 2 })), -1, false),
    );
    return () => {
      cancelAnimation(fill);
      cancelAnimation(beat);
    };
  }, [animate, beat, fill]);

  const filled = useAnimatedStyle(() => ({ transform: [{ scale: fill.value * beat.value }], opacity: fill.value }));
  return (
    <View style={styles.heart} accessibilityRole="progressbar" accessibilityLabel={label} testID="refresh-heart">
      <Heart size={28} color={color} strokeWidth={1.75} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, filled]}>
        <Heart size={28} color={color} fill={color} strokeWidth={1.75} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  hidden: { height: 0, overflow: 'hidden' },
  heart: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
