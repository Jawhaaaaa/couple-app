import cases from '../date-cases.json';
import { breakdown, counterDays, dayMilestone, nextAnnual, nextMilestones, yearMilestone } from '../dates';

/**
 * DD-AURA-019: backend `CoupleCalendarTest`-тэй ижил хүснэгт (`date-cases.json`).
 * Хүснэгтийн мөр бүр энд ч, тэнд ч шалгагдана — нэг тал өөрчлөгдвөл нөгөө нь унана.
 */
describe('AC-13 AC-69 хосын тоолуур ба задаргаа (date-cases.json)', () => {
  it('хүснэгт хоосон биш', () => {
    expect(cases.counter.length).toBeGreaterThanOrEqual(5);
    expect(cases.counter.some((c) => c.ac.includes('AC-13'))).toBe(true);
    expect(cases.counter.some((c) => c.ac.includes('AC-69'))).toBe(true);
  });

  it.each(cases.counter)('counter $start → $today: $days хоног, $years жил $months сар $dayPart өдөр ($ac)', (c) => {
    expect(counterDays(c.start, c.today)).toBe(c.days);
    expect(breakdown(c.start, c.today)).toEqual({ years: c.years, months: c.months, days: c.dayPart });
  });

  it('AC-13 2024-10-24 → 2026-11-07: огнооны зөрүү 744, тоолуур SD-01-ээр 745', () => {
    expect(counterDays('2024-10-24', '2026-11-07')).toBe(745);
  });

  it('AC-69 «2 жил 0 сар 14 өдөр»', () => {
    expect(breakdown('2024-10-24', '2026-11-07')).toEqual({ years: 2, months: 0, days: 14 });
  });
});

describe('ойн огноо (date-cases.json)', () => {
  it.each(cases.dayMilestone)('dayMilestone $start + $n → $date', (c) => {
    expect(dayMilestone(c.start, c.n)).toBe(c.date);
  });

  it.each(cases.yearMilestone)('yearMilestone $start + $years жил → $date', (c) => {
    expect(yearMilestone(c.start, c.years)).toBe(c.date);
  });

  it.each(cases.nextAnnual)('nextAnnual $date ≥ $onOrAfter → $next', (c) => {
    expect(nextAnnual(c.date, c.onOrAfter)).toBe(c.next);
  });
});

describe('S-21 дараагийн ой', () => {
  it('AC-69 2026-11-07-нд: 1000 хоног 2027-07-20, 3 жилийн ой 2027-10-24', () => {
    expect(nextMilestones('2024-10-24', '2026-11-07')).toEqual({
      days: { n: 1000, date: '2027-07-20' },
      anniversary: { years: 3, date: '2027-10-24' },
    });
  });

  it('ой яг өнөөдөр бол өнөөдрийг харуулна', () => {
    expect(nextMilestones('2024-10-24', '2025-01-31').days).toEqual({ n: 100, date: '2025-01-31' });
    expect(nextMilestones('2024-10-24', '2025-10-24').anniversary).toEqual({ years: 1, date: '2025-10-24' });
  });

  it('1000-аас хойш 1000-аар', () => {
    expect(nextMilestones('2020-01-01', '2026-11-07').days.n).toBe(3000);
  });
});
