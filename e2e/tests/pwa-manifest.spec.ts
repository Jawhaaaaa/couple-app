import { expect, type Page, test } from '@playwright/test';

import { pngSize, waitForServiceWorker } from '../support/pwa';

/**
 * PWA manifest ба HTML-ийн толгой (T-82, FR-17.4, FR-19.1): AC-140 (manifest — нэр, 192/512 дүрс,
 * theme color; SW бүртгэгдсэн; installable), AC-152-ын HTML/manifest хэсэг (`display: standalone`,
 * `start_url`, theme/background өнгө, maskable, `apple-touch-icon` 180, iOS meta, splash зураг).
 * Lighthouse-ийн Performance/Accessibility (AC-152) ба installable-ийн Lighthouse-тэй ижил эх —
 * `perf.spec.ts`.
 *
 * Апп-ыг хөтчөөр нээж (`/`) толгойг DOM-оос уншина — хөтөч яг юу харж байгааг шалгана; дүрс,
 * splash файл бүрийг татаж 200 ба PNG-ийн бодит хэмжээг шалгана.
 */
interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

interface Manifest {
  name: string;
  short_name?: string;
  start_url: string;
  scope?: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

/** URL-ийг татаж 200, PNG ба хэмжээг шалгана. */
async function expectPng(page: Page, url: string, width: number, height: number) {
  const res = await page.request.get(url);
  expect(res.status(), `${url} → HTTP ${res.status()}`).toBe(200);
  expect(res.headers()['content-type'], url).toContain('image/png');
  expect(pngSize(await res.body()), url).toEqual({ width, height });
}

const headAttr = (page: Page, selector: string, attr: string) => page.locator(`head ${selector}`).first().getAttribute(attr);

test.describe('PWA manifest ба толгой', () => {
  test('AC-140 AC-152 manifest: нэр, standalone, start_url, theme/background өнгө, 192/512 + maskable дүрс (200, зөв хэмжээ)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    const href = await headAttr(page, 'link[rel="manifest"]', 'href');
    expect(href, '<link rel="manifest"> алга').toBeTruthy();
    const manifestUrl = new URL(href!, page.url()).href;
    const res = await page.request.get(manifestUrl);
    expect(res.status()).toBe(200);
    const manifest = (await res.json()) as Manifest;

    expect(manifest.name).toBe('Aura');
    expect(manifest.short_name).toBe('Aura');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    // start_url нь scope дотор (суусны дараа апп-аас гарахгүй)
    expect(new URL(manifest.start_url, manifestUrl).pathname.startsWith(new URL(manifest.scope ?? '/', manifestUrl).pathname)).toBe(true);
    expect(manifest.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    // Толгойн theme-color нь manifest-тэй ижил (status bar, splash-ийн өнгө нэг)
    expect((await headAttr(page, 'meta[name="theme-color"]', 'content'))?.toLowerCase()).toBe(manifest.theme_color.toLowerCase());

    const icon = (size: string, purpose: string) =>
      manifest.icons.find((i) => i.sizes.split(/\s+/).includes(size) && (i.purpose ?? 'any').split(/\s+/).includes(purpose));
    const required: [string, string][] = [
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ];
    for (const [size, purpose] of required) {
      const found = icon(size, purpose);
      expect(found, `${size} ${purpose} дүрс manifest-д алга`).toBeTruthy();
      const [w, h] = size.split('x').map(Number);
      await expectPng(page, new URL(found!.src, manifestUrl).href, w, h);
    }
  });

  test('AC-152 HTML толгой: apple-touch-icon 180, apple-mobile-web-app-capable, status-bar black-translucent, iOS splash зураг', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    const touch = page.locator('head link[rel="apple-touch-icon"]');
    await expect(touch).toHaveCount(1);
    await expect(touch).toHaveAttribute('sizes', '180x180');
    await expectPng(page, new URL((await touch.getAttribute('href'))!, page.url()).href, 180, 180);

    await expect(page.locator('head meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('head meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent');
    await expect(page.locator('head meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);

    // iOS splash: зураг бүр 200, хэмжээ нь media-ийн device-width/height × pixel-ratio-тэй таарна
    const splashes = await page.locator('head link[rel="apple-touch-startup-image"]').evaluateAll((links) =>
      links.map((l) => ({ href: l.getAttribute('href') ?? '', media: l.getAttribute('media') ?? '' })),
    );
    expect(splashes.length, 'iOS splash зураг алга').toBeGreaterThan(0);
    const viewport = page.viewportSize()!;
    let matchesThisDevice = false;
    for (const { href, media } of splashes) {
      const m = /device-width:\s*(\d+)px\).*device-height:\s*(\d+)px\).*-webkit-device-pixel-ratio:\s*(\d+)\)/.exec(media);
      expect(m, `splash media задлагдсангүй: ${media}`).toBeTruthy();
      const [w, h, dpr] = [Number(m![1]), Number(m![2]), Number(m![3])];
      await expectPng(page, new URL(href, page.url()).href, w * dpr, h * dpr);
      if (w === viewport.width) matchesThisDevice = true;
    }
    // Тестийн төхөөрөмжийн (iPhone 14 — 390 / Pixel 7 — 412) өргөнтэй splash ч байх ёстой (iPhone-д)
    if (test.info().project.name.startsWith('webkit')) expect(matchesThisDevice, `${viewport.width}px өргөнтэй splash алга`).toBe(true);
  });

  test('AC-140 service worker бүртгэгдэж хуудсыг удирдана (scope /, /sw.js)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();
    await waitForServiceWorker(page);
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { scope: r?.scope, script: r?.active?.scriptURL };
    });
    expect(new URL(reg.scope!).pathname).toBe('/');
    expect(new URL(reg.script!).pathname).toBe('/sw.js');
  });

  test('AC-140 AC-152 installable — Chrome-ийн суулгах шалгалт (Lighthouse-ийн installable-тэй ижил эх) алдаагүй', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Суулгах боломжийн шалгалт (CDP Page.getInstallabilityErrors) зөвхөн Chromium-д');
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();
    await waitForServiceWorker(page);
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
      installabilityErrors: { errorId: string; errorArguments: { name: string; value: string }[] }[];
    };
    expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
    const { url, errors } = (await cdp.send('Page.getAppManifest')) as { url: string; errors: { message: string; critical: number }[] };
    expect(new URL(url).pathname).toBe('/manifest.json');
    expect(errors.filter((e) => e.critical)).toEqual([]);
  });
});
