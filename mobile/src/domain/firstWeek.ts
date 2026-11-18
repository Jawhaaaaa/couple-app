import type { Href } from 'expo-router';

import data from '@/content/first-week.json';
import type { Locale } from '@/stores/prefsStore';

/** Эхний 7 хоногийн нэг даалгавар (FR-16.4, AC-134) — бичвэр нь `first-week.json` (backend-тэй нэг эх). */
export interface FirstWeekContent {
  id: string;
  day: number;
  title: string;
  body: string;
}

/**
 * Даалгаврын товч хаашаа хөтлөх (AC-57-ийн зарчим — хоосон үйлдэл 0): холбогдох үүсгэх дэлгэц, эсвэл
 * нүүрнээс шууд зүрх илгээх (fw-3). Танихгүй түлхүүрт товч гарахгүй — «Болсон/Алгасах» л үлдэнэ.
 */
export type FirstWeekAction = { kind: 'route'; href: Href } | { kind: 'heart' };

const ACTIONS: Record<string, FirstWeekAction> = {
  'fw-1': { kind: 'route', href: '/memory-editor' },
  'fw-2': { kind: 'route', href: '/home/question' },
  'fw-3': { kind: 'heart' },
  'fw-4': { kind: 'route', href: '/together/letters/compose' },
  'fw-5': { kind: 'route', href: '/plans/library' },
  'fw-6': { kind: 'route', href: '/together/occasions/edit' },
  'fw-7': { kind: 'route', href: '/together/lists' },
};

const byId = new Map(data.items.map((item) => [item.id, item]));

/** `{partner}` орлуулгатай бичвэр; агуулгад байхгүй түлхүүр бол `null` (хуурамч бичвэр гаргахгүй). */
export function firstWeekContent(taskKey: string, locale: Locale, partnerName: string): FirstWeekContent | null {
  const item = byId.get(taskKey);
  if (!item) return null;
  const text = item[locale];
  return { id: item.id, day: item.day, title: text.title, body: text.body.split('{partner}').join(partnerName) };
}

export function firstWeekAction(taskKey: string): FirstWeekAction | null {
  return ACTIONS[taskKey] ?? null;
}

export const FIRST_WEEK_DAYS = 7;
