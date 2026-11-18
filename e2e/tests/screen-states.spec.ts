import { expect, type Page, type Route } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { expectAnim, recordAnims } from '../support/anims';
import { confirmStartDate, linkedCouple } from '../support/couple';
import { signInUi } from '../support/users';

/**
 * Дэлгэц бүрийн заавал төлөв (Хавсралт А, AC-213, `ScreenState`, LLD §4.3 «Төлөв»): төлөөлөх
 * дэлгэцүүд дээр серверийг `page.route`-оор удаашруулж/унагаж, сүлжээг тасалж, зөвшөөрлөөс
 * татгалзана. S-36 Дуртай (`GET /memories?favorite=true`), S-37 Хогийн сав (`GET /memories/trash`),
 * S-20 Нүүр (кэш), S-32 Дурсамж нэмэх (байршлын зөвшөөрөл).
 */
const FAVORITES = /\/api\/v1\/memories\?.*favorite=true/;
const TRASH = /\/api\/v1\/memories\/trash(\?|$)/;
/**
 * `ScreenState`-ийн ачаалж буй/хоосон төлөв нь `AnimatedMoment` (ANIM-16 / ANIM-11) дотор тул вэбэд
 * `data-testid` нь `anim-ANIM-16` / `anim-ANIM-11` (`state-loading`/`state-empty`-ийг дардаг).
 */
const LOADING = 'anim-ANIM-16';
const EMPTY = 'anim-ANIM-11';

/** `ScreenState`-ийн тэмдэглэгээ DOM-д анх орсон агшин (`performance.now()`). */
function recordStates() {
  const w = window as unknown as { __stateSeen?: Record<string, number> };
  if (w.__stateSeen) return;
  const seen: Record<string, number> = {};
  w.__stateSeen = seen;
  new MutationObserver(() => {
    for (const id of ['anim-ANIM-16', 'state-loading-slow', 'anim-ANIM-11', 'state-error']) {
      if (seen[id] === undefined && document.querySelector(`[data-testid="${id}"]`)) seen[id] = performance.now();
    }
  }).observe(document, { subtree: true, childList: true });
}

async function stateTimes(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => ({ ...((window as unknown as { __stateSeen?: Record<string, number> }).__stateSeen ?? {}) }));
}

async function delayed(route: Route, ms: number) {
  await new Promise((r) => setTimeout(r, ms));
  await route.continue();
}

/** Нэвтэрч нүүр (S-20) ачаалагдтал — дараагийн дэлгэцүүд апп доторх навигациар. */
async function signedIn(page: Page, prefix: string) {
  const [a, b] = await linkedCouple('Бат', 'Ану', prefix);
  await confirmStartDate(a, b, '2025-05-01');
  await signInUi(page, a);
  await expect(page.getByTestId('screen-S-20')).toBeVisible();
  return a;
}

// Service worker-ийн дамжуулсан хүсэлтийг `page.route` барьдаггүй (WebKit-д SW хяналтад орсон үед
// удаашруулалт/500 үйлчлэхгүй байсан) — энэ файлд SW-гүй. Offline-ийн кэш нь апп-ын query кэш.
test.use({ serviceWorkers: 'block' });

