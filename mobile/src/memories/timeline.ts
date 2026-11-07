import type { MemorySummary, MonthCount } from '@/api/queries/memories';
import type { Locale } from '@/stores/prefsStore';

export interface MonthSection {
  /** `2026-11` */
  key: string;
  year: number;
  month: number;
  /** Тухайн сарын нийт тоо (`/memories/months`), ачаалсан хэсгийнх биш (AC-80). */
  count: number;
  data: MemorySummary[];
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthOf(occurredOn: string): { year: number; month: number } {
  const [y, m] = occurredOn.split('-');
  return { year: Number(y), month: Number(m) };
}

/**
 * Timeline-ийг сараар бүлэглэнэ (FR-5.3, AC-80): серверийн эрэмбийг (огноо буурахаар)
 * хадгалж, дараалсан ижил сарын дурсамжийг нэг хэсэгт. Толгойн тоо `months`-оос; тэнд
 * байхгүй бол ачаалсан тоо.
 */
export function groupByMonth(items: MemorySummary[], months: MonthCount[] | undefined): MonthSection[] {
  const totals = new Map((months ?? []).map((m) => [`${m.year}-${m.month}`, m.count]));
  const sections: MonthSection[] = [];
  for (const item of items) {
    const { year, month } = monthOf(item.occurredOn);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    let last = sections[sections.length - 1];
    if (!last || last.key !== key) {
      last = { key, year, month, count: 0, data: [] };
      sections.push(last);
    }
    last.data.push(item);
  }
  for (const s of sections) s.count = Math.max(totals.get(`${s.year}-${s.month}`) ?? 0, s.data.length);
  return sections;
}

/** Толгойн `{{month}}` утга: mn — тоо («11»), en — нэр («November»). */
export function monthLabel(month: number, locale: Locale): string {
  return locale === 'en' ? EN_MONTHS[month - 1] : String(month);
}
