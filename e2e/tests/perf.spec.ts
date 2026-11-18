import { type BrowserContext, expect, type Page, type Response, test } from '@playwright/test';

import { confirmStartDate, linkedCouple, sendSignalApi } from '../support/couple';
import { describeRun, FOUR_G, type LighthouseSummary, runLighthouse } from '../support/lighthouse';
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

/**
 * AC-152 (FR-19.1) ба AC-160 (FR-19.10): Lighthouse mobile — `support/lighthouse.ts`-ийн «4G» профайл
 * (DevTools «Fast 4G», CPU 4×). Апп-ын анхны нүүр (`/` — шинэ хэрэглэгчийн эхний ачаалал) хүйтэн
 * кэштэй. Босго: Performance ≥ 80, Accessibility ≥ 95, installable; LCP ≤ 2.5 с.
 */
test.describe('AC-152 AC-160 Lighthouse (mobile, 4G)', () => {
  let run: LighthouseSummary;

  test.beforeAll(async ({ baseURL }) => {
    test.setTimeout(180_000);
    run = await runLighthouse(new URL('/', baseURL).href);
    console.log(`Lighthouse: ${describeRun(run)}`);
  });

  test('AC-152 Lighthouse (mobile, 4G): Performance ≥ 80, Accessibility ≥ 95, installable', async () => {
    test.info().annotations.push({ type: 'lighthouse', description: describeRun(run) });
    expect(run.installabilityErrors, 'Chrome-ийн суулгах шалгалтын алдаа').toEqual([]);
    expect(run.accessibility, `Accessibility — унасан audit: ${run.failedA11y.join(', ')}`).toBeGreaterThanOrEqual(0.95);
    expect(run.performance, `Performance (${FOUR_G.name}) — ${describeRun(run)}`).toBeGreaterThanOrEqual(0.8);
  });

  test('AC-160 Lighthouse (mobile, 4G): LCP ≤ 2.5 с', async () => {
    test.info().annotations.push({ type: 'lighthouse', description: describeRun(run) });
    expect(run.lcpMs, `LCP (${FOUR_G.name}) — ${describeRun(run)}`).toBeLessThanOrEqual(2_500);
  });
});

