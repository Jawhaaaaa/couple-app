import { expect, type Locator, type Page, test } from '@playwright/test';

import { confirmStartDate, linkedCouple } from '../support/couple';
import { makeJpeg } from '../support/memories';
import { signInUi, type TestUser } from '../support/users';

/**
 * AC-198 (NFR-08, GAP-21): S-20-оос үндсэн 5 үйлдэл (зүрх илгээх, дурсамж нэмэх, мессеж илгээх,
 * болзоо санал болгох, check-in) тус бүрийг гүйцэтгэхэд ≤ 3 товшилт; гол товч (S-20 дээрх эхлэх товч ба
 * үйлдлийг дуусгах товч — илгээх, хадгалах) 390×844 дэлгэцийн доод 2/3-д (төв нь y ≥ 281). Завсрын
 * сонголт (зураг сонгох, түвшин) товшилтод тоологдох боловч байрлалыг нь шаардахгүй. Текст бичих нь
 * товшилт биш.
 */
const HEIGHT = 844;
const TOP_THIRD = HEIGHT / 3;

test.use({ viewport: { width: 390, height: HEIGHT } });

class TapCounter {
  taps: string[] = [];
  constructor(private page: Page) {}

  private async check(locator: Locator, name: string, main: boolean) {
    await expect(locator).toBeVisible();
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    expect(box, `${name}: хэмжээ`).not.toBeNull();
    this.taps.push(name);
    if (!main) return;
    expect.soft(box!.y + box!.height / 2, `${name}: товчны төв доод 2/3-д (y ≥ ${Math.round(TOP_THIRD)})`).toBeGreaterThanOrEqual(TOP_THIRD);
  }

  /** `main` — гол товч (байрлалыг шалгана); завсрын сонголт бол false. */
  async tap(locator: Locator, name: string, main = true) {
    await this.check(locator, name, main);
    await locator.click();
  }

  /** Файл сонгох товч — системийн цонхонд файлыг өгнө. */
  async pick(locator: Locator, name: string, file: { name: string; mimeType: string; buffer: Buffer }) {
    await this.check(locator, name, false);
    const chooser = this.page.waitForEvent('filechooser');
    await locator.click();
    await (await chooser).setFiles([file]);
  }

  async home() {
    await this.page.goto('/home');
    await expect(this.page.getByTestId('screen-S-20')).toBeVisible();
    this.taps = [];
  }

  done(action: string) {
    expect(this.taps.length, `${action}: ${this.taps.join(' → ')}`).toBeLessThanOrEqual(3);
  }
}

test.describe('AC-198 нэг гараар — үндсэн үйлдэл ≤ 3 товшилт', () => {
  let a: TestUser;

  test.beforeAll(async () => {
    const [x, y] = await linkedCouple('Бат', 'Ану', 'onehand');
    await confirmStartDate(x, y, '2025-02-14');
    a = x;
  });

  test('S-20-оос 5 үйлдэл, товч бүр доод 2/3-д', async ({ page }) => {
    test.setTimeout(120_000);
    await signInUi(page, a);
    const c = new TapCounter(page);

    await test.step('зүрх илгээх', async () => {
      await c.home();
      await c.tap(page.getByTestId('heart-button'), 'heart-button');
      await expect(page.getByTestId('heart-sent')).toBeVisible();
      c.done('зүрх');
    });

    await test.step('дурсамж нэмэх', async () => {
      await c.home();
      await c.tap(page.getByTestId('home-quick-memory'), 'home-quick-memory');
      await expect(page.getByTestId('screen-S-32')).toBeVisible();
      await c.pick(page.getByTestId('editor-pick'), 'editor-pick', { name: 'one-hand.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(page) });
      await page.getByTestId('editor-title').fill('Нэг гараар');
      await c.tap(page.getByTestId('editor-save'), 'editor-save');
      await expect(page.getByTestId('screen-S-31')).toBeVisible({ timeout: 30_000 });
      c.done('дурсамж');
    });

    await test.step('мессеж илгээх', async () => {
      await c.home();
      await c.tap(page.getByTestId('tab-chat'), 'tab-chat');
      await page.getByTestId('composer-input').fill('Нэг гараар илгээв');
      await c.tap(page.getByTestId('composer-send'), 'composer-send');
      await expect(page.getByTestId('message-text').filter({ hasText: 'Нэг гараар илгээв' })).toBeVisible();
      c.done('мессеж');
    });

    await test.step('болзоо санал болгох', async () => {
      await c.home();
      await c.tap(page.getByTestId('home-quick-plan'), 'home-quick-plan');
      await expect(page.getByTestId('screen-S-54-form')).toBeVisible();
      await page.getByTestId('plan-form-title').fill('Кино үзэх');
      await c.tap(page.getByTestId('plan-form-submit'), 'plan-form-submit');
      await expect(page.getByTestId('screen-S-54-form')).toHaveCount(0, { timeout: 15_000 });
      c.done('болзоо');
    });

    await test.step('check-in', async () => {
      await c.home();
      await c.tap(page.getByTestId('home-quick-checkin'), 'home-quick-checkin');
      await expect(page.getByTestId('screen-S-69')).toBeVisible();
      await c.tap(page.getByTestId('checkin-level-4'), 'checkin-level-4', false);
      await c.tap(page.getByTestId('checkin-save'), 'checkin-save');
      await expect(page.getByTestId('checkin-message')).toBeVisible();
      c.done('check-in');
    });
  });
});
