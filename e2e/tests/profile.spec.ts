import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { apiJson, createVerifiedUser, signInUi, type TestUser } from '../support/users';

/**
 * S-81 Профайл тохиргоо (T-26, FR-1.4, AC-62): дуудах нэр ба хотыг солиход хамтрагчийн
 * апп-д ≤ 5 с-д шинэ утга; 10 MB-аас их зургийг тайлбартай татгалзах; ≤ 10 MB зурагт
 * дугуй тайралтын preview, хадгалахад шинэ зураг.
 */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function linkViaApi(a: TestUser, b: TestUser) {
  const invite = await apiJson<{ code: string }>(a, 'POST', '/invites');
  const pairing = await apiJson<{ id: string }>(b, 'POST', '/pairings', { code: invite.code });
  await apiJson(a, 'POST', `/pairings/${pairing.id}/confirm`);
}

/** `expo-image-picker` вэбд нуугдмал `<input type=file>` нээнэ — файлыг тэнд өгнө. */
async function pickFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('avatar-pick').click();
  await (await chooser).setFiles(file);
}

test.describe('S-81 профайл', () => {
  test('AC-62 дуудах нэр, хот солигдоход хамтрагчид ≤ 5 с; > 10 MB зураг татгалзана; ≤ 10 MB-д дугуй preview, хадгална', async ({
    partnerA,
    partnerB,
  }) => {
    const a = await createVerifiedUser(partnerA.name, 'ac62a');
    const b = await createVerifiedUser(partnerB.name, 'ac62b');
    await linkViaApi(a, b);

    // B хамтрагчийнхаа нэрийг S-12-ийн бичвэрээс харна (`['couple']` — `profile.updated` шинэчилнэ)
    await signInUi(partnerB.page, b);
    await partnerB.page.goto('/linked?celebrated=1');
    await expect(partnerB.page.getByTestId('screen-S-12')).toContainText(partnerA.name);

    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/settings');
    await partnerA.page.getByTestId('settings-profile').click();
    await expect(partnerA.page.getByTestId('screen-S-81')).toBeVisible();

    const callName = `Батаа${Date.now().toString(36).slice(-3)}`;
    await partnerA.page.getByTestId('settings-call-name').fill(callName);

    // Хот: гадны үйлчилгээ унасан бол (503) тайлбар харагдаж, хотгүйгээр хадгална
    await partnerA.page.getByTestId('profile-city').fill('Дархан');
    const option = partnerA.page.getByTestId('profile-city-option').first();
    const unavailable = partnerA.page.getByTestId('profile-city-unavailable');
    await expect(option.or(unavailable)).toBeVisible();
    const cityChosen = await option.isVisible();
    if (cityChosen) await option.click();

    const savedAt = Date.now();
    await partnerA.page.getByTestId('settings-profile-save').click();
    await expect(partnerA.page.getByTestId('settings-profile-saved')).toBeVisible();

    await expect(partnerB.page.getByTestId('screen-S-12')).toContainText(callName, { timeout: 5_000 });
    expect(Date.now() - savedAt).toBeLessThanOrEqual(5_000 + 1_000);
    const couple = await apiJson<{ partner: { callName: string | null; city: { name: string } | null } }>(b, 'GET', '/couple');
    expect(couple.partner.callName).toBe(callName);
    if (cityChosen) expect(couple.partner.city?.name).toContain('Дархан');

    // > 10 MB — тайлбартай татгалзал
    await pickFile(partnerA.page, { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1) });
    await expect(partnerA.page.getByTestId('avatar-too-large')).toContainText('10 MB');
    await expect(partnerA.page.getByTestId('avatar-preview')).toHaveCount(0);

    // ≤ 10 MB — дугуй preview → хадгалах
    await pickFile(partnerA.page, { name: 'me.png', mimeType: 'image/png', buffer: PNG_1X1 });
    const preview = partnerA.page.getByTestId('avatar-preview');
    await expect(preview).toBeVisible();
    const box = await preview.boundingBox();
    expect(box && Math.abs(box.width - box.height)).toBeLessThan(1);
    expect(parseFloat(await preview.evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThanOrEqual((box?.width ?? 0) / 2);

    await partnerA.page.getByTestId('avatar-save').click();
    await expect(partnerA.page.getByTestId('avatar-saved')).toBeVisible({ timeout: 20_000 });
    const me = await apiJson<{ avatar: { id: string } | null }>(a, 'GET', '/me');
    expect(me.avatar).not.toBeNull();
    await expect(partnerA.page.getByTestId('avatar-current')).toBeVisible();
  });
});
