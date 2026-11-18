import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { apiJson, signInUi, type TestUser } from '../support/users';

/**
 * S-64 мөрөөдөл ба зорилго (T-59, T-60, FR-9.3, FR-15.1): мөнгөн зорилгод A хандив нэмэхэд хоёр талд
 * явц ба «хэн хэд» `goal.updated`-аар reload-гүй шинэчлэгдэнэ (AC-42); хоёулаа гарчгийг зөрүүтэй
 * засахад хоёр дахь хадгалагчид «миний / түүний хувилбар» (AC-131, INV-07).
 */
interface Goal {
  id: string;
  title: string;
  version: number;
}

/** Мянгатын тусгаарлагч нь NBSP (`formatNumber`, mn) — `\s` хоёуланг нь барина. */
const money = (digits: string) => digits.replace(/ /g, '\\s');

async function openGoal(page: Page, user: TestUser, goalId: string) {
  await signInUi(page, user);
  await page.goto(`/together/goals/${goalId}`);
  await expect(page.getByTestId('screen-S-64-detail')).toBeVisible();
  await expect(page.getByTestId('goal-title')).toBeVisible();
  // STOMP холболт тогтох хүртэл (`goal.updated`-ыг алдахгүй)
  await page.waitForLoadState('networkidle');
}

/** Хуудас дахин ачаалагдаагүйг батлах тэмдэг — reload/навигацид алга болно. */
async function markNoReload(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __noReload?: boolean }).__noReload = true;
  });
}

async function stillNoReload(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true), 'хуудас reload хийгдсэн').toBe(true);
}

test.describe('Зорилго', () => {
  // Хоёр context (хоёр хамтрагч) — WebKit-д нэвтрэх, WS холболт удаан тул анхдагч 60 с хүрэлцэхгүй байж болно
  test.describe.configure({ timeout: 120_000 });

  test('AC-42 A хандив нэмэхэд хоёр талд явц ба «хэн хэд» reload-гүй бодит цагаар', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac42');
    const goal = await apiJson<Goal>(a, 'POST', '/goals', { title: 'Хөвсгөлийн аялал', targetAmountMnt: 1_000_000, steps: ['Төлөвлөх'] });

    await openGoal(partnerA.page, a, goal.id);
    await openGoal(partnerB.page, b, goal.id);
    for (const page of [partnerA.page, partnerB.page]) {
      await expect(page.getByTestId('goal-percent')).toHaveText('0%');
      await expect(page.getByTestId('goal-shares-empty')).toBeVisible();
      await markNoReload(page);
    }

    // A хандив нэмнэ (UI)
    await partnerA.page.getByTestId('goal-contribution-input').fill('250000');
    await partnerA.page.getByTestId('goal-contribute').click();
    for (const page of [partnerA.page, partnerB.page]) {
      await expect(page.getByTestId('goal-percent')).toHaveText('25%');
      await expect(page.getByTestId('goal-raised')).toHaveText(new RegExp(`^${money('250 000')}₮ / ${money('1 000 000')}₮ цугларсан$`));
      await expect(page.getByTestId(`goal-share-${a.id}`)).toContainText(partnerA.name);
      await expect(page.getByTestId(`goal-share-${a.id}`)).toContainText(new RegExp(`${money('250 000')}₮ · 100%`));
      await expect(page.getByTestId('goal-shares-empty')).toHaveCount(0);
    }

    // B нэмэхэд A-д «хэн хэд» хоёулаа, хувь нь шинэчлэгдэнэ
    await partnerB.page.getByTestId('goal-contribution-input').fill('150000');
    await partnerB.page.getByTestId('goal-contribute').click();
    for (const page of [partnerA.page, partnerB.page]) {
      await expect(page.getByTestId('goal-percent')).toHaveText('40%');
      await expect(page.getByTestId(`goal-share-${a.id}`)).toContainText(new RegExp(`${money('250 000')}₮ · 63%`));
      await expect(page.getByTestId(`goal-share-${b.id}`)).toContainText(partnerB.name);
      await expect(page.getByTestId(`goal-share-${b.id}`)).toContainText(new RegExp(`${money('150 000')}₮ · 38%`));
      await stillNoReload(page);
    }
  });

  test('AC-131 зорилгын гарчгийг хоёулаа зөрүүтэй засахад хоёр дахь хадгалагчид «миний / түүний хувилбар»', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac131g');
    const goal = await apiJson<Goal>(a, 'POST', '/goals', { title: 'Байр авах', steps: ['Хуримтлуулах'] });

    await openGoal(partnerA.page, a, goal.id);
    await openGoal(partnerB.page, b, goal.id);
    // Хоёулаа засварын горимд зэрэг орно
    await partnerA.page.getByTestId('goal-title-edit').click();
    await partnerB.page.getByTestId('goal-title-edit').click();
    await partnerA.page.getByTestId('goal-title-input').fill('Хоёр өрөө байр');
    await partnerB.page.getByTestId('goal-title-input').fill('Гурван өрөө байр');

    await partnerA.page.getByTestId('goal-title-save').click();
    await expect(partnerA.page.getByTestId('goal-title')).toHaveText('Хоёр өрөө байр');

    // B хуучин хувилбараар хадгална → 409 → сонголт, A-гийнх чимээгүй дарагдахгүй
    await partnerB.page.getByTestId('goal-title-save').click();
    const sheet = partnerB.page.getByTestId('conflict-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(`${partnerA.name} үүнийг саяхан өөрчилжээ`);
    await expect(partnerB.page.getByTestId('conflict-mine')).toContainText('Миний хувилбар');
    await expect(partnerB.page.getByTestId('conflict-mine-title')).toHaveText('Гурван өрөө байр');
    await expect(partnerB.page.getByTestId('conflict-theirs')).toContainText('Түүний хувилбар');
    await expect(partnerB.page.getByTestId('conflict-theirs-title')).toHaveText('Хоёр өрөө байр');
    expect((await apiJson<Goal>(a, 'GET', `/goals/${goal.id}`)).title).toBe('Хоёр өрөө байр');

    // «Миний хувилбар» → B-гийнх хадгалагдаж A-д бодит цагаар
    await partnerB.page.getByTestId('conflict-keep-mine').click();
    await expect(sheet).toHaveCount(0);
    await expect(partnerB.page.getByTestId('goal-title')).toHaveText('Гурван өрөө байр');
    await expect(partnerA.page.getByTestId('goal-title')).toHaveText('Гурван өрөө байр');
    expect((await apiJson<Goal>(a, 'GET', `/goals/${goal.id}`)).title).toBe('Гурван өрөө байр');
  });
});
