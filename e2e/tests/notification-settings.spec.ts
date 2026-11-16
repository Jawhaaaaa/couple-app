import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple, patchMe } from '../support/couple';
import { signInUi } from '../support/users';

/** S-83 мэдэгдлийн тохиргоо (T-69, FR-13.2, FR-13.7): анхдагч DND 23:00–07:00 (AC-184), «Түр тайван байх» (AC-123). */
test.describe('Мэдэгдлийн тохиргоо', () => {
  test('AC-184 Asia/Tokyo-гийн шинэ хэрэглэгчид «Бүү саад бол» 23:00–07:00, төрөл бүр тусдаа товчтой', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac184');
    await patchMe(a, { timezone: 'Asia/Tokyo' });
    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/settings/notifications');
    await expect(partnerA.page.getByTestId('screen-S-83')).toBeVisible();
    await expect(partnerA.page.getByTestId('notif-dndStart')).toHaveValue('23:00');
    await expect(partnerA.page.getByTestId('notif-dndEnd')).toHaveValue('07:00');
    for (const key of ['messages', 'signals', 'memories', 'plans', 'reminders', 'letters', 'question']) {
      await expect(partnerA.page.getByTestId(`notif-type-${key}`)).toBeVisible();
    }
  });

  test('AC-123 A 24 цаг «Түр тайван» асаахад B нүүрэнд 🌙 тэмдэг; дуусгахад алга', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac123');
    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/settings/notifications');
    await partnerA.page.getByTestId('notif-quiet-1440').click();
    await expect(partnerA.page.getByTestId('notif-notice')).toBeVisible();

    await signInUi(partnerB.page, b);
    await expect(partnerB.page.getByTestId('person-partner-quiet')).toBeVisible();

    await partnerA.page.getByTestId('notif-quiet-stop').click();
    // Сервер унтраасныг баталсны дараа л B-г дахин ачаална (өмнө нь reload нь DELETE-ээс түрүүлж
    // WebKit-д 🌙 хэвээр үлддэг байв — CI run 43790105841)
    await expect(partnerA.page.getByTestId('notif-notice')).toHaveText('Тайван горим дууслаа');
    await partnerB.page.reload();
    await expect(partnerB.page.getByTestId('screen-S-20')).toBeVisible();
    await expect(partnerB.page.getByTestId('person-partner-quiet')).toHaveCount(0);
  });
});
