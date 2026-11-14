/**
 * Болзооны төсөв (FR-7.7, AC-97) — backend `BudgetSummaryService`-тэй ижил тооцоо:
 * сарын бодит нийт = тухайн сарын болзоонуудын бодит зардлын нийлбэр; хэтэрсэн = бодит −
 * төлөвлөсөн (төлөвлөсөнтэй мөр бүрээр, сөрөг бол 0); хувь нь төлсөн дүнгийн хувь
 * (хамгийн их үлдэгдлийн аргаар бүхэл тоо, нийлбэр 100).
 */
export interface BudgetLineLike {
  plannedMnt: number | null;
  actualMnt: number;
}

export interface Share {
  userId: string;
  amount: number;
  percent: number;
}

export interface BudgetTotals {
  plannedTotal: number;
  actualTotal: number;
  overBy: number;
}

export function lineOverBy(line: BudgetLineLike): number {
  return line.plannedMnt == null ? 0 : Math.max(0, line.actualMnt - line.plannedMnt);
}

export function budgetTotals(lines: BudgetLineLike[]): BudgetTotals {
  return lines.reduce<BudgetTotals>(
    (acc, l) => ({
      plannedTotal: acc.plannedTotal + (l.plannedMnt ?? 0),
      actualTotal: acc.actualTotal + l.actualMnt,
      overBy: acc.overBy + lineOverBy(l),
    }),
    { plannedTotal: 0, actualTotal: 0, overBy: 0 },
  );
}

/** Төлсөн дүнгээр хувь (бүхэл, нийлбэр 100). Бүх дүн 0 бол бүгд 0%. */
export function sharePercents(paid: { userId: string; amount: number }[]): Share[] {
  const total = paid.reduce((s, p) => s + p.amount, 0);
  if (total <= 0) return paid.map((p) => ({ ...p, percent: 0 }));
  const raw = paid.map((p) => (p.amount * 100) / total);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - floors[i] })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return paid.map((p, i) => ({ ...p, percent: floors[i] }));
}

/** Зардлуудыг төлсөн хүнээр нэгтгэнэ (`order` — харуулах дараалал: би, хамтрагч). */
export function paidByPerson(expenses: { payerId: string; amountMnt: number }[], order: string[] = []): { userId: string; amount: number }[] {
  const sums = new Map<string, number>(order.map((id) => [id, 0]));
  for (const e of expenses) sums.set(e.payerId, (sums.get(e.payerId) ?? 0) + e.amountMnt);
  return [...sums].map(([userId, amount]) => ({ userId, amount }));
}

/** «Бат 65% · Ану 35%». */
export function formatShares(shares: Share[], nameOf: (userId: string) => string): string {
  return shares.map((s) => `${nameOf(s.userId)} ${s.percent}%`).join(' · ');
}

/** `YYYY-MM` сар. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function isMonthKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

export function shiftMonthKey(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const total = year * 12 + (m - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