/** Lottie: dotLottie тоглуулагчийн chunk эсвэл Lottie JSON-ийн модуль (`{v:"5.x",fr:…`). */
const LOTTIE_URL = /\.lottie(\?|$)|lottie[^/]*\.json(\?|$)|dotlottie[^/]*\.wasm/i;
const LOTTIE_BODY = /dotlottie-player\.wasm|\{\s*"?v"?\s*:\s*"\d+\.\d+\.\d+"\s*,\s*"?fr"?\s*:/;
const BUDGET_GZIP_BYTES = 1.5 * 1024 * 1024;

interface Loaded {
  url: string;
  path: string;
  /** Дамжуулсан бие (Content-Encoding-ийн дараах — gzip) байт. */
  encoded: number;
  gzip: boolean;
  lottie: boolean;
}

/**
 * Context-ийн хуудсын татсан JS ба Lottie хариуг цуглуулна (хүйтэн кэш — context бүр шинэ). Service
 * worker-ийн өөрийн хүсэлт (precache, `CACHE_URLS`-ийн кэш дүүргэлт) нь хуудсын ачаалал биш тул
 * тоологдохгүй; нэг файл нэг л удаа.
 */
function recordScripts(context: BrowserContext) {
  const loaded: Loaded[] = [];
  const pending: Promise<void>[] = [];
  const seen = new Set<string>();
  context.on('response', (res: Response) => {
    const url = res.url();
    const path = new URL(url).pathname;
    if (res.request().serviceWorker() || path === '/sw.js' || seen.has(url)) return;
    const isScript = res.request().resourceType() === 'script' || /\.js(\?|$)/.test(path);
    if (!isScript && !LOTTIE_URL.test(url)) return;
    seen.add(url);
    pending.push(
      (async () => {
        const [sizes, headers, body] = await Promise.all([
          res.request().sizes().catch(() => ({ responseBodySize: 0 })),
          res.allHeaders().catch(() => ({}) as Record<string, string>),
          res.text().catch(() => ''),
        ]);
        loaded.push({
          url,
          path,
          encoded: sizes.responseBodySize,
          gzip: /gzip|br|zstd/.test(headers['content-encoding'] ?? ''),
          lottie: LOTTIE_URL.test(url) || LOTTIE_BODY.test(body),
        });
      })(),
    );
  });
  return {
    settle: async () => {
      await Promise.all(pending);
      return [...loaded];
    },
  };
}

const kib = (n: number) => `${(n / 1024).toFixed(0)} KiB`;

test.describe('AC-160 эхний ачаалал: JS (gzip) ≤ 1.5 MB, маршрут бүр lazy, Lottie хэрэгтэй үед л', () => {
  let a: TestUser;
  let b: TestUser;

  test.beforeAll(async () => {
    [a, b] = await linkedCouple('Бат', 'Ану', 'perf160');
    await confirmStartDate(a, b, '2025-02-14');
  });

  test('AC-160 эхний ачааллын JS gzip-ээр ≤ 1.5 MB, Lottie татагдахгүй (нүүр хуудас ба нэвтэрсэн нүүр)', async ({ browser, contextOptions }) => {
    // 1) Шинэ хэрэглэгч — `/` (S-01/S-02)
    const anon = await browser.newContext(contextOptions);
    const anonRec = recordScripts(anon);
    const anonPage = await anon.newPage();
    await anonPage.goto('/');
    await expect(anonPage.locator('#root')).not.toBeEmpty();
    await anonPage.waitForLoadState('networkidle');
    const first = await anonRec.settle();
    const firstJs = first.filter((l) => !l.lottie);
    const firstTotal = firstJs.reduce((s, l) => s + l.encoded, 0);
    test.info().annotations.push({ type: 'js-first-load', description: `/ — ${firstJs.length} файл, ${kib(firstTotal)} (gzip)` });
    expect(firstJs.length).toBeGreaterThan(0);
    expect(firstJs.filter((l) => !l.gzip).map((l) => l.path), 'JS gzip-ээр үйлчлэгдэх ёстой (прод — Caddy encode)').toEqual([]);
    expect(firstTotal, firstJs.map((l) => `${l.path} ${kib(l.encoded)}`).join('\n')).toBeLessThanOrEqual(BUDGET_GZIP_BYTES);
    expect(first.filter((l) => l.lottie).map((l) => l.path), 'Эхний ачаалалд Lottie').toEqual([]);
    await anon.close();

    // 2) Буцаж ирсэн хэрэглэгч — нэвтэрсэн нүүр (S-20) хүйтэн кэштэй нээгдэх (сесс нь cookie-д)
    const ctx = await browser.newContext(contextOptions);
    const page = await ctx.newPage();
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    const fresh = await browser.newContext({ ...contextOptions, storageState: await ctx.storageState() });
    await ctx.close();
    const rec = recordScripts(fresh);
    const home = await fresh.newPage();
    await home.goto('/home');
    await expect(home.getByTestId('screen-S-20')).toBeVisible();
    await home.waitForLoadState('networkidle');
    const homeLoaded = await rec.settle();
    const homeJs = homeLoaded.filter((l) => !l.lottie);
    const homeTotal = homeJs.reduce((s, l) => s + l.encoded, 0);
    test.info().annotations.push({ type: 'js-first-load', description: `/home — ${homeJs.length} файл, ${kib(homeTotal)} (gzip)` });
    expect(homeTotal, homeJs.map((l) => `${l.path} ${kib(l.encoded)}`).join('\n')).toBeLessThanOrEqual(BUDGET_GZIP_BYTES);
    expect(homeLoaded.filter((l) => l.lottie).map((l) => l.path), 'Нүүрний эхний ачаалалд Lottie').toEqual([]);
    await fresh.close();
  });

  test('AC-160 маршрут бүр lazy — таб бүр анх нээгдэхэд өөрийн chunk-ийг тэр үед л татна', async ({ browser, contextOptions }) => {
    const ctx = await browser.newContext(contextOptions);
    const rec = recordScripts(ctx);
    const page = await ctx.newPage();
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await page.waitForLoadState('networkidle');
    for (const [tab, screen] of TABS.slice(1)) {
      const before = new Set((await rec.settle()).map((l) => l.path));
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(screen).filter({ visible: true })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const added = (await rec.settle()).map((l) => l.path).filter((p) => !before.has(p) && p.startsWith('/_expo/static/js/'));
      expect(added.length, `${tab} (${screen}) нээхэд шинэ JS chunk татагдсангүй — эхний bundle-д орсон байна`).toBeGreaterThan(0);
    }
    await ctx.close();
  });

  test('AC-160 Lottie хэрэгтэй үед л — хамтрагчийн зүрх ирж ANIM-02 тоглоход татагдана', async ({ browser, contextOptions }) => {
    const ctx = await browser.newContext(contextOptions);
    const rec = recordScripts(ctx);
    const page = await ctx.newPage();
    await signInUi(page, b);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect((await rec.settle()).filter((l) => l.lottie).map((l) => l.path), 'Зүрх ирэхээс өмнө Lottie').toEqual([]);
    const res = await sendSignalApi(a, 'HEART');
    expect(res.status).toBe(201);
    await expect(page.getByTestId('anim-ANIM-02')).toBeAttached({ timeout: 5_000 });
    await expect.poll(async () => (await rec.settle()).filter((l) => l.lottie).length, { timeout: 10_000 }).toBeGreaterThan(0);
    await ctx.close();
  });
});
