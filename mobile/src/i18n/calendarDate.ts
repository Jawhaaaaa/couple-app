/**
 * Цаггүй огноо (төрсөн өдөр, ой, эхэлсэн өдөр — FR-15.2). `YYYY-MM-DD` мөр хэлбэрээр
 * л хадгалж тооцоолно: `Date` объект руу хөрвүүлбэл цагийн бүсээр нэг өдөр
 * шилждэг (AC-132). Энд байгаа бүх тооцоо UTC-ийн өдрийн дугаараар.
 */
export type CalendarDate = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function parseCalendarDate(value: string): DateParts {
  const m = RE.exec(value);
  if (!m) throw new Error(`Огнооны формат буруу: ${value}`);
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) {
    throw new Error(`Байхгүй огноо: ${value}`);
  }
  return parts;
}

export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== 'string') return false;
  try {
    parseCalendarDate(value);
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function toCalendarDate({ year, month, day }: DateParts): CalendarDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Эпохоос хойших өдрийн дугаар (UTC-ийн өдөр — бүсээс хамаарахгүй). */
export function toEpochDay(value: CalendarDate): number {
  const { year, month, day } = parseCalendarDate(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function fromEpochDay(epochDay: number): CalendarDate {
  const d = new Date(epochDay * 86_400_000);
  return toCalendarDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function addDays(value: CalendarDate, days: number): CalendarDate {
  return fromEpochDay(toEpochDay(value) + days);
}

/** `b − a` өдрөөр. */
export function diffDays(a: CalendarDate, b: CalendarDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Тухайн IANA бүсийн «өнөөдөр» (жишээ нь Токиод 00:30 бол Улаанбаатарт өмнөх өдөр). */
export function todayIn(timeZone: string, now: Date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return toCalendarDate({ year: get('year'), month: get('month'), day: get('day') });
}
