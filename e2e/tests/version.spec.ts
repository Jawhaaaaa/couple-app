import { expect, type BrowserContext, type Page } from '@playwright/test';

import { suppressPwaPrompts, test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { signInUi } from '../support/users';

/**
 * «Шинэ хувилбар бэлэн» (T-83, FR-17.5, AC-141): серверийн хувилбарын мэдээлэл (`GET /version` —
 * `version.json`-ийн эх) апп-аас шинэ бол S-20 ба S-91-д карт; товшвол татах хуудас (DEV) нээгдэнэ.
 *
 * Тестийн backend-ийн `latest` нь апп-ын хувилбартай тэнцүү (анхдагч 1.0.0) тул эхлээд карт байхгүйг
 * шалгаад, дараа нь серверийн хариуг `context.route`-оор шинэ хувилбар болгоно (backend-ийн орчны хувьсагч
 * солихгүйгээр). Хариу нь гэрээний `VersionInfo` хэлбэртэй.
 *
 * Service worker-ийг энэ context-д хаана: SW-ээр дамжсан fetch-ийг WebKit/Firefox-д Playwright-ийн route
 * барьдаггүй, SW нь мөн ижил origin-ий навигацийг (татах хуудасны орлуулга) app shell-ээр хариулдаг.
 * SW-ийн шинэчлэл (T-83) энэ AC-д хамаарахгүй — тусдаа spec-тэй.
 */
const LATEST = '9.4.0';
const DOWNLOAD_PATH = '/__e2e-download';

async function serveNewerVersion(context: BrowserContext, downloadUrl: string) {
  await context.route('**/api/v1/version?**', async (route) => {
    const res = await route.fetch();
    const real = (await res.json()) as Record<string, unknown>;
    await route.fulfill({
      response: res,
      json: { ...real, latest: LATEST, updateAvailable: true, updateRequired: false, downloadUrl, storeUrl: null },
    });
  });
  // DEV-ийн татах хуудас (S-99)-ыг орлох энгийн хуудас
  await context.route(`**${DOWNLOAD_PATH}`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Aura татах</title><h1>Aura татах хуудас</h1>' }),
  );
}

async function expectDownloadOpens(page: Page, button: string, downloadUrl: string) {
  const popup = page.context().waitForEvent('page');
  await page.getByTestId(button).click();
  const opened = await popup;
  await opened.waitForLoadState();
  expect(opened.url()).toBe(downloadUrl);
  await expect(opened.getByRole('heading', { name: 'Aura татах хуудас' })).toBeVisible();
  await opened.close();
}

test.describe('Шинэ хувилбар', () => {
  test('AC-141 серверийн хувилбар шинэ бол S-20 ба S-91-д «Шинэ хувилбар бэлэн» — товшвол татах хуудас', async ({ browser, contextOptions }) => {
    const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' });
    await suppressPwaPrompts(context);
    const page = await context.newPage();
    const [a] = await linkedCouple('Бат', 'Ану', 'ac141');
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();

    // Серверийн хувилбар апп-тай тэнцүү — карт гарахгүй (апп `GET /version?current=`-ийг дуудсаны дараа)
    const currentVersion = () =>
      page.evaluate(() => {
        const entry = performance.getEntriesByType('resource').find((e) => e.name.includes('/api/v1/version?'));
        return entry ? new URL(entry.name).searchParams.get('current') : null;
      });
    await expect.poll(currentVersion).toMatch(/^\d+\.\d+\.\d+$/);
    const current = (await currentVersion())!;
    await expect(page.getByTestId('heart-button')).toBeVisible();
    await expect(page.getByTestId('home-update')).toHaveCount(0);

    const downloadUrl = new URL(DOWNLOAD_PATH, page.url()).toString();
    await serveNewerVersion(context, downloadUrl);
    await page.reload();

    // S-20
    const home = page.getByTestId('home-update');
    await expect(home).toBeVisible();
    await expect(home.getByText('Шинэ хувилбар бэлэн')).toBeVisible();
    await expect(page.getByTestId('home-update-body')).toHaveText(`Aura ${LATEST} гарлаа (танайх ${current}). Шинэчлээд шинэ боломжуудыг туршаарай.`);
    await expectDownloadOpens(page, 'home-update-open', downloadUrl);

    // S-91 (S-20 → S-80 → «Aura-гийн тухай»)
    await page.getByTestId('screen-S-20').getByTestId('topbar-avatar').click();
    await expect(page.getByTestId('screen-S-80')).toBeVisible();
    await page.getByTestId('settings-about').click();
    await expect(page.getByTestId('screen-S-91')).toBeVisible();
    await expect(page.getByTestId('about-version')).toHaveText(current);
    const about = page.getByTestId('about-update');
    await expect(about).toBeVisible();
    await expect(about.getByText('Шинэ хувилбар бэлэн')).toBeVisible();
    await expect(page.getByTestId('about-update-body')).toContainText(`Aura ${LATEST} гарлаа`);
    await expectDownloadOpens(page, 'about-update-open', downloadUrl);
    await context.close();
  });
});
