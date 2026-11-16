import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { signInUi } from '../support/users';

/**
 * S-88 theme (T-81, §3.1, FR-18.2, AC-DS-03): «Бараан» → «Цайвар» → «Системийн» сонгоход хуудас дахин
 * ачаалагдахгүй (навигацийн stack ба өөр дэлгэцийн оролт хэвээр), ~300 ms cross-fade, «Системийн» нь
 * `prefers-color-scheme`-ийг (`page.emulateMedia`) шууд дагана.
 */
const RELOAD_MARKER = '__auraThemeMarker';

/** `theme-root`-ийн дэвсгэр өнгө (cross-fade давхаргаас хамаарахгүй — тухайн palette-ийн `bg`). */
function rootBg(page: Page) {
  return page.getByTestId('theme-root').first().evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** RGB-ийн гэрэлтэлт (0–255): бараан palette < 100, цайвар > 155. */
function luminance(color: string): number {
  const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function expectDark(page: Page) {
  await expect.poll(async () => luminance(await rootBg(page))).toBeLessThan(100);
}

async function expectLight(page: Page) {
  await expect.poll(async () => luminance(await rootBg(page))).toBeGreaterThan(155);
}

/**
 * Дараагийн cross-fade-ийн давхарга (`theme-crossfade`) DOM-д нэмэгдэж хасагдах хоорондын хугацааг (ms)
 * хөтөч дотор MutationObserver-оор хэмжинэ.
 */
async function armFadeProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __fade?: { added?: number; removed?: number } };
    w.__fade = {};
    const has = () => !!document.querySelector('[data-testid="theme-crossfade"]');
    const observer = new MutationObserver(() => {
      const f = w.__fade!;
      if (f.added === undefined && has()) f.added = performance.now();
      else if (f.added !== undefined && f.removed === undefined && !has()) {
        f.removed = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function fadeDuration(page: Page): Promise<number> {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __fade?: { removed?: number } }).__fade?.removed !== undefined), { timeout: 5_000 })
    .toBe(true);
  return page.evaluate(() => {
    const f = (window as unknown as { __fade: { added: number; removed: number } }).__fade;
    return f.removed - f.added;
  });
}

test.describe('S-88 theme', () => {
  test('AC-DS-03 Бараан → Цайвар → Системийн: дахин ачаалалгүй, ~300 ms cross-fade, prefers-color-scheme-ийг дагана', async ({ partnerA }) => {
    const page = partnerA.page;
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'acds03');
    await page.emulateMedia({ colorScheme: 'light' });
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();

    // Өөр дэлгэцийн оролт: S-40-ийн бичиж буй мессеж (илгээгээгүй)
    await page.getByTestId('tab-chat').click();
    await expect(page.getByTestId('screen-S-40')).toBeVisible();
    const draft = 'Theme солиход алга болохгүй ноорог';
    await page.getByTestId('composer-input').fill(draft);

    // S-40 → S-80 → S-88 (апп доторх навигаци — stack хуримтлагдана)
    await page.getByTestId('screen-S-40').getByTestId('topbar-avatar').click();
    await expect(page.getByTestId('screen-S-80')).toBeVisible();
    await page.getByTestId('settings-appearance').click();
    const s88 = page.getByTestId('screen-S-88');
    await expect(s88).toBeVisible();
    // Анхдагч «Бараан» (prefsStore) — дахин дарахад юу ч өөрчлөгдөхгүй
    await page.getByTestId('appearance-theme-mode-dark').click();
    await expectDark(page);

    // Хуудас дахин ачаалагдвал энэ тэмдэг алга болно
    await page.evaluate((key) => ((window as unknown as Record<string, string>)[key] = 'same-document'), RELOAD_MARKER);
    const url = page.url();

    // «Цайвар» — ~300 ms cross-fade
    await armFadeProbe(page);
    await page.getByTestId('appearance-theme-mode-light').click();
    await expectLight(page);
    const lightFade = await fadeDuration(page);
    expect(lightFade).toBeGreaterThanOrEqual(250);
    expect(lightFade).toBeLessThan(1_500);
    await expect(page.getByTestId('theme-crossfade')).toHaveCount(0);

    // «Системийн» — хөтчийн prefers-color-scheme (одоо light) → цайвар хэвээр; dark болгоход шууд бараан
    await page.getByTestId('appearance-theme-mode-system').click();
    await expectLight(page);
    await armFadeProbe(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectDark(page);
    const systemFade = await fadeDuration(page);
    expect(systemFade).toBeGreaterThanOrEqual(250);
    expect(systemFade).toBeLessThan(1_500);
    await page.emulateMedia({ colorScheme: 'light' });
    await expectLight(page);

    // Дахин ачаалагдаагүй: тэмдэг, URL, navigation stack, S-40-ийн оролт хэвээр
    expect(await page.evaluate((key) => (window as unknown as Record<string, string>)[key], RELOAD_MARKER)).toBe('same-document');
    expect(page.url()).toBe(url);
    await s88.getByTestId('stack-back').click();
    await expect(page.getByTestId('screen-S-80')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('screen-S-40')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toHaveValue(draft);
    expect(await page.evaluate((key) => (window as unknown as Record<string, string>)[key], RELOAD_MARKER)).toBe('same-document');
  });
});
