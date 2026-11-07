import type { TFunction } from 'i18next';

import { formatTime } from '@/i18n/format';
import type { Locale } from '@/stores/prefsStore';

/**
 * Хамтрагчийн орон нутгийн цаг ба бүсийн зөрүү (FR-3.2, AC-14). Сервер `PersonCard`-д
 * `utcOffsetMinutes` (тухайн хүний одоогийн UTC зөрүү, DST-тэй) ба `offsetFromMeMinutes`-ийг
 * өгнө; цагийг төхөөрөмжийн бүсээс үл хамааран энэ зөрүүгээр л тооцно — цаг явсаар байхад
 * дахин татахгүйгээр шинэчлэгдэнэ.
 */

/** `utcOffsetMinutes` бүсийн одоогийн цаг (mn — 24 цаг, en — 12 цаг). */
export function localClock(utcOffsetMinutes: number, now: Date | number, locale: Locale): string {
  const shifted = new Date((typeof now === 'number' ? now : now.getTime()) + utcOffsetMinutes * 60_000);
  return formatTime(shifted, locale, 'UTC');
}

export interface OffsetParts {
  sign: '+' | '−' | '';
  hours: number;
  minutes: number;
}

export function offsetParts(offsetFromMeMinutes: number): OffsetParts {
  const abs = Math.abs(offsetFromMeMinutes);
  return {
    sign: offsetFromMeMinutes > 0 ? '+' : offsetFromMeMinutes < 0 ? '−' : '',
    hours: Math.floor(abs / 60),
    minutes: abs % 60,
  };
}

/** «+1 цаг», «−2 цаг», «+5 цаг 30 мин», «ижил цаг». */
export function formatOffset(offsetFromMeMinutes: number, t: TFunction): string {
  if (offsetFromMeMinutes === 0) return t('home.offset.same');
  const { sign, hours, minutes } = offsetParts(offsetFromMeMinutes);
  if (minutes === 0) return t('home.offset.hours', { sign, hours });
  if (hours === 0) return t('home.offset.minutes', { sign, minutes });
  return t('home.offset.hoursMinutes', { sign, hours, minutes });
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
}

/** `at` хүртэлх хугацаа (өнгөрсөн бол `null`) — уулзалт, болзооны тоолуур (AC-74). */
export function countdownTo(at: string | Date, now: Date | number): Countdown | null {
  const target = typeof at === 'string' ? Date.parse(at) : at.getTime();
  const diff = target - (typeof now === 'number' ? now : now.getTime());
  if (!(diff > 0)) return null;
  const totalMinutes = Math.floor(diff / 60_000);
  return { days: Math.floor(totalMinutes / 1440), hours: Math.floor((totalMinutes % 1440) / 60), minutes: totalMinutes % 60 };
}

/** «3 өдөр 5 цаг» · «5 цаг 12 мин» · «12 мин». */
export function formatCountdown(c: Countdown, t: TFunction): string {
  if (c.days > 0) return t('home.countdown.daysHours', { days: c.days, hours: c.hours });
  if (c.hours > 0) return t('home.countdown.hoursMinutes', { hours: c.hours, minutes: c.minutes });
  return t('home.countdown.minutes', { minutes: c.minutes });
}
