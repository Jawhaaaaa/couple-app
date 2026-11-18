import {
  type CalendarDate,
  type DateParts,
  addDays,
  compareCalendarDates,
  daysInMonth,
  diffDays,
  parseCalendarDate,
  toCalendarDate,
  toEpochDay,
} from '@/i18n/calendarDate';

/**
 * Хосын тоолуур ба ойн огноо (DD-AURA-019) — backend `CoupleCalendar`-тай ижил
 * утгатай цэвэр функц. Хоёр тал `date-cases.json` хүснэгтээр шалгагдана. Бүх тооцоо
 * `YYYY-MM-DD` мөр дээр (`Date` руу хөрвүүлэхгүй — бүсээр өдөр шилжихгүй, AC-132).
 *
 * - SD-01: эхэлсэн өдөр = 1 дэх өдөр — тоолуур = (өнөөдөр − эхэлсэн) + 1; эхлээгүй бол 0
 * - Задаргаа — Java `Period.between`-тэй ижил хуанлийн зөрүү «2 жил 0 сар 14 өдөр» (AC-69)
 * - «N хоног»-ийн ой = эхэлсэн + N − 1; «N жил» = эхэлсэн өдрийн N жилийн дараах ижил огноо
 * - SD-03: 02-29 → үсэрт бус жилд 02-28 (AC-38)
 */

export interface Breakdown {
  years: number;
  months: number;
  days: number;
}

/** Он, сарыг нэмээд өдрийг тухайн сарын сүүлээр хязгаарлана (Java `plusMonths`/`withYear`). */
function clampDay({ year, month, day }: DateParts): CalendarDate {
  return toCalendarDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

function plusMonths(date: CalendarDate, months: number): CalendarDate {
  const { year, month, day } = parseCalendarDate(date);
  const total = year * 12 + (month - 1) + months;
  return clampDay({ year: Math.floor(total / 12), month: (total % 12) + 1, day });
}

function plusYears(date: CalendarDate, years: number): CalendarDate {
  const parts = parseCalendarDate(date);
  return clampDay({ ...parts, year: parts.year + years });
}

function withYear(date: CalendarDate, year: number): CalendarDate {
  return clampDay({ ...parseCalendarDate(date), year });
}

/** SD-01 тоолуур: эхэлсэн өдөр нь 1 дэх өдөр; ирээдүйн эхлэл бол 0. */
export function counterDays(start: CalendarDate, today: CalendarDate): number {
  if (compareCalendarDates(today, start) < 0) return 0;
  return diffDays(start, today) + 1;
}

/** Хуанлийн зөрүү (Java `Period.between(start, today)`); ирээдүйн эхлэл бол 0 0 0. */
export function breakdown(start: CalendarDate, today: CalendarDate): Breakdown {
  if (compareCalendarDates(today, start) < 0) return { years: 0, months: 0, days: 0 };
  const a = parseCalendarDate(start);
  const b = parseCalendarDate(today);
  let totalMonths = b.year * 12 + b.month - (a.year * 12 + a.month);
  let days = b.day - a.day;
  if (totalMonths > 0 && days < 0) {
    totalMonths -= 1;
    days = toEpochDay(today) - toEpochDay(plusMonths(start, totalMonths));
  }
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days };
}

/** Тоолуур `n` болох өдөр (SD-01, SD-06): эхэлсэн + n − 1. */
export function dayMilestone(start: CalendarDate, n: number): CalendarDate {
  return addDays(start, n - 1);
}

/** Эхэлсэн өдрийн `years` жилийн ой (02-29 → үсэрт бус жилд 02-28). */
export function yearMilestone(start: CalendarDate, years: number): CalendarDate {
  return plusYears(start, years);
}

/** Жил бүр давтагдах огнооны `onOrAfter`-аас хойших хамгийн ойрын тохиолдол (SD-03). */
export function nextAnnual(date: CalendarDate, onOrAfter: CalendarDate): CalendarDate {
  if (compareCalendarDates(date, onOrAfter) >= 0) return date;
  const year = parseCalendarDate(onOrAfter).year;
  const candidate = withYear(date, year);
  return compareCalendarDates(candidate, onOrAfter) < 0 ? withYear(date, year + 1) : candidate;
}

/** Хоногийн ой (AC-102): 100, 200, 300, 365, 500, 1000, дараа нь 1000-аар. */
export const DAY_MILESTONES = [100, 200, 300, 365, 500, 1000] as const;

export interface NextMilestones {
  /** Дараагийн «N хоног» (өнөөдөр бол өнөөдөр). */
  days: { n: number; date: CalendarDate };
  /** Дараагийн жилийн ой. */
  anniversary: { years: number; date: CalendarDate };
}

/** S-21-ийн «дараагийн ой»: ойрын хоногийн ой ба жилийн ой (өнөөдөр бол өнөөдөр). */
export function nextMilestones(start: CalendarDate, today: CalendarDate): NextMilestones {
  const from = compareCalendarDates(today, start) < 0 ? start : today;
  let n: number | undefined = DAY_MILESTONES.find((m) => compareCalendarDates(dayMilestone(start, m), from) >= 0);
  if (n === undefined) {
    n = 2000;
    while (compareCalendarDates(dayMilestone(start, n), from) < 0) n += 1000;
  }
  let years = 1;
  while (compareCalendarDates(yearMilestone(start, years), from) < 0) years += 1;
  return { days: { n, date: dayMilestone(start, n) }, anniversary: { years, date: yearMilestone(start, years) } };
}
