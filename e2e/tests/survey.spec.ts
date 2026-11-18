import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { resetServerClock, setServerClock } from '../support/clock';
import { linkedCouple } from '../support/couple';
import { apiJson, reloginApi, signInUi } from '../support/users';

/**
 * S-20-ийн нэг асуулттай санал асуулга (T-95, E1 §7, GAP-17, AC-207): «Энэ апп бидэнд ойр байх мэдрэмж
 * өгдөг» — 30 хоногт ≤ 1 удаа, алгасах боломжтой. Серверийн цагийг (`PUT /test/clock`) урагшлуулж
 * апп-ыг дахин нээх нь «30 хоногийн дотор апп нээх»-ийг орлоно.
 */
const DAY = 24 * 3600_000;
const START = new Date('2026-11-07T04:00:00Z');
const STATEMENT = 'Энэ апп бидэнд ойр байх мэдрэмж өгдөг';

async function reopenHome(page: Page) {
  await page.goto('/home');
  await expect(page.getByTestId('screen-S-20')).toBeVisible();
  // Нүүрний өгөгдөл (`GET /dashboard`) серверээс ирсэн — зүрхний товч гарна
  await expect(page.getByTestId('heart-button')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

test.describe('Санал асуулга', () => {
  test.afterEach(async () => resetServerClock());

  test('AC-207 S-20-ийн асуулт 30 хоногт ≤ 1: алгасахад 29 дэх өдөр гарахгүй, 31 дэх өдөр дахин; хариулсны дараа алга', async ({ partnerA }) => {
    const page = partnerA.page;
    await setServerClock(START);
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac207');

    // 1 дэх нээлт — асуулт гарна, «Алгасах»
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    const card = page.getByTestId('survey-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('survey-statement')).toHaveText(STATEMENT);
    for (const score of [1, 2, 3, 4, 5]) await expect(page.getByTestId(`survey-score-${score}`)).toBeVisible();
    await page.getByTestId('survey-skip').click();
    await expect(card).toHaveCount(0);

    // Мөн өдөр дахин нээхэд гарахгүй
    await reopenHome(page);
    await expect(card).toHaveCount(0);

    // 29 хоногийн дараа — 30 хоногийн цонх дотор, гарахгүй
    await setServerClock(new Date(START.getTime() + 29 * DAY));
    await reopenHome(page);
    await expect(card).toHaveCount(0);

    // 31 хоногийн дараа — дахин нэг удаа гарна; оноо өгөхөд алга
    await setServerClock(new Date(START.getTime() + 31 * DAY));
    await reopenHome(page);
    await expect(card).toBeVisible();
    await page.getByTestId('survey-score-4').click();
    await expect(card).toHaveCount(0);
    await reopenHome(page);
    await expect(card).toHaveCount(0);

    // Сервер ч мөн адил: хариулсны дараа `survey.due` биш
    await reloginApi(a);
    const dashboard = await apiJson<{ survey?: { due: boolean } | null }>(a, 'GET', '/dashboard');
    expect(dashboard.survey?.due ?? false).toBe(false);
  });
});
