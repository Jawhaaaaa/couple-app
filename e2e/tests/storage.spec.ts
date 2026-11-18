import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { makeJpeg, pickFiles } from '../support/memories';
import { seed } from '../support/seed';
import { apiJson, signInUi, type TestUser } from '../support/users';

/**
 * Хосын хадгалах сангийн квот (NFR-11, AC-200, DD-AURA-038): хязгаар серверийн тохиргоо
 * (`aura.storage.quota-bytes` 10 GiB, `warn-ratio` 0.8). Хэрэглээг e2e seed `STORAGE_USAGE`-аар
 * тавина (10 GB бодитоор upload хийхгүй) — upload ба дэлгэцүүд нь UI-аар.
 */
const QUOTA = 10 * 1024 ** 3;

async function setUsage(user: TestUser, usedBytes: number) {
  await seed({ scenario: 'STORAGE_USAGE', params: { userId: user.id, usedBytes } });
}

async function openEditor(page: Page, title: string) {
  await page.goto('/memory-editor');
  await expect(page.getByTestId('screen-S-32')).toBeVisible();
  await page.getByTestId('editor-title').fill(title);
}

test.describe('Хадгалах сангийн квот', () => {
  test('AC-200 8 GB (80%) дээр upload → анхааруулга, S-85 «8 / 10 GB»; 10 GB-д upload зогсож S-98 (хэрэглээ, хогийн сав)', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac200');
    const page = partnerA.page;
    await setUsage(a, QUOTA * 0.8);
    await signInUi(page, a);
    const jpeg = await makeJpeg(page);

    // 80%: upload зөвшөөрөгдөнө, гэхдээ анхааруулна
    await openEditor(page, 'Квотын анхааруулга');
    await pickFiles(page, 'editor-pick', [{ name: 'warn.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
    await expect(page.getByTestId('editor-media-0-status')).toHaveText('Илгээгдсэн', { timeout: 20_000 });
    await expect(page.getByTestId('editor-quota-warning')).toHaveText(/Хадгалах сан 80%-иас дүүрсэн/);
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('screen-S-31')).toBeVisible({ timeout: 20_000 });

    // S-85: «X / 10 GB» ба анхааруулга
    await page.goto('/settings/data');
    await expect(page.getByTestId('screen-S-85')).toBeVisible();
    await expect(page.getByTestId('data-usage-text')).toHaveText('8 / 10 GB ашиглаж байна');
    await expect(page.getByTestId('data-usage-warning')).toBeVisible();

    // 10 GB: дараагийн upload зогсож S-98
    await setUsage(a, QUOTA - 100);
    await openEditor(page, 'Дүүрсэн');
    await pickFiles(page, 'editor-pick', [{ name: 'full.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
    await expect(page.getByTestId('screen-S-98')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('storage-usage-text')).toHaveText('10 / 10 GB');
    await expect(page.getByTestId('screen-S-98')).toContainText('хадгалах сан дүүрсэн');
    await expect(page.getByTestId('screen-S-98')).toContainText('Хогийн савыг хоослох');
    // Сервер дээр хэрэглээ өсөөгүй (upload зогссон)
    expect((await apiJson<{ usedBytes: number }>(a, 'GET', '/storage/usage')).usedBytes).toBe(QUOTA - 100);

    // Хогийн сав цэвэрлэх санал → S-37
    await page.getByTestId('storage-trash').click();
    await expect(page.getByTestId('screen-S-37')).toBeVisible();

    await page.goto('/settings/data');
    await expect(page.getByTestId('data-usage-text')).toHaveText('10 / 10 GB ашиглаж байна');
  });
});
