import { addDays, type CalendarDate, daysInMonth, parseCalendarDate, toCalendarDate, toEpochDay } from '@/i18n/calendarDate';

import { planDay, zonedToUtc } from './planTime';

/**
 * S-52 календарь (FR-7.3, AC-94): сар/долоо хоногийн тор (Даваа гарагаас), болзоотой
 * өдрүүдийн цэг. Огноо нь хэрэглэгчийн бүсийн өдөр (`planDay`), муж нь тухайн бүсийн
 * шөнө дундаас (UTC ISO) — Токиод байгаа хүнд Улаанбаатарын болзоо өөрийн өдөрт харагдана.
 */
export type CalendarMode = 'month' | 'week';

/** Даваа = 0 … Ням = 6 (1970-01-01 нь Пүрэв). */
export function weekdayIndex(date: CalendarDate): number {
  return (((toEpochDay(date) + 3) % 7) + 7) % 7;
}

export function startOfWeek(date: CalendarDate): CalendarDate {
  return addDays(date, -weekdayIndex(date));
}

export function weekOf(date: CalendarDate): CalendarDate[] {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export function firstOfMonth(date: CalendarDate): CalendarDate {
  const { year, month } = parseCalendarDate(date);
  return toCalendarDate({ year, month, day: 1 });
}

/** Сарын тор: долоо хоног бүр 7 өдөр, өмнөх/дараах сарын өдрөөр дүүргэнэ. */
export function monthGrid(date: CalendarDate): CalendarDate[][] {
  const { year, month } = parseCalendarDate(date);
  const first = toCalendarDate({ year, month, day: 1 });
  const last = toCalendarDate({ year, month, day: daysInMonth(year, month) });
  const weeks: CalendarDate[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

export function shiftMonth(date: CalendarDate, delta: number): CalendarDate {
  const { year, month } = parseCalendarDate(date);
  const total = year * 12 + (month - 1) + delta;
  return toCalendarDate({ year: Math.floor(total / 12), month: (total % 12) + 1, day: 1 });
}

export function sameMonth(a: CalendarDate, b: CalendarDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Харагдах мужийн эхний ба сүүлийн өдөр. */
export function visibleDays(mode: CalendarMode, anchor: CalendarDate): CalendarDate[] {
  return mode === 'week' ? weekOf(anchor) : monthGrid(anchor).flat();
}

/** `GET /plans?from&to` — эхний өдрийн 00:00-оос сүүлийн өдрийн дараах 00:00 хүртэл (бүсээр). */
export function rangeFor(mode: CalendarMode, anchor: CalendarDate, timeZone: string): { from: string; to: string } {
  const days = visibleDays(mode, anchor);
  return { from: zonedToUtc(days[0], '00:00', timeZone), to: zonedToUtc(addDays(days[days.length - 1], 1), '00:00', timeZone) };
}

/** Болзоог хэрэглэгчийн бүсийн өдрөөр бүлэглэнэ (цэг ба өдрийн жагсаалт). */
export function groupByDay<T extends { startsAt: string }>(plans: T[], timeZone: string): Record<CalendarDate, T[]> {
  const out: Record<CalendarDate, T[]> = {};
  for (const p of [...plans].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const day = planDay(p.startsAt, timeZone);
    (out[day] ??= []).push(p);
  }
  return out;
}
