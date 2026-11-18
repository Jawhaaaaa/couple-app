import { readFileSync } from 'node:fs';

import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { getMemory, pickFiles } from '../support/memories';
import { signInUi } from '../support/users';

/**
 * S-32 → S-31 видео дурсамж (FR-5.1, AC-24, DD-AURA-014): 30 с, 1920×1080 H.264 видео
 * (`fixtures/video-30s-1080p.mp4`, 48 KB — нэг өнгийн дэвсгэр дээр хөдлөх дөрвөлжин, 5 fps)
 * upload → backend ffmpeg хөрвүүлэлтийн явцад «Боловсруулж байна» → дуусахад H.264 720p,
 * poster-тэй, S-31-д тоглогдоно.
 */
const VIDEO = readFileSync(new URL('../fixtures/video-30s-1080p.mp4', import.meta.url));

/** Хөрвүүлэлт богино (≈ 1 с) тул S-31-ийн «боловсруулж байна» төлөв DOM-д орсон агшныг бүртгэнэ. */
function recordProcessing() {
  const w = window as unknown as { __processingSeen?: boolean };
  w.__processingSeen = false;
  new MutationObserver(() => {
    if (document.querySelector('[data-testid="media-processing"]')) w.__processingSeen = true;
  }).observe(document, { subtree: true, childList: true });
}

interface VideoMedia {
  kind: string;
  status: string;
  mime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  urls: { original: string; poster?: string };
}

test.describe('S-31 видео дурсамж', () => {
  test('AC-24 30 с видео upload → «Боловсруулж байна» → H.264 720p, poster-тэй, тоглогдоно', async ({ partnerA, browserName }) => {
    test.setTimeout(90_000);
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac24');
    const page = partnerA.page;
    await partnerA.context.addInitScript(recordProcessing);
    await signInUi(page, a);
    await page.goto('/memory-editor');
    await expect(page.getByTestId('screen-S-32')).toBeVisible();

    // Гарчгийг эхэлж бичээд видеог сонгоно — хадгалах нь upload дуусахыг хүлээж шууд S-31 руу
    await page.getByTestId('editor-title').fill('Тэрэлжийн бичлэг');
    await pickFiles(page, 'editor-pick', [{ name: 'terelj.mp4', mimeType: 'video/mp4', buffer: VIDEO }]);
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('screen-S-31')).toBeVisible({ timeout: 30_000 });
    const id = page.url().split('?')[0].split('/').pop() ?? '';

    // Хөрвүүлэлтийн явцад
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __processingSeen?: boolean }).__processingSeen === true), {
        message: 'S-31-д «Боловсруулж байна» (media-processing) харагдсангүй',
      })
      .toBe(true);

    // Дуусахад: S-31 өөрөө шинэчлэгдэж (дахин ачаалалгүй) тоглуулагч гарна
    const player = page.getByTestId('media-video');
    await expect(player).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('media-processing')).toHaveCount(0);

    const media = (await getMemory(a, id)).media[0].media as unknown as VideoMedia;
    expect(media).toMatchObject({ kind: 'VIDEO', status: 'READY', mime: 'video/mp4', height: 720, width: 1280 });
    expect(media.durationMs).toBeGreaterThanOrEqual(29_000);
    expect(media.urls.poster).toBeTruthy();
    // Poster нь JPEG зураг
    const poster = await fetch(media.urls.poster ?? '');
    expect(poster.ok).toBe(true);
    expect(poster.headers.get('content-type')).toContain('image/jpeg');

    const video = player.locator('video');
    await expect(video).toHaveAttribute('poster', /.+/);
    expect(new URL((await video.getAttribute('poster')) ?? '').pathname).toBe(new URL(media.urls.poster ?? '').pathname);
    // Playwright-ийн Windows WebKit build нь медиа codec-гүй — ямар ч MP4 (H.264) `MEDIA_ERR_SRC_NOT_SUPPORTED`
    // (2026-11-16-нд шалгав: түүхий файл ч readyState 0, error.code 4). Linux (CI, GStreamer) ба бодит
    // iOS Safari-д тоглоно. Тэнд зөвхөн тоглуулалтын шалгалтыг алгасна — дээрх бүх шалгалт хүчинтэй.
    if (browserName === 'webkit' && process.platform === 'win32') {
      test.info().annotations.push({ type: 'skip-playback', description: 'Windows WebKit-д H.264 decoder алга' });
      return;
    }
    // H.264-ийг хөтөч уншиж, 720p кадрын хэмжээтэй
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    expect(await video.evaluate((v: HTMLVideoElement) => v.videoHeight)).toBe(720);

    // Хэрэглэгч тоглуулна (системийн удирдлага; хөтөч бүрийн удирдлагын байрлал өөр). WebKit-ийн native
    // controls нь фокустай <video> дээрх Space/Enter-ийг тоглуулалт болгодоггүй, харин видеог товшиход
    // тоглуулна (2026-11-17-нд mcr.microsoft.com/playwright:v1.65.0-noble-д шалгав) — iPhone Safari-д ч товшилт.
    if (browserName === 'webkit') {
      await video.click();
    } else {
      await video.focus();
      await page.keyboard.press('Space');
    }
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0), { message: 'видео тоглосонгүй', timeout: 15_000 })
      .toBe(true);
  });
});
