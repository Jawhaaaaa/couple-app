import { type CalendarDate, daysInMonth, isCalendarDate, parseCalendarDate, toCalendarDate } from '@/i18n/calendarDate';

/**
 * Төрсөн огноо ба 18+ шалгалт (§2-6, FR-1.1, AC-04). Backend-ийн `requireAdult`-тай
 * ижил: 18 насны өдрөөсөө эхлэн зөвшөөрнө — 2026-11-07-нд 2008-11-07 ✓, 2008-11-08 ✗.
 * 2-р сарын 29-нд төрсөн бол Java-гийн `plusYears` шиг 2-р сарын 28 руу шилжинэ.
 * «Өнөөдөр»-ийг `todayIn(бүс)`-ээр (`@/i18n/calendarDate`) авна.
 */
export const MIN_AGE = 18;

/** `YYYY-MM-DD` + N жил (сарын сүүлийн өдрөөр хязгаарлана). */
export function plusYears(date: CalendarDate, years: number): CalendarDate {
  const { year, month, day } = parseCalendarDate(date);
  const y = year + years;
  return toCalendarDate({ year: y, month, day: Math.min(day, daysInMonth(y, month)) });
}

/** 18 нас хүрсэн эсэх. Огноо хүчингүй бол false. */
export function isAdult(birthDate: CalendarDate, today: CalendarDate): boolean {
  if (!isCalendarDate(birthDate)) return false;
  return plusYears(birthDate, MIN_AGE) <= today;
}

export type BirthDateIssue = 'incomplete' | 'invalid' | 'underage';

/** Оруулсан огнооны алдаа (байхгүй бол `null`). */
export function birthDateIssue(birthDate: CalendarDate | null, today: CalendarDate): BirthDateIssue | null {
  if (!birthDate) return 'incomplete';
  if (!isCalendarDate(birthDate) || birthDate > today || parseCalendarDate(birthDate).year < 1900) return 'invalid';
  if (!isAdult(birthDate, today)) return 'underage';
  return null;
}

/**
 * Гараар бичсэн цифрийг `ОООО.СС.ӨӨ` маск болгоно (8 цифр хүртэл) — хэрэглэгч
 * цэг бичих шаардлагагүй.
 */
export function maskBirthDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

/** Маскласан утгыг `YYYY-MM-DD` болгоно; 8 цифр биш бол `null`. */
export function parseBirthDateInput(masked: string): CalendarDate | null {
  const digits = masked.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}
