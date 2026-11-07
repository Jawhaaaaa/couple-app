import { addDays, diffDays, isCalendarDate, parseCalendarDate, todayIn } from '../calendarDate';
import { formatDate, formatDateLong } from '../format';

describe('AC-132 цаггүй огноо бүсээр шилжихгүй', () => {
  it('төрсөн өдөр Улаанбаатар ба Нью-Йоркт ижил огноогоор', () => {
    const birthday = '1995-03-15';
    // Огноо нь мөр хэлбэрээр л — бүсийн аргумент нөлөөлөхгүй
    expect(formatDate(birthday, 'YMD_DOT', 'Asia/Ulaanbaatar')).toBe('1995.03.15');
    expect(formatDate(birthday, 'YMD_DOT', 'America/New_York')).toBe('1995.03.15');
    expect(formatDateLong(birthday, 'mn', 'America/New_York')).toBe('1995 оны 3 сарын 15');
  });

  it('гэнэн Date хөрвүүлэлт шилждэгийг харуулж, бид түүнээс зайлсхийнэ', () => {
    const naive = new Date('1995-03-15T00:00:00Z');
    expect(formatDate(naive, 'YMD_DOT', 'America/New_York')).toBe('1995.03.14');
  });

  it('өдрийн тооцоо', () => {
    expect(diffDays('2024-10-24', '2026-11-07')).toBe(744);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('буруу огноог татгалзана', () => {
    expect(isCalendarDate('2025-02-29')).toBe(false);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(() => parseCalendarDate('2026/11/07')).toThrow();
  });

  it('бүсийн «өнөөдөр»', () => {
    const now = new Date('2026-11-06T16:30:00Z');
    expect(todayIn('Asia/Tokyo', now)).toBe('2026-11-07');
    expect(todayIn('Asia/Ulaanbaatar', now)).toBe('2026-11-07');
    expect(todayIn('America/New_York', now)).toBe('2026-11-06');
  });
});
