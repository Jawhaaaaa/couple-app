import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { resetServerClock, setServerClock } from '../support/clock';
import { linkedCouple } from '../support/couple';
import { apiJson, reloginApi, signInUi, type TestUser } from '../support/users';

/**
 * Шинэ хосын эхлэл (T-77, FR-16.3, FR-16.4): хоосон төлөвийн товч харгалзах ҮҮСГЭХ дэлгэцийг нээнэ
 * (AC-57), эхний 7 хоногийн даалгавар өдөрт нэг — дуусгахад ✨, «Алгасах», «Нуух», 8 дахь өдөр алга
 * (AC-134). Өдрүүдийг серверийн цагаар (`PUT /test/clock`) шилжүүлж апп-ыг дахин нээнэ.
 */
const DAY = 24 * 3600_000;
/** Хос холбогдох агшин — Улаанбаатарын 12:00 (хосын бүсээр 1 дэх өдөр). */
const START = new Date('2026-11-07T04:00:00Z');

async function reopenHome(page: Page) {
  await page.goto('/home');
  await expect(page.getByTestId('screen-S-20')).toBeVisible();
  await expect(page.getByTestId('heart-button')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

async function openDay(page: Page, day: number) {
  await setServerClock(new Date(START.getTime() + (day - 1) * DAY));
  await reopenHome(page);
}

async function expectTask(page: Page, day: number, title: string) {
  const card = page.getByTestId('first-week');
  await expect(card).toHaveCount(1);
  await expect(page.getByTestId('first-week-day')).toHaveText(`Эхний 7 хоног · ${day}/7 дэх өдөр`);
  await expect(page.getByTestId('first-week-title')).toHaveText(title);
}

async function firstWeekVisible(user: TestUser): Promise<boolean> {
  await reloginApi(user);
  return (await apiJson<{ visible: boolean }>(user, 'GET', '/me/first-week-tasks')).visible;
}

test.describe('Шинэ хосын эхлэл', () => {
  test.afterEach(async () => resetServerClock());

  test('AC-57 шинэ хос: дурсамж, чат, төлөвлөгөө, хамтдаа табын хоосон төлөвийн товч үүсгэх дэлгэцийг нээнэ', async ({ partnerA }) => {
    const page = partnerA.page;
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac57');
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();

    // Хоосон төлөв = ANIM-11 (маскот) + 1 өгүүлбэр + товч (`ScreenState`)
    // Дурсамж (S-30) → S-32 дурсамж нэмэх
    await page.getByTestId('tab-memories').click();
    const s30 = page.getByTestId('screen-S-30');
    await expect(s30.getByTestId('anim-ANIM-11')).toBeVisible();
    await s30.getByTestId('state-empty-action').click();
    await expect(page.getByTestId('screen-S-32')).toBeVisible();
    await expect(page.getByTestId('editor-pick')).toBeVisible();
    await page.goBack();
    await expect(s30).toBeVisible();

    // Чат (S-40) → мессежийн input идэвхтэй (focus)
    await page.getByTestId('tab-chat').click();
    const s40 = page.getByTestId('screen-S-40');
    await expect(s40.getByTestId('anim-ANIM-11')).toBeVisible();
    await s40.getByTestId('state-empty-action').click();
    await expect(page.getByTestId('composer-input')).toBeFocused();

    // Төлөвлөгөө (S-50) → S-54 болзоо үүсгэх
    await page.getByTestId('tab-plans').click();
    const s50 = page.getByTestId('screen-S-50');
    await expect(s50.getByTestId('anim-ANIM-11')).toBeVisible();
    await s50.getByTestId('state-empty-action').click();
    await expect(page.getByTestId('screen-S-54-form')).toBeVisible();
    await page.goBack();
    await expect(s50).toBeVisible();

    // Хамтдаа (S-60) — захидалгүй, зорилгогүй хэсгийн товч → S-66 захидал бичих, S-64 зорилго нэмэх
    await page.getByTestId('tab-together').click();
    const s60 = page.getByTestId('screen-S-60');
    await expect(s60.getByTestId('hub-letter-empty')).toBeVisible();
    await s60.getByTestId('hub-letter-write').click();
    await expect(page.getByTestId('screen-S-66')).toBeVisible();
    await page.goBack();
    await expect(s60).toBeVisible();
    await expect(s60.getByTestId('hub-goals-empty')).toBeVisible();
    await s60.getByTestId('hub-goal-add').click();
    await expect(page.getByTestId('screen-S-64-new')).toBeVisible();
  });

  test('AC-134 өдөрт нэг даалгавар: 1 дэх өдөр «Болсон» → ✨, 2 дахь «Алгасах», 3 дахь «Нуух» → дахин гарахгүй', async ({ partnerA }) => {
    const page = partnerA.page;
    await setServerClock(START);
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac134a');

    // 1 дэх өдөр
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await expectTask(page, 1, 'Эхний зураг');
    await page.getByTestId('first-week-done-button').click();
    await expect(page.getByTestId('first-week-done')).toHaveText(/^✨ /);
    await expect(page.getByTestId('first-week-skip')).toHaveCount(0);
    // Мөн өдөр дахин нээхэд ч мөн тэр даалгавар биелсэн хэвээр — шинэ даалгавар гарахгүй
    await reopenHome(page);
    await expectTask(page, 1, 'Эхний зураг');
    await expect(page.getByTestId('first-week-done')).toHaveText(/^✨ /);

    // 2 дахь өдөр — шинэ нэг даалгавар; «Алгасах» → алга, тэр өдөртөө дахин гарахгүй
    await openDay(page, 2);
    await expectTask(page, 2, 'Эхний асуулт');
    await page.getByTestId('first-week-skip').click();
    await expect(page.getByTestId('first-week')).toHaveCount(0);
    await reopenHome(page);
    await expect(page.getByTestId('first-week')).toHaveCount(0);

    // 3 дахь өдөр — «Нуух» → бүр мөсөн
    await openDay(page, 3);
    await expectTask(page, 3, 'Эхний зүрх');
    await page.getByTestId('first-week-hide').click();
    await expect(page.getByTestId('first-week')).toHaveCount(0);
    await openDay(page, 4);
    await expect(page.getByTestId('first-week')).toHaveCount(0);
    expect(await firstWeekVisible(a)).toBe(false);
  });

  test('AC-134 7 дахь өдөр сүүлийн даалгавар, 8 дахь өдөр карт алга', async ({ partnerB }) => {
    const page = partnerB.page;
    await setServerClock(START);
    const [, b] = await linkedCouple('Бат', partnerB.name, 'ac134b');
    await signInUi(page, b);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await expectTask(page, 1, 'Эхний зураг');

    await openDay(page, 7);
    await expectTask(page, 7, 'Эхний хамтын жагсаалт');
    await openDay(page, 8);
    await expect(page.getByTestId('first-week')).toHaveCount(0);
    expect(await firstWeekVisible(b)).toBe(false);
  });
});
