import { expect, type BrowserContext, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { expectAnim, recordAnims } from '../support/anims';
import { confirmStartDate, linkedCouple } from '../support/couple';
import { signInUi } from '../support/users';

/**
 * Вэбийн орлуулга (T-86, FR-19.7): haptic ба дуу (AC-217). ANIM-01 «Зүрх илгээх» нь haptic
 * `impactMedium` × 2 (`motion/anims.ts`) → вэбэд `navigator.vibrate([20, 110, 20])`.
 * (а) Android Chrome — `navigator.vibrate` дуудагдана; (б) iOS Safari (vibrate байхгүй) — haptic-ийн
 * оронд тод дүрслэл (`HapticFlash`, `haptic-visual`). S-88 «Дуу» анхдагч унтраастай, асаахад
 * `HTMLAudioElement.play` дуудагдана (`motion/sound.ts`).
 *
 * Хөтчийн чичиргээ/дууг тестэд мэдрэх боломжгүй тул `addInitScript`-ээр API-г ажиглана:
 * (а)-д `navigator.vibrate`-ийг бүртгэгчээр (Chromium-д эх функцийг ч дуудна), (б)-д iOS Safari шиг
 * огт байхгүй болгоно — гурван хөтөч бүрт хоёр орчныг тодорхой үүсгэнэ.
 */
type VibrateMode = 'android-chrome' | 'ios-safari';

interface Feedback {
  vibrations: number[][];
  sounds: string[];
  visualSeen: boolean;
}

function observeFeedback(mode: VibrateMode) {
  const w = window as unknown as { __feedback?: Feedback };
  const fb: Feedback = { vibrations: [], sounds: [], visualSeen: false };
  w.__feedback = fb;
  const nav = Navigator.prototype as unknown as { vibrate?: (p: number | number[]) => boolean };
  const original = typeof nav.vibrate === 'function' ? nav.vibrate : null;
  Object.defineProperty(Navigator.prototype, 'vibrate', {
    configurable: true,
    writable: true,
    value:
      mode === 'android-chrome'
        ? function (this: Navigator, pattern: number | number[]) {
            fb.vibrations.push(Array.isArray(pattern) ? [...pattern] : [pattern]);
            return original ? original.call(this, pattern) : true;
          }
        : undefined,
  });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    fb.sounds.push(this.currentSrc || this.src);
    // Автоматаар тоглуулах бодлогын алдааг апп өөрөө барина — ажиглалт л хэрэгтэй
    return play.call(this).catch(() => undefined);
  };
  new MutationObserver(() => {
    if (document.querySelector('[data-testid="haptic-visual"]')) fb.visualSeen = true;
  }).observe(document, { subtree: true, childList: true });
}

async function feedback(page: Page): Promise<Feedback> {
  return page.evaluate(() => (window as unknown as { __feedback: Feedback }).__feedback);
}

async function openHome(page: Page, context: BrowserContext, mode: VibrateMode, prefix: string) {
  const [a, b] = await linkedCouple('Бат', 'Ану', prefix);
  await confirmStartDate(a, b, '2025-02-14');
  await recordAnims(context);
  await context.addInitScript(observeFeedback, mode);
  await signInUi(page, a);
  await expect(page.getByTestId('heart-button')).toBeVisible();
  return a;
}

/** ANIM-01: S-20-ийн «Зүрх илгээх». */
async function sendHeart(page: Page) {
  await page.getByTestId('heart-button').click();
  await expectAnim(page, 'ANIM-01', { reduced: false });
}

const ANIM_01_PATTERN = [20, 110, 20];

test.describe('AC-217 haptic ба дууны вэб орлуулга', () => {
  test('AC-217 (а) Android Chrome: ANIM-01 өдөөхөд navigator.vibrate дуудагдана, тод дүрслэлгүй', async ({ page, context }) => {
    await openHome(page, context, 'android-chrome', 'ac217a');
    await sendHeart(page);
    await expect.poll(async () => (await feedback(page)).vibrations).toEqual([ANIM_01_PATTERN]);
    const fb = await feedback(page);
    expect(fb.visualSeen).toBe(false);
    // «Дуу» анхдагч унтраастай
    expect(fb.sounds).toEqual([]);
  });

  test('AC-217 (б) iOS Safari (vibrate байхгүй): ANIM-01 өдөөхөд haptic-ийн оронд тод дүрслэл', async ({ page, context }) => {
    await openHome(page, context, 'ios-safari', 'ac217b');
    expect(await page.evaluate(() => typeof (navigator as unknown as { vibrate?: unknown }).vibrate)).toBe('undefined');
    await sendHeart(page);
    await expect.poll(async () => (await feedback(page)).visualSeen, { message: 'haptic-visual (тод хүрээ) гарсангүй' }).toBe(true);
    // Хүрээ нь богино — өөрөө арилна, хүрэлтийг хаахгүй
    await expect(page.getByTestId('haptic-visual')).toHaveCount(0, { timeout: 3_000 });
    expect((await feedback(page)).vibrations).toEqual([]);
  });

  test('AC-217 S-88 «Дуу» анхдагч унтраастай — асаахаас өмнө ANIM-01 чимээгүй, асаасны дараа дуу тоглоно', async ({ page, context }) => {
    await openHome(page, context, 'ios-safari', 'ac217s');
    await sendHeart(page);
    await expect.poll(async () => (await feedback(page)).visualSeen).toBe(true);
    expect((await feedback(page)).sounds).toEqual([]);

    await page.goto('/settings/appearance');
    await expect(page.getByTestId('screen-S-88')).toBeVisible();
    const sound = page.getByTestId('appearance-sound').getByRole('switch');
    await expect(sound).not.toBeChecked();
    await sound.click();
    await expect(sound).toBeChecked();
    // Асаахад жишээ дуу (ANIM-03 «pop»)
    await expect.poll(async () => (await feedback(page)).sounds.some((s) => /pop/.test(s))).toBe(true);

    // Тохиргоо хадгалагдсан — нүүрийг дахин нээхэд ч асаалттай
    await page.goto('/home');
    await expect(page.getByTestId('heart-button')).toBeVisible();
    const before = (await feedback(page)).sounds.length;
    await sendHeart(page);
    await expect
      .poll(async () => (await feedback(page)).sounds.slice(before), { message: 'ANIM-01-ийн дуу (heart) тоглосонгүй' })
      .toEqual([expect.stringMatching(/heart/)]);
  });
});
