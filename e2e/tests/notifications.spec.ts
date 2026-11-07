import { expect, test } from '@playwright/test';

import { apiAs, apiJson, createVerifiedUser, signInUi, type TestUser } from '../support/users';

/**
 * S-24 Мэдэгдлийн жагсаалт (T-25, FR-13.4). 3 уншаагүй мэдэгдлийг жинхэнэ үйл явдлаар
 * үүсгэнэ: B урилгыг ашиглах (INVITE_USED) → B цуцлах (PAIRING_CANCELLED) → шинэ урилгыг
 * дахин ашиглах (INVITE_USED) — бүгд A-д.
 */
interface NotificationPage {
  items: { id: string; deepLink: string; readAt?: string | null }[];
  unreadCount: number;
}

async function threeUnreadFor(a: TestUser, b: TestUser) {
  const first = await apiJson<{ code: string }>(a, 'POST', '/invites');
  const pairing = await apiJson<{ id: string }>(b, 'POST', '/pairings', { code: first.code });
  expect((await apiAs(b, 'POST', `/pairings/${pairing.id}/cancel`)).status).toBe(204);
  const second = await apiJson<{ code: string }>(a, 'POST', '/invites');
  await apiJson(b, 'POST', '/pairings', { code: second.code });
  await expect.poll(async () => (await apiJson<NotificationPage>(a, 'GET', '/notifications')).unreadCount).toBe(3);
}

test.describe('S-24 мэдэгдэл', () => {
  test('AC-120 уншаагүй «3»; нэгийг товшвол холбогдох дэлгэц ба «2»; «Бүгдийг уншсан болгох» → «0»', async ({ page }) => {
    const a = await createVerifiedUser('Бат', 'ac120a');
    const b = await createVerifiedUser('Ану', 'ac120b');
    await threeUnreadFor(a, b);

    await signInUi(page, a);
    await expect(page.getByTestId('topbar-unread')).toHaveText('3');
    await page.getByTestId('topbar-bell').click();
    await expect(page.getByTestId('screen-S-24')).toBeVisible();
    await expect(page.getByTestId('notifications-unread-count')).toHaveText('3 уншаагүй');
    await expect(page.getByTestId('notification-item-unread')).toHaveCount(3);

    // Хамгийн сүүлийнх нь INVITE_USED → S-10 (`/join-confirm?pairing=…`)
    await page.getByTestId('notification-item-unread').first().click();
    await expect(page.getByTestId('screen-S-10')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('screen-S-24')).toBeVisible();
    await expect(page.getByTestId('notifications-unread-count')).toHaveText('2 уншаагүй');
    expect((await apiJson<NotificationPage>(a, 'GET', '/notifications')).unreadCount).toBe(2);

    await page.getByTestId('notifications-read-all').click();
    await expect(page.getByTestId('notifications-unread-count')).toHaveText('0 уншаагүй');
    await expect(page.getByTestId('notification-item-unread')).toHaveCount(0);
    await expect(page.getByTestId('topbar-unread')).toHaveCount(0);
    expect((await apiJson<NotificationPage>(a, 'GET', '/notifications')).unreadCount).toBe(0);
  });
});
