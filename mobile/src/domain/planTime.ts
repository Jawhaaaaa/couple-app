import { addDays, type CalendarDate, diffDays, parseCalendarDate, todayIn, toCalendarDate } from '@/i18n/calendarDate';

/**
 * Болзооны цаг (FR-15.2, INV-08, AC-34): сервер UTC-ээр хадгална; хэрэглэгч өөрийн бүсээр
 * оруулж, өөрийн бүсээр харна. 2026-11-14 19:30 Asia/Ulaanbaatar → `2026-11-14T11:30:00Z`
 * → Токиод 20:30. Бүх хөрвүүлэлт `Intl`-ээр (DST-тэй бүсэд ч зөв).
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value.trim());
}

/** `at` агшинд тухайн бүсийн UTC-ээс зөрөх зөрүү (мс). */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Секундгүй ISO (`2026-11-14T11:30:00Z`). */
function toIso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Бүсийн огноо + «HH:mm» → UTC ISO (AC-34). */
export function zonedToUtc(date: CalendarDate, time: string, timeZone: string): string {
  const { year, month, day } = parseCalendarDate(date);
  const m = TIME_RE.exec(time.trim());
  if (!m) throw new Error(`Цагийн формат буруу: ${time}`);
  const guess = Date.UTC(year, month - 1, day, Number(m[1]), Number(m[2]));
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  return toIso(second);
}

/** UTC агшныг бүсийн огноо ба «HH:mm» болгоно (засварын маягт, календарийн өдөр). */
export function utcToZoned(iso: string, timeZone: string): { date: CalendarDate; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: toCalendarDate({ year: get('year'), month: get('month'), day: get('day') }),
    time: `${pad(get('hour') % 24)}:${pad(get('minute'))}`,
  };
}

/** Болзоо хэрэглэгчийн бүсээр аль өдөрт таарах вэ. */
export function planDay(startsAt: string, timeZone: string): CalendarDate {
  return utcToZoned(startsAt, timeZone).date;
}

/** Цаг агаарын таамгийн цонх (FR-7.12, §8.4): өнөөдрөөс 14 хоног хүртэл. */
export const FORECAST_DAYS = 14;

/** Болзоо таамгийн цонхонд байгаа эсэх (AC-100): 0…14 хоногийн дараа. */
export function inForecastWindow(startsAt: string, now: number, timeZone: string): boolean {
  const days = diffDays(todayIn(timeZone, new Date(now)), planDay(startsAt, timeZone));
  return days >= 0 && days <= FORECAST_DAYS;
}

/** Таамгийг зөвхөн цонх дотор харуулна (AC-100): 20 хоногийн дараах болзоонд цаг агаар 0. */
export function visibleForecast<T>(plan: { startsAt: string; weather?: T | null }, now: number, timeZone: string): T | null {
  if (!plan.weather) return null;
  return inForecastWindow(plan.startsAt, now, timeZone) ? plan.weather : null;
}

/** Болзоо өнгөрсөн эсэх («Дурсамж болгох», AC-95). */
export function isPast(startsAt: string, now: number): boolean {
  return Date.parse(startsAt) < now;
}

/** S-54-ийн маягтын анхдагч огноо — маргааш (бүсээр). */
export function tomorrowIn(timeZone: string, now: number): CalendarDate {
  return addDays(todayIn(timeZone, new Date(now)), 1);
}