test.describe('AC-213 дэлгэцийн төлөвүүд', () => {
  test('AC-213 ачаалж буй: сервер удаан (2.5 с) — S-36, S-37 skeleton, 1 с-ээс хойш маскот (ANIM-16), дараа нь агуулга', async ({ page, context }) => {
    await recordAnims(context);
    await context.addInitScript(recordStates);
    await signedIn(page, 'ac213l');

    for (const [path, sid, pattern] of [
      ['/memories/favorites', 'S-36', FAVORITES],
      ['/memories/trash', 'S-37', TRASH],
    ] as const) {
      await page.route(pattern, (route) => delayed(route, 2_500));
      await page.goto(path);
      await expect(page.getByTestId(`screen-${sid}`)).toBeVisible();
      await expect(page.getByTestId(LOADING)).toBeVisible();
      await expectAnim(page, 'ANIM-16', { reduced: false, within: `screen-${sid}` });
      await expect(page.getByTestId('state-loading-slow')).toBeVisible();
      await expect(page.getByTestId('state-loading-slow')).toContainText('хүлээж байна');
      await expect(page.getByTestId('state-loading-slow').getByTestId('mascot-bombolog')).toBeVisible();
      // Хариу ирмэгц агуулга (энд хоосон төлөв), skeleton алга
      await expect(page.getByTestId(EMPTY)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId(LOADING)).toHaveCount(0);

      const t = await stateTimes(page);
      expect(t[LOADING], `${sid}: skeleton бүртгэгдсэнгүй`).toBeDefined();
      // Маскот зөвхөн 1 с-ээс урт ачаалалд (`slowAfterMs` 1000)
      expect(t['state-loading-slow'] - t[LOADING], `${sid}: маскот 1 с-ээс өмнө гарав`).toBeGreaterThanOrEqual(950);
      await page.unroute(pattern);
    }
  });

  test('AC-213 хоосон: S-36, S-37 — маскот + 1 өгүүлбэр + товч', async ({ page }) => {
    await signedIn(page, 'ac213e');
    for (const [path, sid] of [
      ['/memories/favorites', 'S-36'],
      ['/memories/trash', 'S-37'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByTestId(`screen-${sid}`)).toBeVisible();
      const empty = page.getByTestId(EMPTY);
      await expect(empty).toBeVisible();
      await expect(empty.getByTestId('mascot-bombolog')).toBeVisible();
      const button = empty.getByTestId('state-empty-action');
      await expect(button).toBeVisible();
      const buttonText = (await button.innerText()).trim();
      const sentence = (await empty.innerText()).replace(buttonText, '').trim();
      expect(sentence.length, `${sid}: тайлбар өгүүлбэр алга`).toBeGreaterThan(0);
      // Нэг өгүүлбэр: төгсгөлийн цэгээс өмнө өөр өгүүлбэрийн төгсгөл алга
      expect(sentence.replace(/[.!?…]+$/, ''), `${sid}: «${sentence}» — 1 өгүүлбэр байх ёстой`).not.toMatch(/[.!?…]\s/);
    }
    // Товч ажиллана (S-37 → S-30)
    await page.getByTestId('state-empty-action').click();
    await expect(page.getByTestId('screen-S-30')).toBeVisible();
  });

  test('AC-213 алдаа: сервер 500 — «юу болсон» + «Дахин оролдох», дарахад сэргэнэ (S-36, S-37)', async ({ page }) => {
    await signedIn(page, 'ac213x');
    for (const [path, sid, pattern] of [
      ['/memories/favorites', 'S-36', FAVORITES],
      ['/memories/trash', 'S-37', TRASH],
    ] as const) {
      let failing = true;
      await page.route(pattern, (route) =>
        failing
          ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL', message: 'boom', traceId: 'e2e' }) })
          : route.continue(),
      );
      await page.goto(path);
      await expect(page.getByTestId(`screen-${sid}`)).toBeVisible();
      const error = page.getByTestId('state-error');
      await expect(error).toBeVisible({ timeout: 15_000 });
      await expect(error).toContainText('Ачаалж чадсангүй');
      const retry = error.getByTestId('state-retry');
      await expect(retry).toHaveText('Дахин оролдох');

      failing = false;
      await retry.click();
      await expect(page.getByTestId(EMPTY)).toBeVisible();
      await expect(page.getByTestId('state-error')).toHaveCount(0);
      await page.unroute(pattern);
    }
  });

  test('AC-213 offline: S-20 кэшээс харагдаж «Интернэт алга» (S-95), сүлжээ сэргэхэд зурвас алга', async ({ page, context }) => {
    await signedIn(page, 'ac213o');
    await expect(page.getByTestId('home-counter')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);

    await context.setOffline(true);
    const banner = page.getByTestId('offline-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Интернэт алга');
    // Нүүр дахин татахыг оролдоход (апп урд гарах) хүсэлт амжилтгүй ч кэшийн агуулга хэвээр, алдааны төлөвгүй
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await expect(page.getByTestId('home-counter')).toBeVisible();
    await expect(page.getByTestId('person-partner-name')).toHaveText('Ану');
    await expect(page.getByTestId('state-error')).toHaveCount(0);

    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
  });

  test('AC-213 зөвшөөрөл татгалзсан: S-32 байршил — шалтгаан ба гараар оруулах зам', async ({ page, context, browserName }) => {
    // Chromium, WebKit: зөвшөөрөлгүй context-д байршлын хүсэлт шууд татгалзагдана. Playwright Firefox нь
    // зөвшөөрлийн цонхыг хариугүй үлдээдэг (хэрэглэгчийн «Татгалзах» товшилтыг автоматжуулах API алга) —
    // тэнд хэрэглэгч татгалзсан үеийн `PERMISSION_DENIED` (code 1) хариуг өгнө.
    await context.clearPermissions();
    if (browserName === 'firefox') {
      await context.addInitScript(() => {
        navigator.geolocation.getCurrentPosition = (_ok, fail) =>
          fail?.({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      });
    }
    await signedIn(page, 'ac213p');
    await page.goto('/memory-editor');
    await expect(page.getByTestId('screen-S-32')).toBeVisible();
    await page.getByTestId('editor-location-current').click();
    const notice = page.getByTestId('editor-location-notice');
    await expect(notice).toHaveText('Байршлын зөвшөөрөл өгөөгүй байна. Газрын нэр, координатаа гараар оруулж болно.', { timeout: 20_000 });
    // Гараар оруулах талбар ажиллана
    await page.getByTestId('editor-place').fill('Тэрэлж');
    await expect(page.getByTestId('editor-place')).toHaveValue('Тэрэлж');
  });
});
