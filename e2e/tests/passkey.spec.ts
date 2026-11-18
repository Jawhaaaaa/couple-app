import type { CDPSession, Page } from '@playwright/test';

import { expect, test } from '../fixtures/twoPartners';
import { confirmStartDate, linkedCouple } from '../support/couple';
import { signInUi, type TestUser } from '../support/users';

/**
 * S-102 Passkey түгжээ (T-85, FR-19.6, DD-AURA-033, AC-157; IT нь `PasskeyIT`): S-84-д PIN тохируулаад
 * S-102-оос passkey бүртгэнэ (`credentials.create` → `/passkeys`); апп дахин нээгдэхэд (хүйтэн эхлэл →
 * S-14) passkey баталгаажуулалт өөрөө асуугдаж серверээр (`/passkeys/assertion`) тайлагдана;
 * authenticator татгалзвал эсвэл байхгүй бол PIN.
 *
 * Authenticator: Chromium-ийн CDP virtual authenticator (`WebAuthn.addVirtualAuthenticator`, platform
 * — `internal`, UV-тэй). WebKit/Firefox-д virtual authenticator-ийн API алга тул тэр тест Chromium-д;
 * authenticator-гүй орчны (PIN) тест гурван хөтөчид.
 */
const PIN = '1357';

async function setupPin(page: Page) {
  await page.goto('/settings/security');
  await expect(page.getByTestId('screen-S-84')).toBeVisible();
  await page.getByTestId('lock-enable').click();
  await page.getByTestId('lock-pin-input').fill(PIN);
  await page.getByTestId('lock-pin-next').click();
  await page.getByTestId('lock-pin-input').fill(PIN);
  await page.getByTestId('lock-pin-next').click();
  await expect(page.getByTestId('lock-notice')).toBeVisible();
}

async function enterPin(page: Page) {
  for (const digit of PIN) await page.getByTestId(`lock-key-${digit}`).click();
}

/** `navigator.credentials.get`-ийг тоолно; дуудагдах агшинд S-14 (түгжээ) дэлгэцэнд байсан эсэх. */
async function spyCredentialGet(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __passkeyAsks: { lockVisible: boolean }[] };
    w.__passkeyAsks = [];
    const original = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = (options?: CredentialRequestOptions) => {
      if (options?.publicKey) w.__passkeyAsks.push({ lockVisible: !!document.querySelector('[data-testid="screen-S-14"]') });
      return original(options);
    };
  });
}

const passkeyAsks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __passkeyAsks?: { lockVisible: boolean }[] }).__passkeyAsks ?? []);

let user: TestUser;

test.beforeEach(async ({}, testInfo) => {
  const [a, b] = await linkedCouple('Бат', 'Ану', `passkey${testInfo.project.name.slice(0, 3)}`);
  await confirmStartDate(a, b, '2025-02-14');
  user = a;
});

test.describe('AC-157 Passkey түгжээ', () => {
  test('AC-157 S-102 passkey тохируулаад апп дахин нээхэд passkey асууж тайлна; authenticator татгалзвал PIN', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtual authenticator (CDP WebAuthn.addVirtualAuthenticator) зөвхөн Chromium-д');
    const cdp: CDPSession = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = (await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    })) as { authenticatorId: string };
    await spyCredentialGet(page);

    await signInUi(page, user);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await setupPin(page);

    // S-84 → S-102: platform authenticator илэрсэн, PIN нөөц тохируулсан → «Passkey тохируулах»
    await page.getByTestId('lock-passkey-open').click();
    await expect(page.getByTestId('screen-S-102')).toBeVisible();
    await expect(page.getByTestId('passkey-pin-row')).toContainText('Тохируулсан');
    await expect(page.getByTestId('passkey-unsupported')).toHaveCount(0);
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/passkeys') && r.request().method() === 'POST');
    await page.getByTestId('passkey-setup').click();
    expect((await saved).status()).toBe(201);
    await expect(page.getByTestId('passkey-enabled')).toBeVisible();
    await expect(page.getByTestId('passkey-notice')).toContainText('Passkey тохируулагдлаа');
    const { credentials } = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })) as { credentials: { signCount: number }[] };
    expect(credentials).toHaveLength(1);

    // Апп дахин нээх → S-14 гарч passkey өөрөө асуугдана → сервер баталгаажуулж тайлна (PIN оруулахгүй)
    const verified = page.waitForResponse((r) => r.url().endsWith('/passkeys/assertion'));
    await page.goto('/home');
    const assertion = await verified;
    expect(assertion.status()).toBe(200);
    expect(await assertion.json()).toMatchObject({ verified: true });
    await expect(page.getByTestId('screen-S-14')).toHaveCount(0);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    const asks = await passkeyAsks(page);
    expect(asks.length).toBeGreaterThanOrEqual(1);
    expect(asks[0].lockVisible, 'passkey түгжээний дэлгэц (S-14) дээр асуугдсан').toBe(true);

    // Authenticator баталгаажуулалтаас татгалзана (биометр таарсангүй) → S-14 үлдэж PIN-ээр нээнэ
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    await page.reload();
    await expect(page.getByTestId('screen-S-14')).toBeVisible();
    await expect.poll(async () => (await passkeyAsks(page)).length).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('lock-biometric')).toBeVisible();
    await expect(page.getByTestId('screen-S-14')).toBeVisible();
    await enterPin(page);
    await expect(page.getByTestId('screen-S-14')).toHaveCount(0);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
  });

  test('AC-157 authenticator-гүй орчинд passkey санал болгохгүй, апп дахин нээхэд PIN', async ({ page }) => {
    await signInUi(page, user);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    // Энэ орчинд platform authenticator алга (тестийн хөтчүүдэд Windows Hello / Touch ID холбогдоогүй)
    expect(await page.evaluate(() => PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())).toBe(false);
    await setupPin(page);

    await page.getByTestId('lock-passkey-open').click();
    await expect(page.getByTestId('screen-S-102')).toBeVisible();
    await expect(page.getByTestId('passkey-unsupported')).toContainText('PIN-ээр нээнэ');
    await expect(page.getByTestId('passkey-setup')).toHaveCount(0);

    await page.goto('/home');
    await expect(page.getByTestId('screen-S-14')).toBeVisible();
    await expect(page.getByTestId('lock-biometric')).toHaveCount(0);
    await enterPin(page);
    await expect(page.getByTestId('screen-S-14')).toHaveCount(0);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
  });
});
