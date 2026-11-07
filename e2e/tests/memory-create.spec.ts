import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { getMemory, listMemories, makeJpeg, pickFiles, waitReady, withExif } from '../support/memories';
import { signInUi } from '../support/users';

/**
 * S-32 дурсамж нэмэх (T-39, FR-5.1, FR-5.2, FR-5.6, NFR-07): EXIF-ийн огноо/байршил
 * «Зурагнаас авсан» (AC-79), хязгаар ба ≤ 2560 px (AC-172), сүлжээ тасарсан ч upload
 * үргэлжилнэ (AC-20), alt талбар ба ≥ 44 товч (AC-197).
 * 61 с / 201 MB видеоны татгалзалт нь хөтчид бодит видео үүсгэх боломжгүй тул UT
 * (`memoriesLogic.test.ts`) ба backend IT-д.
 */
async function openEditor(page: Page) {
  await page.goto('/memory-editor');
  await expect(page.getByTestId('screen-S-32')).toBeVisible();
  await expect(page.getByTestId('editor-pick')).toBeVisible();
}

test.describe('S-32 дурсамж нэмэх', () => {
  test('AC-79 EXIF огноо 2025-07-12 ба байршил «Зурагнаас авсан» тэмдэгтэй бөглөгдөж, засаж болно', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac79');
    await signInUi(partnerA.page, a);
    await openEditor(partnerA.page);
    const jpeg = withExif(await makeJpeg(partnerA.page), { date: '2025:07:12 14:30:00', lat: 47.918, lon: 106.917 });
    await pickFiles(partnerA.page, 'editor-pick', [{ name: 'gps.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);

    await expect(partnerA.page.getByTestId('editor-date')).toHaveValue('2025-07-12');
    await expect(partnerA.page.getByTestId('editor-date-exif')).toHaveText('Зурагнаас авсан');
    await expect(partnerA.page.getByTestId('editor-place-exif')).toBeVisible();
    await expect(partnerA.page.getByTestId('editor-lat')).toHaveValue(/^47\.91/);
    await expect(partnerA.page.getByTestId('editor-lon')).toHaveValue(/^106\.91/);

    // Засах боломжтой — тэмдэг алга болно
    await partnerA.page.getByTestId('editor-place').fill('Зайсан');
    await partnerA.page.getByTestId('editor-date').fill('2025-07-13');
    await expect(partnerA.page.getByTestId('editor-date-exif')).toHaveCount(0);

    await partnerA.page.getByTestId('editor-title').fill('Зайсангийн орой');
    await expect(partnerA.page.getByTestId('editor-media-0-status')).toHaveText('Илгээгдсэн', { timeout: 20_000 });
    await partnerA.page.getByTestId('editor-save').click();
    await expect(partnerA.page.getByTestId('screen-S-31')).toBeVisible({ timeout: 20_000 });
    await expect(partnerA.page.getByTestId('memory-place')).toHaveText('Зайсан');

    // AC-21: серверт хадгалсан файл GPS-гүй (вэбд canvas-аар дахин encode хийгдсэн)
    const id = partnerA.page.url().split('/').pop() ?? '';
    const memory = await getMemory(a, id);
    const original = await fetch((memory.media[0].media as unknown as { urls: { original: string } }).urls.original);
    const bytes = Buffer.from(await original.arrayBuffer());
    expect(bytes.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(false);
  });

  test('AC-172 21 дэх зураг тайлбартай татгалзана; 4000 px зураг ≤ 2560 болж илгээгдэнэ', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac172');
    await signInUi(partnerA.page, a);
    await openEditor(partnerA.page);
    await expect(partnerA.page.getByTestId('editor-limits')).toContainText('60 секунд, 200 MB');

    const big = await makeJpeg(partnerA.page, 4000, 3000);
    const small = await makeJpeg(partnerA.page, 64, 48);
    const files = [
      { name: 'big.jpg', mimeType: 'image/jpeg', buffer: big },
      ...Array.from({ length: 20 }, (_, i) => ({ name: `p${i + 2}.jpg`, mimeType: 'image/jpeg', buffer: small })),
    ];
    await pickFiles(partnerA.page, 'editor-pick', files);
    await expect(partnerA.page.getByTestId('editor-reject')).toHaveText('p21.jpg нэмэгдсэнгүй — нэг дурсамжид 20 хүртэл файл багтана.');
    await expect(partnerA.page.locator('[data-testid^="editor-media-"][data-testid$="-alt"]')).toHaveCount(20);
    await expect(partnerA.page.getByTestId('editor-pick')).toBeDisabled();

    await partnerA.page.getByTestId('editor-title').fill('Олон зураг');
    await partnerA.page.getByTestId('editor-save').click();
    await expect(partnerA.page.getByTestId('screen-S-31')).toBeVisible({ timeout: 60_000 });
    const id = partnerA.page.url().split('/').pop() ?? '';
    await waitReady(a, id);
    const memory = await getMemory(a, id);
    expect(memory.media).toHaveLength(20);
    const first = memory.media[0].media;
    expect(Math.max(first.width ?? 0, first.height ?? 0)).toBeLessThanOrEqual(2560);
  });

  test('AC-20 сүлжээ тасарч сэргэхэд upload үргэлжилж, дурсамж хоёуланд харагдана', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac20');
    await signInUi(partnerA.page, a);
    await openEditor(partnerA.page);
    const files = await Promise.all([1, 2, 3].map(async (i) => ({ name: `trip-${i}.jpg`, mimeType: 'image/jpeg', buffer: await makeJpeg(partnerA.page, 1600, 1200, i * 40) })));

    await partnerA.context.setOffline(true);
    await pickFiles(partnerA.page, 'editor-pick', files);
    await expect(partnerA.page.getByTestId('editor-media-2')).toBeVisible();
    await partnerA.page.getByTestId('editor-title').fill('Тасалдсан ч хадгалагдсан');
    await expect(partnerA.page.getByTestId('editor-media-0-status')).not.toHaveText('Илгээгдсэн');

    // Ноорог хадгалагдсан — хуудсыг дахин ачаалсан ч гарчиг хэвээр (AC-191)
    await partnerA.context.setOffline(false);
    await partnerA.page.reload();
    await expect(partnerA.page.getByTestId('editor-title')).toHaveValue('Тасалдсан ч хадгалагдсан');
    for (const i of [0, 1, 2]) await expect(partnerA.page.getByTestId(`editor-media-${i}-status`)).toHaveText('Илгээгдсэн', { timeout: 30_000 });
    await partnerA.page.getByTestId('editor-save').click();
    await expect(partnerA.page.getByTestId('screen-S-31')).toBeVisible({ timeout: 20_000 });

    await expect.poll(async () => (await listMemories(b, {})).map((m) => m.title), { timeout: 15_000 }).toContain('Тасалдсан ч хадгалагдсан');
    await signInUi(partnerB.page, b);
    await partnerB.page.goto('/memories');
    await expect(partnerB.page.getByText('Тасалдсан ч хадгалагдсан')).toBeVisible();
  });

  test('AC-197 S-32: зураг бүрт alt талбар; товч бүр нэртэй, ≥ 44×44', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac197m');
    await signInUi(partnerA.page, a);
    await openEditor(partnerA.page);
    await pickFiles(partnerA.page, 'editor-pick', [{ name: 'alt.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(partnerA.page) }]);
    const alt = partnerA.page.getByTestId('editor-media-0-alt');
    await expect(alt).toBeVisible();
    await expect(alt).toHaveAttribute('aria-label', 'Зургийн тайлбар (дэлгэц уншигчид)');

    const offenders = await partnerA.page.getByTestId('screen-S-32').evaluate((root) =>
      Array.from(root.querySelectorAll('[role="button"], button'))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const name = el.getAttribute('aria-label') ?? el.textContent ?? '';
          return { name: name.trim(), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter((b) => !b.name || b.w < 44 || b.h < 44),
    );
    expect(offenders).toEqual([]);
  });
});
