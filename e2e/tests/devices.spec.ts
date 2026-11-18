import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { createVerifiedUser, signInUi } from '../support/users';

/** Идэвхтэй төхөөрөмжүүд (T-71, FR-14.3, FR-14.4): алсаас гаргах (AC-56), бүгдээс гарах (AC-125). */
test.describe('Идэвхтэй төхөөрөмжүүд', () => {
  test('AC-56 AC-125 нэг context-оос нөгөөг гаргахад нөгөө нь нэвтрэх дэлгэц рүү; бүгдээс гарахад өөрөө ч', async ({ partnerA, partnerB }) => {
    const user = await createVerifiedUser('Бат', 'devices');
    await signInUi(partnerA.page, user);
    await signInUi(partnerB.page, user);

    await partnerA.page.goto('/settings/security');
    await expect(partnerA.page.getByTestId('screen-S-84')).toBeVisible();
    const revoke = partnerA.page.locator('[data-testid^="device-revoke-"]');
    await expect(revoke.first()).toBeVisible();
    // createVerifiedUser-ийн API session ба B — одоогийнхоос бусдыг бүгдийг гаргана
    for (let n = await revoke.count(); n > 0; n -= 1) {
      await revoke.first().click();
      await expect(revoke).toHaveCount(n - 1);
    }

    await partnerB.page.reload();
    await expect(partnerB.page).toHaveURL(/login/, { timeout: 15_000 });

    await partnerA.page.getByTestId('devices-revoke-all').click();
    await partnerA.page.getByTestId('devices-confirm-confirm').click();
    await expect(partnerA.page).toHaveURL(/login/, { timeout: 15_000 });
  });
});
