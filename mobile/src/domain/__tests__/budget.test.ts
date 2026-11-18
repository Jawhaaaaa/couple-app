import { budgetTotals, formatShares, isMonthKey, paidByPerson, sharePercents, shiftMonthKey } from '@/domain/budget';

describe('AC-97 болзооны төсөв', () => {
  it('төлөвлөсөн 200 000₮, бодит 230 000₮ (A 150 000, B 80 000) → «30 000₮ хэтэрсэн», «A 65% · B 35%»', () => {
    const expenses = [
      { payerId: 'A', amountMnt: 100_000 },
      { payerId: 'B', amountMnt: 80_000 },
      { payerId: 'A', amountMnt: 50_000 },
    ];
    const paid = paidByPerson(expenses, ['A', 'B']);
    expect(paid).toEqual([
      { userId: 'A', amount: 150_000 },
      { userId: 'B', amount: 80_000 },
    ]);
    const actual = paid.reduce((s, p) => s + p.amount, 0);
    expect(budgetTotals([{ plannedMnt: 200_000, actualMnt: actual }])).toEqual({ plannedTotal: 200_000, actualTotal: 230_000, overBy: 30_000 });
    expect(formatShares(sharePercents(paid), (id) => id)).toBe('A 65% · B 35%');
  });

  it('сарын нийт = болзоо бүрийн бодит зардлын нийлбэр; хэтрэлт мөр бүрээр (төлөвлөөгүйд 0)', () => {
    const lines = [
      { plannedMnt: 200_000, actualMnt: 230_000 },
      { plannedMnt: 100_000, actualMnt: 40_000 },
      { plannedMnt: null, actualMnt: 25_000 },
    ];
    expect(budgetTotals(lines)).toEqual({ plannedTotal: 300_000, actualTotal: 295_000, overBy: 30_000 });
  });

  it('хувь бүхэл, нийлбэр 100 (хамгийн их үлдэгдэл); зардалгүй бол 0%', () => {
    const three = sharePercents([
      { userId: 'A', amount: 1 },
      { userId: 'B', amount: 1 },
      { userId: 'C', amount: 1 },
    ]);
    expect(three.map((s) => s.percent)).toEqual([34, 33, 33]);
    expect(sharePercents([{ userId: 'A', amount: 0 }]).map((s) => s.percent)).toEqual([0]);
  });

  it('сар шилжүүлэх ба шалгах', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(isMonthKey('2026-11')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
  });
});
