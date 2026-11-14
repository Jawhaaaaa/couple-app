import { goalProgress, parseAmount, progressPercent, stepsFraction } from '@/domain/goalProgress';

const steps = (done: number, total: number) => Array.from({ length: total }, (_, i) => ({ done: i < done }));

describe('AC-108 зорилгын явц', () => {
  it('4 алхамтай зорилго, 2 алхам дууссан → «2/4», 50%', () => {
    const p = goalProgress({ targetAmountMnt: null, steps: steps(2, 4), contributions: [] });
    expect(stepsFraction(p.stepsDone, p.stepsTotal)).toBe('2/4');
    expect(p.percent).toBe(50);
    expect(p.money).toBe(false);
  });

  it('мөнгөн зорилго 1 000 000₮, хандив 250 000 + 150 000 → 40%; «хэн хэд» нь хүн тутмын нийлбэр', () => {
    const p = goalProgress({
      targetAmountMnt: 1_000_000,
      steps: steps(2, 4),
      contributions: [
        { userId: 'A', amountMnt: 250_000 },
        { userId: 'B', amountMnt: 150_000 },
      ],
    });
    expect(p.percent).toBe(40);
    expect(p.raised).toBe(400_000);
    expect(p.money).toBe(true);
    expect(p.shares).toEqual([
      { userId: 'A', amount: 250_000, sharePercent: 63 },
      { userId: 'B', amount: 150_000, sharePercent: 38 },
    ]);
    expect(stepsFraction(p.stepsDone, p.stepsTotal)).toBe('2/4');
  });

  it('AC-42 нэг хүний олон хандив нэгтгэгдэнэ; 100%-иар хязгаарлагдаж complete', () => {
    const p = goalProgress({
      targetAmountMnt: 100,
      steps: [],
      contributions: [
        { userId: 'A', amountMnt: 60 },
        { userId: 'A', amountMnt: 70 },
      ],
    });
    expect(p.shares).toEqual([{ userId: 'A', amount: 130, sharePercent: 100 }]);
    expect(p.percent).toBe(100);
    expect(p.complete).toBe(true);
  });

  it('серверийн томьёотой ижил: алхамгүй, зорилтгүй бол 0; нэг оронтой бутархай', () => {
    expect(progressPercent(null, 0, 0, 0)).toBe(0);
    expect(progressPercent(null, 0, 1, 3)).toBe(33.3);
    expect(progressPercent(3, 2, 0, 0)).toBe(66.7);
  });

  it('дүнгийн оролт: зай, таслалтай эерэг бүхэл тоо л', () => {
    expect(parseAmount('250 000')).toBe(250_000);
    expect(parseAmount('1,000,000')).toBe(1_000_000);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('12.5')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});
