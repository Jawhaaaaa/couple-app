import { averageMood, buildMoodDays, moodRange, moodSegments } from '@/domain/moodChart';
import { addDays } from '@/i18n/calendarDate';

const today = '2026-11-14';

describe('AC-115 сэтгэлийн графикийн өгөгдөл', () => {
  const { from, to } = moodRange(today, 'month');
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(from, i));
  const series = {
    mine: days30.map((d, i) => ({ localDate: d, level: (i % 5) + 1, shared: false })),
    partner: days30.filter((_, i) => i % 3 === 0).map((d) => ({ localDate: d, level: 4, shared: true })),
  };

  it('сар = 30 өдөр, улирал = 90 өдөр (өнөөдрийг оруулаад)', () => {
    expect(moodRange(today, 'month')).toEqual({ from: '2026-10-16', to: today });
    expect(moodRange(today, 'quarter')).toEqual({ from: '2026-08-17', to: today });
  });

  it('A-гийн өдөр бүр; B-гийн 10 хуваалцсан өдөр л, бусад өдөр хоосон (null)', () => {
    const days = buildMoodDays(series, from, to);
    expect(days).toHaveLength(30);
    expect(days.every((d) => d.mine !== null)).toBe(true);
    expect(days.filter((d) => d.partner !== null)).toHaveLength(10);
    expect(days[1].partner).toBeNull();
    expect(days[0].partner).toBe(4);
  });

  it('хоосон өдөр шугамыг таслана — B-гийн 10 цэг тус бүр тусдаа хэсэг; A нэг үргэлжилсэн шугам', () => {
    const days = buildMoodDays(series, from, to);
    const box = { width: 300, height: 120, padX: 10, padY: 10 };
    const mine = moodSegments(days, 'mine', box);
    const partner = moodSegments(days, 'partner', box);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toHaveLength(30);
    expect(partner).toHaveLength(10);
    expect(partner.flat()).toHaveLength(10);
    expect(mine[0][0]).toMatchObject({ x: 10, y: 110 });
    expect(mine[0][4]).toMatchObject({ level: 5, y: 10 });
    expect(mine[0][29].x).toBe(290);
  });

  it('хуваалцаагүй (shared=false) хамтрагчийн мөр ирсэн ч зурагдахгүй; дундаж', () => {
    const days = buildMoodDays({ mine: [], partner: [{ localDate: today, level: 2, shared: false }] }, from, to);
    expect(days.every((d) => d.partner === null)).toBe(true);
    expect(averageMood(days, 'partner')).toBeNull();
    expect(averageMood(buildMoodDays(series, from, to), 'partner')).toBe(4);
  });
});
