import { expect, type Page, test } from '@playwright/test';

import { confirmStartDate, linkedCouple } from '../support/couple';
import { createMemoryApi, makeJpeg } from '../support/memories';
import { signInUi, type TestUser } from '../support/users';

/**
 * AC-205 (NFR-01): таб солих хугацаа (5 таб × 10) p95 ≤ 150 ms; зураг ачаалагдахаас өмнө blurhash эсвэл
 * thumbnail орлуулга харагдана. Хугацааг хөтчийн дотор (`performance.now`) товшилтоос дэлгэц гарах хүртэл
 * хэмжинэ — Playwright-ийн RPC хоцрогдол орохгүй.
 */
const TABS = [
  ['home', 'screen-S-20'],
  ['memories', 'screen-S-30'],
  ['chat', 'screen-S-40'],
  ['plans', 'screen-S-50'],
  ['together', 'screen-S-60'],
] as const;

test.skip(({ browserName }) => browserName !== 'chromium', 'Хэмжилт нэг хөтчид (Pixel 7) — smoke нь бусад хөтчийг хамарна');

/** Табыг товшиж тухайн дэлгэц харагдах хүртэлх ms (rAF-аар шалгана). */
async function switchTab(page: Page, tab: string, screen: string): Promise<number> {
  return page.evaluate(
    ({ tab, screen }) =>
      new Promise<number>((resolve, reject) => {
        const button = document.querySelector<HTMLElement>(`[data-testid="tab-${tab}"]`);
        if (!button) return reject(new Error(`tab-${tab} алга`));
        const visible = () => {
          const el = [...document.querySelectorAll<HTMLElement>(`[data-testid="${screen}"]`)].find((e) => e.offsetParent !== null);
          return !!el && el.getBoundingClientRect().width > 0;
        };
        const t0 = performance.now();
        button.click();
        const tick = () => {
          if (visible()) return resolve(performance.now() - t0);
          if (performance.now() - t0 > 5_000) return reject(new Error(`${screen} 5 с-д гарсангүй`));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { tab, screen },
  );
}

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];

test.describe('AC-205 гүйцэтгэл', () => {
  let a: TestUser;

  test.beforeAll(async ({ browser }) => {
    const [x, y] = await linkedCouple('Бат', 'Ану', 'perf');
    await confirmStartDate(x, y, '2025-02-14');
    const page = await browser.newPage();
    await createMemoryApi(x, await makeJpeg(page, 1600, 1200), { title: 'Blurhash шалгах', occurredOn: '2026-10-01' });
    await page.close();
    a = x;
  });

  test('AC-205 таб солих p95 ≤ 150 ms (5 таб × 10)', async ({ page }) => {
    test.setTimeout(120_000);
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    // Халаалт: lazy chunk ба эхний өгөгдөл ачаалагдана (хэмжилтэд орохгүй)
    for (const [tab, screen] of TABS) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(screen).filter({ visible: true })).toBeVisible();
    }
    const samples: number[] = [];
    for (let round = 0; round < 10; round += 1) {
      for (const [tab, screen] of TABS) samples.push(await switchTab(page, tab, screen));
    }
    expect(samples).toHaveLength(50);
    expect(p95(samples), `таб солих хугацаа: ${samples.map((s) => Math.round(s)).join(', ')}`).toBeLessThanOrEqual(150);
  });

  test('AC-205 зураг ачаалагдахаас өмнө blurhash/thumbnail орлуулга харагдана', async ({ page, context }) => {
    // Медиа (S3) хариуг удаашруулна — тэр хооронд орлуулга харагдах ёстой
    await context.route(/\/aura-media\//, async (route) => {
      await new Promise((r) => setTimeout(r, 4_000));
      await route.continue().catch(() => undefined);
    });
    await signInUi(page, a);
    await page.goto('/memories');
    const card = page.locator('[data-testid^="memory-card-"]').first();
    await expect(card).toBeVisible();
    // expo-image вэбэд blurhash-ийг data URL/blob зураг болгон зурна; thumbnail бол `sm` хувилбар
    await expect
      .poll(
        () =>
          card.evaluate((el) =>
            [...el.querySelectorAll('img')].some((img) => /^(data:|blob:)/.test(img.src) || /\/sm[./]/.test(img.src)) ||
            el.querySelectorAll('canvas').length > 0,
          ),
        { timeout: 3_000 },
      )
      .toBe(true);
  });
});
