import { occasionCountdown, upcomingOccasions } from '@/domain/occasionCountdown';
import { todayIn } from '@/i18n/calendarDate';

describe('AC-103 ойн тоолуур хэрэглэгчийн бүсийн огноогоор', () => {
  // 2026-11-06T16:30Z: Улаанбаатарт 11-07 00:30, Токиод 11-07 01:30, Лондонд 11-06 16:30
  const now = new Date('2026-11-06T16:30:00Z');

  it('Asia/Tokyo: 18 хоногийн дараах ой «18 хоног үлдлээ», 3 хоногийн өмнөх «3 хоногийн өмнө»', () => {
    const today = todayIn('Asia/Tokyo', now);
    expect(today).toBe('2026-11-07');
    expect(occasionCountdown({ date: '2025-11-25', nextOn: '2026-11-25', recurring: true }, today)).toEqual({ kind: 'until', days: 18 });
    expect(occasionCountdown({ date: '2026-11-04', nextOn: '2026-11-04', recurring: false }, today)).toEqual({ kind: 'since', days: 3 });
    expect(occasionCountdown({ date: '2026-11-07', nextOn: '2026-11-07', recurring: false }, today)).toEqual({ kind: 'today' });
  });

  it('бүс өөр бол «өнөөдөр» өөр — Лондонд нэг хоногоор илүү үлдэнэ', () => {
    const london = todayIn('Europe/London', now);
    expect(occasionCountdown({ date: '2025-11-25', nextOn: '2026-11-25', recurring: true }, london)).toEqual({ kind: 'until', days: 19 });
  });

  it('Milestone Horizon: өнгөрөөгүй ойнуудаас ойрын 2', () => {
    const today = '2026-11-07';
    const items = [
      { key: 'c', date: '2026-12-01', nextOn: '2026-12-01', recurring: false },
      { key: 'past', date: '2026-11-01', nextOn: '2026-11-01', recurring: false },
      { key: 'a', date: '2025-11-07', nextOn: '2026-11-07', recurring: true },
      { key: 'b', date: '2026-11-20', nextOn: '2026-11-20', recurring: false },
    ];
    expect(upcomingOccasions(items, today, 2).map((i) => i.key)).toEqual(['a', 'b']);
  });
});
