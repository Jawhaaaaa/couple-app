/**
 * ANIM-01…23 (шаардлага §3.4-ийн хүснэгт) ба тэдгээрийн haptic. Энэ хүснэгт нь
 * `haptics.test.ts`-ийн эх (AC-215): «—» бол haptic 0.
 */
export type HapticKind = 'impactLight' | 'impactMedium' | 'impactHeavy' | 'selection' | 'notificationSuccess';

export interface HapticSpec {
  kind: HapticKind;
  /** Давталтын тоо (ANIM-01 — `impactMedium` ×2, «lub-dub»). */
  times: number;
}

export const ANIM_IDS = [
  'ANIM-01',
  'ANIM-02',
  'ANIM-03',
  'ANIM-04',
  'ANIM-05',
  'ANIM-06',
  'ANIM-07',
  'ANIM-08',
  'ANIM-09',
  'ANIM-10',
  'ANIM-11',
  'ANIM-12',
  'ANIM-13',
  'ANIM-14',
  'ANIM-15',
  'ANIM-16',
  'ANIM-17',
  'ANIM-18',
  'ANIM-19',
  'ANIM-20',
  'ANIM-21',
  'ANIM-22',
  'ANIM-23',
] as const;
export type AnimId = (typeof ANIM_IDS)[number];

const h = (kind: HapticKind, times = 1): HapticSpec => ({ kind, times });

export const ANIM_HAPTICS: Record<AnimId, HapticSpec | null> = {
  'ANIM-01': h('impactMedium', 2), // Зүрх илгээх
  'ANIM-02': h('notificationSuccess'), // Зүрх хүлээн авах
  'ANIM-03': h('selection'), // Чамайг бодож байна
  'ANIM-04': null, // Хоногийн тоолуур
  'ANIM-05': h('notificationSuccess'), // Ойн баяр
  'ANIM-06': h('impactLight'), // Захидал нээх
  'ANIM-07': h('selection'), // Реакц
  'ANIM-08': null, // Бичиж байна
  'ANIM-09': h('impactLight'), // Pull-to-refresh
  'ANIM-10': h('selection'), // Таб солих
  'ANIM-11': null, // Хоосон төлөв
  'ANIM-12': h('notificationSuccess'), // Болзоо зөвшөөрөх
  'ANIM-13': h('impactLight'), // Дурсамж нэмэгдсэн
  'ANIM-14': h('notificationSuccess'), // Хос холбогдох
  'ANIM-15': h('selection'), // Сэтгэл санаа
  'ANIM-16': null, // Ачаалал
  'ANIM-17': h('impactMedium'), // Санамсаргүй сонго
  'ANIM-18': h('notificationSuccess'), // Нууц санал нэгдэл
  'ANIM-19': h('impactLight'), // Өдрийн асуулт тайлах
  'ANIM-20': h('notificationSuccess'), // Зорилгын явц
  'ANIM-21': h('notificationSuccess'), // Time capsule нээх
  'ANIM-22': null, // Жилийн хураангуй
  'ANIM-23': null, // Дуут мессеж
};

/** «Том тэврэлт» (FR-4.2) — зүрхнээс ялгаатай haptic хээ. */
export const HUG_HAPTIC: HapticSpec = h('impactHeavy', 3);

/** Баярын анимаци — товшиход хаагдана, нэг үйл явдалд нэг удаа (AC-MO-02). */
export const CELEBRATION_ANIMS: readonly AnimId[] = ['ANIM-05', 'ANIM-14', 'ANIM-18', 'ANIM-20', 'ANIM-21'];
