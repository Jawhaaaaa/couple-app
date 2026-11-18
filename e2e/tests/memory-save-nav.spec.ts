import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { confirmStartDate, linkedCouple } from '../support/couple';
import { makeJpeg } from '../support/memories';
import { signInUi, type TestUser } from '../support/users';

/**
 * AC-198 (DEV_TEST 216-ийн регресс): S-32-оос хадгалсны дараах шилжилт эцсийн байна.
 * Firefox-д 39 хадгалалтаас 1 нь S-31 нээгдэж эхлээд ~0.2 с-ийн дараа хэрэглэгчийн үйлдэлгүйгээр
 * Нүүр рүү буцдаг байв: modal-ыг хаах нь вэбэд `history.go(-1)` бөгөөд expo-router түүний `popstate`-ийг
 * 100 мс л хүлээдэг, хожуу ирсэн нь «Буцах» мэт уншигддаг. Нэг хадгалалт уналтыг барихгүй тул
 * Нүүрээс ≥ 40 удаа (+ Timeline-аас) давтаж, хадгалсны дараа 1 с хүлээгээд S-31 хэвээр,
 * URL өөрчлөгдөөгүй, хөтчийн «Буцах» нь editor-ыг нээсэн дэлгэц рүү буцаахыг (history stack зөв) шалгана.
 */
const HOME_ROUNDS = 40;
const TIMELINE_ROUNDS = 10;
const S31_URL = /\/memories\/[0-9a-f-]{36}(\?.*)?$/;

test.describe('AC-198 S-32 хадгалсны дараа S-31 эцсийн (давталт)', () => {
  let a: TestUser;

  test.beforeAll(async () => {
    const [x, y] = await linkedCouple('Бат', 'Ану', 'savenav');
    await confirmStartDate(x, y, '2025-02-14');
    a = x;
  });

  async function saveAndStay(page: Page, jpeg: Buffer, label: string) {
    await expect(page.getByTestId('screen-S-32'), `${label}: S-32`).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('editor-pick').click();
    await (await chooser).setFiles([{ name: `${label}.jpg`, mimeType: 'image/jpeg', buffer: jpeg }]);
    await expect(page.getByTestId('editor-media-0')).toBeVisible();
    await page.getByTestId('editor-title').fill(label);

    const urls: string[] = [];
    const onNav = (frame: { url(): string; parentFrame(): unknown }) => {
      if (!frame.parentFrame()) urls.push(new URL(frame.url()).pathname);
    };
    page.on('framenavigated', onNav);
    try {
      await page.getByTestId('editor-save').click();
      await expect(page.getByTestId('screen-S-31'), `${label}: хадгалсны дараа S-31`).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('memory-title')).toHaveText(label);
      await expect(page).toHaveURL(S31_URL);
      const reached = page.url();
      // Хожуу popstate S-31-ийг дарж буцаадаг байсан цонх (~0.2 с) — хангалттай илүү хүлээнэ
      await page.waitForTimeout(1_000);
      expect(page.url(), `${label}: 1 с-ийн дараа URL хэвээр (дараалал: ${urls.join(' → ')})`).toBe(reached);
      await expect(page.getByTestId('screen-S-31'), `${label}: 1 с-ийн дараа S-31 хэвээр`).toBeVisible();
      await expect(page.getByTestId('memory-title')).toHaveText(label);
    } finally {
      page.off('framenavigated', onNav);
    }
  }

  test('Нүүрээс 40 удаа, Timeline-аас 10 удаа — S-31 хэвээр, «Буцах» нээсэн дэлгэц рүү', async ({ page }) => {
    test.setTimeout(1_200_000);
    await signInUi(page, a);
    const jpeg = await makeJpeg(page);

    await page.goto('/home');
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    for (let i = 1; i <= HOME_ROUNDS; i += 1) {
      await page.getByTestId('home-quick-memory').click();
      await saveAndStay(page, jpeg, `Нүүрээс ${i}`);
      // history stack: [Нүүр, S-31] — editor-ын entry үлдээгүй, «Буцах» Нүүр рүү
      await page.goBack();
      await expect(page.getByTestId('screen-S-20'), `Нүүрээс ${i}: «Буцах» → S-20`).toBeVisible();
      await expect(page).toHaveURL(/\/home$/);
    }

    await page.getByTestId('tab-memories').click();
    await expect(page.getByTestId('screen-S-30')).toBeVisible();
    for (let i = 1; i <= TIMELINE_ROUNDS; i += 1) {
      await page.getByTestId('memories-fab').click();
      await saveAndStay(page, jpeg, `Timeline-аас ${i}`);
      await page.goBack();
      await expect(page.getByTestId('screen-S-30'), `Timeline-аас ${i}: «Буцах» → S-30`).toBeVisible();
    }
  });
});
