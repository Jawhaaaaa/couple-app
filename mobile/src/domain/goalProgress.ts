/**
 * Зорилгын явц (FR-9.3, 9.4, AC-108) — серверийн `GoalService.progress`-тэй ижил томьёо:
 * мөнгөн зорилго (`targetAmountMnt`) бол Σ хандив / зорилт, үгүй бол дууссан алхам / нийт алхам;
 * 0–100, нэг оронтой. Optimistic шинэчлэл ба «хэн хэд»-д client тал тооцно.
 */
export interface GoalProgressInput {
  targetAmountMnt?: number | null;
  steps: readonly { done: boolean }[];
  contributions: readonly { userId: string; amountMnt: number }[];
}

export interface ContributorShare {
  userId: string;
  amount: number;
  /** Нийт хандивд эзлэх хувь (0–100, бүхэл). */
  sharePercent: number;
}

export interface GoalProgress {
  stepsDone: number;
  stepsTotal: number;
  /** Мөнгөн зорилго эсэх. */
  money: boolean;
  raised: number;
  target: number | null;
  percent: number;
  complete: boolean;
  /** «Хэн хэд» (AC-42, AC-108) — их хандивласан нь эхэнд. */
  shares: ContributorShare[];
}

export function progressPercent(target: number | null | undefined, raised: number, stepsDone: number, stepsTotal: number): number {
  let pct = 0;
  if (target != null && target > 0) pct = (raised * 100) / target;
  else if (stepsTotal > 0) pct = (stepsDone * 100) / stepsTotal;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

export function goalProgress(goal: GoalProgressInput): GoalProgress {
  const stepsDone = goal.steps.filter((s) => s.done).length;
  const stepsTotal = goal.steps.length;
  const byUser = new Map<string, number>();
  for (const c of goal.contributions) byUser.set(c.userId, (byUser.get(c.userId) ?? 0) + c.amountMnt);
  const raised = [...byUser.values()].reduce((a, b) => a + b, 0);
  const target = goal.targetAmountMnt != null && goal.targetAmountMnt > 0 ? goal.targetAmountMnt : null;
  const percent = progressPercent(target, raised, stepsDone, stepsTotal);
  const shares = [...byUser.entries()]
    .map(([userId, amount]) => ({ userId, amount, sharePercent: raised > 0 ? Math.round((amount * 100) / raised) : 0 }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));
  return { stepsDone, stepsTotal, money: target !== null, raised, target, percent, complete: percent >= 100, shares };
}

/** «2/4» (AC-108). */
export function stepsFraction(done: number, total: number): string {
  return `${done}/${total}`;
}

/** Дүнгийн оролт (₮): зөвхөн эерэг бүхэл тоо; хоосон зай, таслалыг үл тооно. Буруу бол `null`. */
export function parseAmount(raw: string): number | null {
  const digits = raw.replace(/[\s,']/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
