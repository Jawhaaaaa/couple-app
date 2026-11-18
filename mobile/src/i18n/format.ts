import type { DateFormat, Locale } from '@/stores/prefsStore';

import { type CalendarDate, type DateParts, parseCalendarDate } from './calendarDate';

const pad = (n: number) => String(n).padStart(2, '0');

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Цагтай агшинг тухайн бүсийн огнооны хэсэг болгоно. */
function instantParts(value: Date, timeZone?: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function toParts(value: Date | CalendarDate, timeZone?: string): DateParts {
  return typeof value === 'string' ? parseCalendarDate(value) : instantParts(value, timeZone);
}

/**
 * Огноог тоон хэлбэрээр (FR-18.2, AC-139): `YMD_DOT` 2026.11.07 · `DMY_SLASH`
 * 07/11/2026 · `MDY_SLASH` 11/07/2026. Цаггүй огноо (`YYYY-MM-DD`) бүсээр шилжихгүй.
 */
export function formatDate(value: Date | CalendarDate, pattern: DateFormat, timeZone?: string): string {
  const { year, month, day } = toParts(value, timeZone);
  switch (pattern) {
    case 'YMD_DOT':
      return `${year}.${pad(month)}.${pad(day)}`;
    case 'DMY_SLASH':
      return `${pad(day)}/${pad(month)}/${year}`;
    case 'MDY_SLASH':
      return `${pad(month)}/${pad(day)}/${year}`;
  }
}

/** Урт хэлбэр (NFR-10, AC-199): «2026 оны 11 сарын 7» · «November 7, 2026». */
export function formatDateLong(value: Date | CalendarDate, locale: Locale, timeZone?: string): string {
  const { year, month, day } = toParts(value, timeZone);
  return locale === 'mn' ? `${year} оны ${month} сарын ${day}` : `${EN_MONTHS[month - 1]} ${day}, ${year}`;
}

/** Цаг:минут, хүний бүсээр (mn — 24 цаг, en — 12 цаг). */
export function formatTime(value: Date, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale === 'mn' ? 'en-GB' : 'en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: locale === 'en',
  }).format(value);
}

/** Мянгатыг зайгаар (mn: «1 000», таслагдахгүй зай U+00A0) эсвэл таслалаар (en: «1,000»). */
export function formatNumber(value: number, locale: Locale, fractionDigits = 0): string {
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [int, frac] = fixed.split('.');
  const sep = locale === 'mn' ? ' ' : ',';
  const dec = locale === 'mn' ? ',' : '.';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return `${value < 0 ? '−' : ''}${grouped}${frac ? dec + frac : ''}`;
}

/** Мөнгөн дүн төгрөгөөр: «230 000₮». */
export function formatMoney(value: number, locale: Locale): string {
  return `${formatNumber(value, locale)}₮`;
}
