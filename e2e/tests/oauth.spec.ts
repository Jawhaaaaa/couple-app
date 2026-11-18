import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import type { IdpUser, OAuthIdpMock } from '../mocks/oauthIdp';
import { confirmStartDate, linkViaApi } from '../support/couple';
import { API_BASE } from '../support/env';
import { oauthLoginApi, routeOAuthStart, startConfiguredIdp } from '../support/oauth';
import { apiAs, createVerifiedUser, type TestUser } from '../support/users';

/**
 * S-03 «Google-ээр нэвтрэх» (FR-1.5, AC-06, DD-AURA-032): web export (localhost) → backend
 * `start` → тестийн IdP (GAP-18, `mocks/oauthIdp.ts`) → backend `callback` → `/oauth-callback` →
 * `POST /auth/oauth/exchange`. Шинэ хэрэглэгч S-07, бүртгэлтэй нь (хостой) S-20. Бодит Google — ГАР.
 * Тохиргоо: `support/oauth.ts`-ийн тайлбар.
 */
let idp: OAuthIdpMock;

test.beforeEach(async () => {
  idp = await startConfiguredIdp();
});

test.afterEach(async () => {
  await idp?.close();
});

function googleUser(name: string): IdpUser {
  const id = randomUUID().slice(0, 8);
  return { sub: `google-${id}`, email: `google+${id}@aura.test`, name, emailVerified: true };
}

test.describe('S-03 Google нэвтрэлт', () => {
  test('AC-06 шинэ хэрэглэгч: S-03 «Google-ээр нэвтрэх» → IdP → буцаад S-07 профайл', async ({ page, context }) => {
    const user = googleUser('Тэмүүлэн');
    idp.setUser(user);
    await routeOAuthStart(context);

    await page.goto('/login');
    await expect(page.getByTestId('screen-S-03')).toBeVisible();
    const google = page.getByTestId('login-google');
    await expect(google).toHaveText('Google-ээр нэвтрэх');
    await google.click();

    await expect(page.getByTestId('screen-S-07')).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/profile/);
  });

  test('AC-06 бүртгэлтэй (хостой) хэрэглэгч: S-03 «Google-ээр нэвтрэх» → IdP → буцаад S-20 нүүр', async ({ page, context }) => {
    // Бэлтгэл (UI-гүй): өмнө нь Google-ээр бүртгүүлж, бодлогоо зөвшөөрч, хос болсон
    const user = googleUser('Сарнай');
    const first = await oauthLoginApi(idp, user);
    expect(first.isNewUser).toBe(true);
    const googleAccount: TestUser = { id: first.user.id, email: user.email, password: '', displayName: user.name, accessToken: first.accessToken };
    const { version } = (await (await fetch(`${API_BASE}/policies/current`)).json()) as { version: string };
    expect((await apiAs(googleAccount, 'POST', '/me/policy-acceptance', { version })).status).toBe(204);
    const partner = await createVerifiedUser('Ану', 'oauthb');
    await linkViaApi(googleAccount, partner);
    await confirmStartDate(googleAccount, partner, '2025-06-01');

    await routeOAuthStart(context);
    await page.goto('/login');
    await expect(page.getByTestId('screen-S-03')).toBeVisible();
    await page.getByTestId('login-google').click();

    await expect(page.getByTestId('screen-S-20')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('screen-S-07')).toHaveCount(0);
    await expect(page.getByTestId('person-partner-name')).toHaveText('Ану');
  });
});
