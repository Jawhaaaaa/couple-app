import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { apiAs, apiJson, createVerifiedUser, signInUi } from '../support/users';

/**
 * S-22 Өдрийн асуулт (T-29, FR-3.5, AC-15): A хариулсны дараа B-гийн хариулт A-д царцсан;
 * A-гийн хариулт B-д ямар ч API-д байхгүй (INV-04); B хариулмагц хоёуланд ANIM-19-тэй нээгдэнэ.
 */
interface DailyQuestion {
  coupleDay: string;
  question: { id: string; textMn: string };
  myAnswer: { text: string } | null;
  partnerAnswered: boolean;
  partnerAnswer?: { text: string };
}

test.describe('Өдрийн асуулт', () => {
  test('AC-15 A хариулна → B-гийнх A-д бүдгэрсэн, A-гийнх B-гийн API-д 0 → B хариулмагц хоёуланд ANIM-19', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac15');
    const answerA = `Анхны болзоо — ${Date.now().toString(36)}`;
    const answerB = `Кино үзсэн — ${Date.now().toString(36)}`;

    // Хоёуланд ижил асуулт (SD-02)
    const qa = await apiJson<DailyQuestion>(a, 'GET', '/questions/today');
    const qb = await apiJson<DailyQuestion>(b, 'GET', '/questions/today');
    expect(qb.question.id).toBe(qa.question.id);
    expect(qb.coupleDay).toBe(qa.coupleDay);

    // A: S-22-оор хариулна
    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/home/question');
    await expect(partnerA.page.getByTestId('screen-S-22')).toBeVisible();
    await expect(partnerA.page.getByTestId('question-text')).toHaveText(qa.question.textMn);
    await partnerA.page.getByTestId('question-input').fill(answerA);
    await partnerA.page.getByTestId('question-submit').click();
    await expect(partnerA.page.getByTestId('question-my-answer')).toContainText(answerA);
    await expect(partnerA.page.getByTestId('question-partner-waiting')).toContainText(`${partnerB.name} хариулахыг хүлээж байна`);

    // B-гийн аль ч API-д A-гийн хариулт байхгүй (INV-04)
    for (const path of ['/questions/today', '/questions/history', '/dashboard']) {
      const raw = await (await apiAs(b, 'GET', path)).text();
      expect(raw).not.toContain(answerA);
    }
    const forB = await apiJson<DailyQuestion>(b, 'GET', '/questions/today');
    expect(forB.partnerAnswered).toBe(true);
    expect(forB).not.toHaveProperty('partnerAnswer');

    // B: хариулахаас өмнө A-гийнх царцсан; хариулмагц ANIM-19
    await signInUi(partnerB.page, b);
    await partnerB.page.goto('/home/question');
    await expect(partnerB.page.getByTestId('question-partner-hidden')).toBeVisible();
    await expect(partnerB.page.getByText(answerA)).toHaveCount(0);
    await partnerB.page.getByTestId('question-input').fill(answerB);
    await partnerB.page.getByTestId('question-submit').click();

    await expect(partnerB.page.getByTestId('anim-ANIM-19')).toBeAttached();
    await expect(partnerB.page.getByTestId('question-partner-answer')).toHaveText(answerA);

    // A: `question.revealed` (WebSocket) → ANIM-19-өөр тодорно
    await expect(partnerA.page.getByTestId('anim-ANIM-19')).toBeAttached({ timeout: 10_000 });
    await expect(partnerA.page.getByTestId('question-partner-answer')).toHaveText(answerB);
    await expect(partnerA.page.getByTestId('question-partner-waiting')).toHaveCount(0);
  });

  test('AC-15 хосгүй хэрэглэгч — S-22 урилга руу чиглүүлнэ', async ({ page }) => {
    const solo = await createVerifiedUser('Ганц', 'ac15solo');
    await signInUi(page, solo);
    await page.goto('/home/question');
    await expect(page.getByTestId('question-solo')).toBeVisible();
    await page.getByTestId('question-solo-invite').click();
    await expect(page.getByTestId('screen-S-13')).toBeVisible();
  });
});
