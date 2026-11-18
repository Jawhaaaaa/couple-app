import { type CalendarDate, compareCalendarDates, diffDays, isCalendarDate } from '@/i18n/calendarDate';

/**
 * Ойн тоолуур (FR-8.3, AC-103): «18 хоног үлдлээ», «3 хоногийн өмнө», «Өнөөдөр» — хэрэглэгчийн
 * бүсийн «өнөөдөр»-өөр (INV-08: ой цаггүй огноо, бүсээр шилжихгүй). Давтагдах ойд дараагийн
 * тохиолдол (`nextOn`), давталтгүй өнгөрсөн ойд анхны огноо хүртэлх хоног.
 */
export type Countdown = { kind: 'today' } | { kind: 'until'; days: number } | { kind: 'since'; days: number };

export function occasionCountdown(o: { nextOn: CalendarDate; date: CalendarDate; recurring: boolean }, today: CalendarDate): Countdown {
  const target = o.recurring || !isCalendarDate(o.date) ? o.nextOn : o.date;
  const days = diffDays(today, target);
  if (days === 0) return { kind: 'today' };
  return days > 0 ? { kind: 'until', days } : { kind: 'since', days: -days };
}

/** Ойртож буй ой (Milestone Horizon): өнөөдрөөс хойших, ойрынхоос нь. */
export function upcomingOccasions<T extends { nextOn: CalendarDate; date: CalendarDate; recurring: boolean }>(items: T[], today: CalendarDate, limit: number): T[] {
  return items
    .filter((o) => occasionCountdown(o, today).kind !== 'since')
    .sort((a, b) => compareCalendarDates(a.nextOn, b.nextOn))
    .slice(0, limit);
}
