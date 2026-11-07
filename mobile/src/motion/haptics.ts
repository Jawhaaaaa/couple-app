import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { usePrefsStore } from '@/stores/prefsStore';

import { ANIM_HAPTICS, type AnimId, type HapticKind, type HapticSpec, HUG_HAPTIC } from './anims';

/**
 * Haptic-ийн гүйцэтгэл:
 * - `native` — expo-haptics (iOS/Android апп)
 * - `vibrate` — вэб, `navigator.vibrate` (Android Chrome — AC-217 (а))
 * - `visual` — вэб, чичиргээгүй (iOS Safari): дуудагч тод дүрслэл үзүүлнэ (AC-217 (б))
 * - `none` — haptic унтраастай эсвэл тухайн ANIM-д haptic «—» (AC-MO-04, AC-215)
 */
export type HapticOutcome = 'native' | 'vibrate' | 'visual' | 'none';

/** Вэбийн чичиргээний хээ (мс). */
const VIBRATION: Record<HapticKind, number[]> = {
  impactLight: [10],
  impactMedium: [20],
  impactHeavy: [35],
  selection: [6],
  notificationSuccess: [15, 60, 15],
};

const GAP_MS = 110;

type SoundPlayer = (anim: AnimId | 'HUG') => void;
let soundPlayer: SoundPlayer | null = null;

/** Сонголтот зөөлөн дуу (FR-19.7) — `sound.ts` бүртгэнэ. */
export function registerSoundPlayer(player: SoundPlayer | null) {
  soundPlayer = player;
}

function nativeOnce(kind: HapticKind): Promise<void> {
  switch (kind) {
    case 'impactLight':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'impactMedium':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'impactHeavy':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    case 'selection':
      return Haptics.selectionAsync();
    case 'notificationSuccess':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

function webVibrationPattern(spec: HapticSpec): number[] {
  const one = VIBRATION[spec.kind];
  const out: number[] = [];
  for (let i = 0; i < spec.times; i++) {
    if (i > 0) out.push(GAP_MS);
    out.push(...one);
  }
  return out;
}

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function perform(spec: HapticSpec | null, soundKey: AnimId | 'HUG'): HapticOutcome {
  const { haptics, sound } = usePrefsStore.getState();
  if (sound && soundPlayer) soundPlayer(soundKey);
  if (!spec || !haptics) return 'none';
  if (Platform.OS === 'web') {
    if (canVibrate()) {
      navigator.vibrate(webVibrationPattern(spec));
      return 'vibrate';
    }
    return 'visual';
  }
  for (let i = 0; i < spec.times; i++) {
    setTimeout(() => {
      nativeOnce(spec.kind).catch(() => {});
    }, i * GAP_MS);
  }
  return 'native';
}

/** ANIM-ийн хүснэгтийн haptic-ийг гүйцэтгэнэ. */
export function playHaptic(anim: AnimId): HapticOutcome {
  return perform(ANIM_HAPTICS[anim], anim);
}

/** «Том тэврэлт» (FR-4.2). */
export function playHugHaptic(): HapticOutcome {
  return perform(HUG_HAPTIC, 'HUG');
}

export { webVibrationPattern };
