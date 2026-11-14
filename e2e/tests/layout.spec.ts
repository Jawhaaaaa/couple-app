import { expect, test } from '@playwright/test';

import { linkedCouple } from '../support/couple';
import { signInUi, type TestUser } from '../support/users';

/** AC-192: утас (390×844) — доод 5 таб; таблет — доод таб; вэб ≥ 1024 px — зүүн навигаци. */
const TABS = ['Нүүр', 'Дурсамж', 'Чат', 'Төлөвлөгөө', 'Хамтдаа'];

test.describe('AC-192 өргөнөөр layout', () => {
  let a: TestUser;
  test.beforeAll(async () => {
    [a] = await linkedCouple('Бат', 'Ану', 'layout');
  });
  // Табууд нэвтэрсэн хэрэглэгчид л (сессгүй бол S-03 руу, AC-56)
  test.beforeEach(async ({ page }) => {
    await signInUi(page, a);
  });

  test('утсанд доод навигаци 5 таб', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');
    const bar = page.getByTestId('bottom-tabs');
    await expect(bar).toBeVisible();
    for (const label of TABS) await expect(bar.getByRole('tab', { name: label })).toBeVisible();
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(844 - 120);
  });

  test('вэб ≥ 1024 px-д зүүн талын навигаци', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Вэбийн өргөн дэлгэц зөвхөн desktop профайлд');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/home');
    const nav = page.getByTestId('sidebar-nav');
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box!.x).toBeLessThan(10);
    expect(box!.height).toBeGreaterThan(600);
    await expect(page.getByTestId('bottom-tabs')).toHaveCount(0);
  });

  test('таб солиход дэлгэц солигдоно (ANIM-10)', async ({ page }) => {
    await page.goto('/home');
    await page.getByTestId('tab-chat').click();
    await expect(page.getByTestId('screen-S-40')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Чат', selected: true })).toBeVisible();
  });
});
