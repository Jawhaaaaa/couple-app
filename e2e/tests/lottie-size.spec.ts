import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { expectAnim, recordAnims } from '../support/anims';
import { confirmStartDate, linkedCouple, sendSignalApi } from '../support/couple';
import { signInUi } from '../support/users';

/**
 * AC-MO-05 (§3.4, `SizedLottie.web.tsx`): вэбийн dotLottie нь хэмжээгүй контейнерт бүтэн дэлгэцийг
 * эзэлдэг (2026-11-07-ны туршилт) — тиймээс тогтоосон хэмжээтэй хайрцагт. ANIM-02 (зүрх хүлээн
 * авах, 140) ба ANIM-15 (сэтгэл санааны түвшин, 44) тоглох үед Lottie-гийн `<canvas>` нь контейнерийн
 * тогтоосон хэмжээтэй тэнцүү, viewport-ийг дүүргэхгүй.
 */
interface Box {
  width: number;
  height: number;
}

interface LottieSize {
  container: Box;
  canvas: Box;
  viewport: Box;
}

/** Lottie тоглож байх агшинд (`<canvas>` зурагдсан) контейнер ба canvas-ийн layout хэмжээ. */
function recordLottieSizes(selector: string) {
  const w = window as unknown as { __lottieSizes?: LottieSize[] };
  w.__lottieSizes = [];
  // Layout-ийн хэмжээ (CSS px): дэлгэцэнд орох `ZoomIn` г.м. transform-ийг тооцохгүй
  const box = (el: Element) => {
    const h = el as HTMLElement;
    return { width: Math.round(h.offsetWidth), height: Math.round(h.offsetHeight) };
  };
  const tick = () => {
    document.querySelectorAll(selector).forEach((container) => {
      const canvas = container.querySelector('canvas');
      if (canvas && canvas.getBoundingClientRect().width > 0 && (w.__lottieSizes?.length ?? 0) < 300) {
        w.__lottieSizes?.push({ container: box(container), canvas: box(canvas), viewport: { width: window.innerWidth, height: window.innerHeight } });
      }
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function lottieSizes(page: Page): Promise<LottieSize[]> {
  return page.evaluate(() => (window as unknown as { __lottieSizes?: LottieSize[] }).__lottieSizes ?? []);
}

function expectFixedSize(sizes: LottieSize[], size: number, what: string) {
  expect(sizes.length, `${what}: Lottie canvas зурагдсангүй`).toBeGreaterThan(0);
  for (const s of sizes) {
    expect(s.container, `${what}: контейнер`).toEqual({ width: size, height: size });
    expect(s.canvas, `${what}: Lottie элемент = контейнерийн хэмжээ`).toEqual({ width: size, height: size });
    expect(s.canvas.width, `${what}: viewport-ийн өргөнийг дүүргэхгүй`).toBeLessThan(s.viewport.width);
    expect(s.canvas.height, `${what}: viewport-ийн өндрийг дүүргэхгүй`).toBeLessThan(s.viewport.height);
  }
}

test.describe('AC-MO-05 Lottie-гийн хэмжээ', () => {
  test('AC-MO-05 ANIM-02 зүрх хүлээн авах — Lottie 140×140 контейнерт, viewport-ийг дүүргэхгүй', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'acmo05h');
    await confirmStartDate(a, b, '2025-04-01');
    const B = partnerB.page;
    await recordAnims(partnerB.context);
    await partnerB.context.addInitScript(recordLottieSizes, '[data-testid="signal-lottie"]');
    await signInUi(B, b);
    await expect(B.getByTestId('heart-button')).toBeVisible();
    await B.waitForLoadState('networkidle');

    // dotLottie тоглуулагч эхний Lottie-д тусдаа chunk-аар татагдана (AC-160) — ирэх хүртэл дахин илгээнэ
    await expect
      .poll(
        async () => {
          if ((await lottieSizes(B)).length > 0) return true;
          await sendSignalApi(a, 'HEART');
          await expect(B.getByTestId('signal-overlay-HEART')).toBeAttached();
          await expect(B.getByTestId('signal-overlay-HEART')).toHaveCount(0, { timeout: 5_000 });
          return (await lottieSizes(B)).length > 0;
        },
        { timeout: 30_000, intervals: [100] },
      )
      .toBe(true);
    await expectAnim(B, 'ANIM-02', { reduced: false, within: 'signal-overlay-HEART' });
    expectFixedSize(await lottieSizes(B), 140, 'ANIM-02');
  });

  test('AC-MO-05 ANIM-15 сэтгэл санааны түвшин — Lottie 44×44 контейнерт, viewport-ийг дүүргэхгүй', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'acmo05m');
    const A = partnerA.page;
    await recordAnims(partnerA.context);
    await partnerA.context.addInitScript(recordLottieSizes, '[data-testid^="checkin-lottie-"]');
    await signInUi(A, a);
    await A.goto('/together/checkin');
    await expect(A.getByTestId('screen-S-69')).toBeVisible();

    await A.getByTestId('checkin-level-4').click();
    await expectAnim(A, 'ANIM-15', { reduced: false, within: 'screen-S-69' });
    await expect(A.getByTestId('checkin-lottie-4').locator('canvas')).toBeVisible();
    await expect.poll(async () => (await lottieSizes(A)).length).toBeGreaterThan(0);
    expectFixedSize(await lottieSizes(A), 44, 'ANIM-15');
    const box = await A.getByTestId('checkin-lottie-4').locator('canvas').boundingBox();
    expect(box && Math.round(box.width)).toBe(44);
  });
});
