import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { type AnimationSetting, usePrefsStore } from '@/stores/prefsStore';

/** `full` — бүх хөдөлгөөн · `reduced` — fade л · `off` — Lottie/бөөм 0 frame. */
export type MotionLevel = 'full' | 'reduced' | 'off';

/** Апп доторх тохиргоо ба системийн «Reduce motion»-оос түвшинг гаргана (§3.4 зарчим 4). */
export function resolveMotion(setting: AnimationSetting, systemReduce: boolean): MotionLevel {
  if (setting === 'OFF') return 'off';
  if (setting === 'REDUCED' || systemReduce) return 'reduced';
  return 'full';
}

export function useSystemReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export function useMotionPreference(): MotionLevel {
  const setting = usePrefsStore((s) => s.animation);
  const systemReduce = useSystemReduceMotion();
  return resolveMotion(setting, systemReduce);
}
