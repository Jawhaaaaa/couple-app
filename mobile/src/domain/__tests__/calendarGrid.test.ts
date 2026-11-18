import { groupByDay, monthGrid, rangeFor, shiftMonth, weekdayIndex, weekOf } from '@/domain/calendarGrid';

describe('AC-94 S-52 календарийн тор', () => {
  it('Даваа гарагаас эхэлсэн 7 хоногийн тор, сарын бүх өдрийг багтаана', () => {
    const grid = monthGrid('2026-11-14');
    expect(weekdayIndex('2026-11-02')).toBe(0);
    expect(grid[0][0]).toBe('2026-10-26');
    expect(grid.flat()).toContain('2026-11-01');
    expect(grid.flat()).toContain('2026-11-30');
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[grid.length - 1][6]).toBe('2026-12-06');
  });

  it('долоо хоног ба сар шилжүүлэх', () => {
    expect(weekOf('2026-11-14')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(shiftMonth('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01');
  });

  it('муж нь хэрэглэгчийн бүсийн шөнө дундаас (UTC)', () => {
    expect(rangeFor('week', '2026-11-14', 'Asia/Ulaanbaatar')).toEqual({ from: '2026-11-08T16:00:00Z', to: '2026-11-15T16:00:00Z' });
  });

  it('болзоог хэрэглэгчийн бүсийн өдрөөр бүлэглэнэ (Токиод шөнө дунд шилжинэ)', () => {
    const plans = [
      { id: 'b', startsAt: '2026-11-14T15:30:00Z' },
      { id: 'a', startsAt: '2026-11-14T11:30:00Z' },
    ];
    expect(Object.keys(groupByDay(plans, 'Asia/Ulaanbaatar'))).toEqual(['2026-11-14']);
    expect(groupByDay(plans, 'Asia/Ulaanbaatar')['2026-11-14'].map((p) => p.id)).toEqual(['a', 'b']);
    expect(groupByDay(plans, 'Asia/Tokyo')['2026-11-15'].map((p) => p.id)).toEqual(['b']);
  });
});
