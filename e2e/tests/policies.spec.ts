import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { apiJson, signInUi, ZONE } from '../support/users';

/**
 * Нууцлалын бодлого ба нөхцөл (T-76, FR-14.2, FR-14.9, GAP-05, AC-130): S-90 Монгол/Англи хоёр хэлээр,
 * админ/гуравдагч этгээдийн хандалтын дүрэм бодлогод; зөвшөөрсөн хувилбар ба огноо профайлд (S-81).
 */

/** `YYYY-MM-DD` → апп-ын анхдагч `YMD_DOT` (`2026.11.07`). */
const dotted = (date: string) => date.replace(/-/g, '.');

/** Агшныг хэрэглэгчийн бүсийн огноо болгоно (`YYYY-MM-DD`). */
function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

async function openFromSettings(page: Page, row: string, screen: string) {
  await expect(page.getByTestId('screen-S-80')).toBeVisible();
  await page.getByTestId(row).click();
  await expect(page.getByTestId(screen)).toBeVisible();
}

test.describe('Бодлого ба нөхцөл', () => {
  test('AC-130 S-90 Монгол/Англи бодлого, нөхцөл (админ/гуравдагч этгээдийн дүрэм); S-81-д зөвшөөрсөн хувилбар, огноо', async ({ partnerA }) => {
    const page = partnerA.page;
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac130');
    const me = await apiJson<{ policyVersionAccepted: string; policyAcceptedAt: string }>(a, 'GET', '/me');
    expect(me.policyVersionAccepted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const version = dotted(me.policyVersionAccepted);

    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await page.getByTestId('screen-S-20').getByTestId('topbar-avatar').click();
    await openFromSettings(page, 'settings-policies', 'screen-S-90');

    // Монгол — бодлого (анхдагч апп-ын хэлээр)
    await expect(page.getByTestId('policies-accepted')).toHaveText(`Таны зөвшөөрсөн хувилбар: ${version}`);
    const privacy = page.getByTestId('policies-privacy');
    await expect(privacy.getByRole('heading', { name: 'Aura — Нууцлалын бодлого' })).toBeVisible();
    await expect(privacy).toContainText(/[Аа]дмин/);
    await expect(privacy).toContainText('Гуравдагч этгээд');
    await expect(privacy).toContainText('18');
    // Монгол — нөхцөл
    await page.getByTestId('policies-doc-terms').click();
    const terms = page.getByTestId('policies-terms');
    await expect(terms.getByRole('heading', { name: 'Aura — Үйлчилгээний нөхцөл' })).toBeVisible();
    await expect(terms).toContainText('Хориотой агуулга');

    // Англи — нөхцөл, бодлого
    await page.getByTestId('policies-locale-en').click();
    await expect(terms.getByRole('heading', { name: 'Aura — Terms of Service' })).toBeVisible();
    await expect(terms).toContainText('Prohibited content');
    await page.getByTestId('policies-doc-privacy').click();
    await expect(privacy.getByRole('heading', { name: 'Aura — Privacy Policy' })).toBeVisible();
    await expect(privacy).toContainText('Service administrators');
    await expect(privacy).toContainText('Third parties');
    await expect(privacy).not.toContainText('Нууцлал');
    // Апп-ын хэл өөрчлөгдөөгүй (зөвхөн баримтын хэл)
    await expect(page.getByTestId('policies-accepted')).toHaveText(`Таны зөвшөөрсөн хувилбар: ${version}`);

    // S-81 профайл — зөвшөөрсөн хувилбар ба огноо (хэрэглэгчийн бүсээр)
    await page.getByTestId('screen-S-90').getByTestId('stack-back').click();
    await openFromSettings(page, 'settings-profile', 'screen-S-81');
    await expect(page.getByTestId('settings-policy-version')).toHaveText(`Зөвшөөрсөн хувилбар: ${version}`);
    await expect(page.getByTestId('settings-policy-accepted-at')).toHaveText(`Зөвшөөрсөн огноо: ${dotted(localDate(me.policyAcceptedAt, ZONE))}`);
    await page.getByTestId('settings-policy-open').click();
    await expect(page.getByTestId('screen-S-90')).toBeVisible();
  });
});
