import { addDays, type CalendarDate, diffDays } from '@/i18n/calendarDate';

/** Сэтгэл санааны түвшин 1–5 (FR-11.1). */
export const MOOD_LEVELS = [1, 2, 3, 4, 5] as const;
export type MoodRange = 'month' | 'quarter';
export const MOOD_RANGES: MoodRange[] = ['month', 'quarter'];
export const CHECKIN_NOTE_MAX = 280;

export interface CheckInPoint {
  localDate: string;
  level: number;
  shared?: boolean;
}

export interface MoodDay {
  date: CalendarDate;
  mine: number | null;
  /** Хамтрагчийн зөвхөн хуваалцсан өдөр; бусад нь хоосон (AC-115). */
  partner: number | null;
}

/** Сар — сүүлийн 30, улирал — сүүлийн 90 өдөр (өнөөдрийг оруулаад). */
export function moodRange(today: CalendarDate, range: MoodRange): { from: CalendarDate; to: CalendarDate } {
  const days = range === 'month' ? 30 : 90;
  return { from: addDays(today, -(days - 1)), to: today };
}

/**
 * Графикийн өдөр тутмын өгөгдөл (FR-11.3, AC-115): өөрийн өдөр бүр, хамтрагчийнх зөвхөн хуваалцсан
 * өдөр — хуваалцаагүй, хийгээгүй өдөр `null` (зурагдахгүй, таамаглаж нөхөхгүй).
 */
export function buildMoodDays(series: { mine: readonly CheckInPoint[]; partner: readonly CheckInPoint[] }, from: CalendarDate, to: CalendarDate): MoodDay[] {
  const mine = new Map(series.mine.map((c) => [c.localDate, c.level]));
  const partner = new Map(series.partner.filter((c) => c.shared !== false).map((c) => [c.localDate, c.level]));
  const count = diffDays(from, to) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const date = addDays(from, i);
    return { date, mine: mine.get(date) ?? null, partner: partner.get(date) ?? null };
  });
}

export interface ChartPoint {
  date: CalendarDate;
  level: number;
  x: number;
  y: number;
}

/**
 * Нэг цувааны цэгүүдийг дараалсан хэсгүүдэд (хоосон өдөр шугамыг таслана) хуваагаад SVG координат
 * болгоно. `x` — өдрийн байрлал, `y` — 5 дээр, 1 доор.
 */
export function moodSegments(
  days: readonly MoodDay[],
  key: 'mine' | 'partner',
  box: { width: number; height: number; padX: number; padY: number },
): ChartPoint[][] {
  const innerW = box.width - box.padX * 2;
  const innerH = box.height - box.padY * 2;
  const step = days.length > 1 ? innerW / (days.length - 1) : 0;
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];
  days.forEach((d, i) => {
    const level = d[key];
    if (level == null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ date: d.date, level, x: box.padX + step * i, y: box.padY + innerH * ((5 - level) / 4) });
  });
  if (current.length) segments.push(current);
  return segments;
}

/** Дундаж түвшин (нэг оронтой) — хоосон бол `null`. */
export function averageMood(days: readonly MoodDay[], key: 'mine' | 'partner'): number | null {
  const values = days.map((d) => d[key]).filter((v): v is number => v != null);
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}
