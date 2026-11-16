import { expect, type Page } from '@playwright/test';

/**
 * PWA-ийн E2E туслах (T-82…T-87): PNG-ийн хэмжээ, service worker хүлээх.
 */

/** PNG-ийн IHDR-аас өргөн × өндөр (файлын эхний 24 байт). PNG биш бол алдаа. */
export function pngSize(buf: Buffer): { width: number; height: number } {
  const signature = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== signature || buf.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('PNG биш (signature/IHDR алга)');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Хуудсыг service worker удирдах хүртэл хүлээнэ (анхны айлчлалд `clients.claim`-ийн дараа) —
 * offline reload, push бүртгэлийн өмнө.
 */
export async function waitForServiceWorker(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker?.getRegistration();
          return reg?.active?.state === 'activated' && !!navigator.serviceWorker.controller;
        }),
      { timeout: 20_000, message: 'service worker идэвхжиж хуудсыг удирдсангүй' },
    )
    .toBe(true);
}

/**
 * Runtime кэшэд (`aura-runtime-v1`) хуудас ачаалсан static файл бүр орсон эсэхийг хүлээнэ —
 * offline reload-оос өмнө (SW-ийн `CACHE_URLS` нөхөлт дуусах).
 */
export async function waitForRuntimeCache(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const urls = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .filter((u) => u.startsWith(location.origin) && /\/_expo\/static\/|\.(ttf|otf|woff2?)$/.test(new URL(u).pathname));
          const missing: string[] = [];
          for (const u of urls) if (!(await caches.match(u, { ignoreVary: true }))) missing.push(new URL(u).pathname);
          return missing;
        }),
      { timeout: 20_000, message: 'ачаалсан static файлууд SW-ийн кэшэд орсонгүй' },
    )
    .toEqual([]);
}
