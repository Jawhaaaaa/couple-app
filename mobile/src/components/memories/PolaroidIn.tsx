import { type ReactNode, useEffect, useState } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { useMotionPreference } from '@/motion/useMotionPreference';

const PRINT_MS = 650;
/** Апп нээгдсэн агшин — үүнээс хойш үүссэн дурсамж «шинэ» (ANIM-13). */
const SESSION_START = Date.now();
/** Нэг дурсамжийг нэг ажиллалтад нэг л удаа «хэвлэнэ» (жагсаалт дахин mount хийхэд давтахгүй). */
const printed = new Set<string>();

/** Тестэд — тэмдэглэгээг цэвэрлэнэ. */
export function resetPrinted() {
  printed.clear();
}

/** Энэ ажиллалтын үеэр (өөрөө эсвэл хамтрагч) нэмсэн бөгөөд хараахан тоглоогүй эсэх. */
export function isFreshMemory(id: string, createdAt: string, since = SESSION_START): boolean {
  return !printed.has(id) && Date.parse(createdAt) >= since;
}

/**
 * ANIM-13 «Дурсамж нэмэгдсэн» (`impactLight`): шинэ карт polaroid хэвлэгдэж буй мэт дээрээс
 * бага зэрэг хазайж буугаад тодорно. Reduce motion / «Багасгах»-д энгийн fade, «Унтраах»-д
 * шууд харагдана.
 */
export function PolaroidIn({ id, fresh, children }: { id: string; fresh: boolean; children: ReactNode }) {
  const level = useMotionPreference();
  const [play] = useState(() => fresh && !printed.has(id));
  const [playing, setPlaying] = useState(play);
  const progress = useSharedValue(play && level !== 'off' ? 0 : 1);

  useEffect(() => {
    if (!play) return;
    printed.add(id);
    playHaptic('ANIM-13');
    const duration = level === 'full' ? PRINT_MS : level === 'reduced' ? PRINT_MS / 3 : 0;
    progress.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(() => setPlaying(false), duration);
    return () => clearTimeout(timer);
  }, [id, level, play, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    if (level !== 'full') return { opacity: p };
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * -28 }, { rotate: `${(1 - p) * -3}deg` }, { scale: 0.94 + 0.06 * p }],
    };
  });

  if (!play) return <>{children}</>;
  return (
    <AnimatedMoment anim="ANIM-13" playing={playing}>
      {() => <Animated.View style={style}>{children}</Animated.View>}
    </AnimatedMoment>
  );
}
