import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { sendTextApi } from '../support/chat';
import { createMemoryApi, makeJpeg } from '../support/memories';
import { resetServerClock, setClock, setServerClock } from '../support/clock';
import { confirmStartDate, linkedCouple, patchMe } from '../support/couple';
import { apiJson, signInUi } from '../support/users';

/**
 * S-20 Нүүр (T-31, FR-3): тоолуур SD-01 (AC-13), хамтрагчийн цаг ба бүсийн зөрүү (AC-14),
 * хоосон хосын хэсэг бүрийн хоосон төлөв (AC-72 (б)). Хоёр хамтрагч = хоёр browser context.
 */
const NOON_UB = '2026-11-07T12:00:00+08:00';

test.afterEach(async () => {
  await resetServerClock();
});

test.describe('S-20 нүүр', () => {
  test('AC-13 2024-10-24-нөөс 2026-11-07: хоёр талд «745 хоног хамтдаа» (ANIM-04), товшвол S-21 «2 жил 0 сар 14 өдөр»', async ({
    partnerA,
    partnerB,
  }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac13');
    await patchMe(b, { timezone: 'America/New_York' });
    await confirmStartDate(a, b, '2024-10-24');
    await setClock([partnerA.page, partnerB.page], NOON_UB);

    for (const [page, user] of [
      [partnerA.page, a],
      [partnerB.page, b],
    ] as const) {
      await signInUi(page, user);
      await expect(page.getByTestId('screen-S-20')).toBeVisible();
      await expect(page.getByTestId('anim-ANIM-04')).toBeAttached();
      // Одометр ≤ 900 мс эргэлдээд энгийн бичвэр болно
      await expect(page.getByTestId('counter-days')).toHaveText('745', { timeout: 2_000 });
      await expect(page.getByTestId('home-counter')).toHaveAttribute('aria-label', /745 хоног хамтдаа/);
      await expect(page.getByTestId('home-counter-since')).toHaveText('2024.10.24 өдрөөс хойш');
    }

    // AC-69: S-21 задаргаа, эхэлсэн өдөр, дараагийн ой
    await partnerA.page.getByTestId('home-counter').click();
    await expect(partnerA.page.getByTestId('screen-S-21')).toBeVisible();
    await expect(partnerA.page.getByTestId('counter-breakdown')).toHaveText('2 жил 0 сар 14 өдөр');
    await expect(partnerA.page.getByTestId('counter-start')).toContainText('2024.10.24');
    await expect(partnerA.page.getByTestId('counter-next-days')).toContainText('2027.07.20');
  });

  test('AC-65 эхэлсэн өдөр батлагдаагүй бол тоолуурын оронд «Эхэлсэн өдрөө батлаарай» → S-11', async ({ partnerA, partnerB }) => {
    const [a] = await linkedCouple(partnerA.name, partnerB.name, 'ac65h');
    await signInUi(partnerA.page, a);
    await expect(partnerA.page.getByTestId('home-counter-unconfirmed')).toContainText('Эхэлсэн өдрөө батлаарай');
    await partnerA.page.getByTestId('home-counter-confirm').click();
    await expect(partnerA.page.getByTestId('screen-S-11')).toBeVisible();
  });

  test('AC-14 B Asia/Tokyo, A Asia/Ulaanbaatar — B-гийн картанд түүний цаг ба «+1 цаг»', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac14');
    await patchMe(b, { timezone: 'Asia/Tokyo' });
    await setClock([partnerA.page], NOON_UB);
    await signInUi(partnerA.page, a);

    const card = partnerA.page.getByTestId('person-partner');
    await expect(card).toBeVisible();
    await expect(partnerA.page.getByTestId('person-partner-name')).toHaveText(partnerB.name);
    await expect(partnerA.page.getByTestId('person-partner-time')).toHaveText(/^0?13:00$/);
    await expect(partnerA.page.getByTestId('person-partner-offset')).toHaveText('+1 цаг');
    await expect(partnerA.page.getByTestId('person-me-time')).toHaveText(/^0?12:00$/);
  });

  test('AC-72 (б) хоосон хос — хэсэг бүр маскот + 1 өгүүлбэр + үйлдлийн товчтой', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac72');
    await confirmStartDate(a, b, '2025-01-01');
    await signInUi(partnerA.page, a);
    const page = partnerA.page;
    await expect(page.getByTestId('screen-S-20')).toBeVisible();

    const sections: [string, RegExp][] = [
      ['next-date', /\/plans$/],
      ['upcoming', /\/together$/],
      ['memories', /\/memories$/],
      ['messages', /\/chat$/],
    ];
    for (const [name, url] of sections) {
      const empty = page.getByTestId(`home-section-${name}-empty`);
      await expect(empty).toBeVisible();
      await expect(empty.getByTestId('anim-ANIM-11')).toBeAttached();
      await expect(empty.getByLabel('Маскот Бөмбөлөг ба Бөмбий')).toBeVisible();
      const action = page.getByTestId(`home-section-${name}-action`);
      await expect(action).toBeVisible();
      await action.click();
      await expect(page).toHaveURL(url);
      await page.goto('/home');
      await expect(page.getByTestId('screen-S-20')).toBeVisible();
    }
  });

  test('AC-72 (а) болзоо, ой, сүүлийн дурсамж, уншаагүй мессеж бодит өгөгдлөөр', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac72a');
    await confirmStartDate(a, b, '2025-01-01');
    const startsAt = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    await apiJson(b, 'POST', '/plans', {
      clientId: randomUUID(),
      title: 'Хустайн нуруу руу',
      startsAt,
      timezone: 'Asia/Ulaanbaatar',
      reminderOffsets: [60],
      recurrence: 'NONE',
      checklist: [],
    });
    await createMemoryApi(b, await makeJpeg(partnerA.page), { title: 'Анхны цас', occurredOn: '2026-11-01' });
    await sendTextApi(b, 'Уншаагүй мессеж 1');
    await sendTextApi(b, 'Уншаагүй мессеж 2');

    await signInUi(partnerA.page, a);
    const page = partnerA.page;
    await expect(page.getByTestId('home-next-date')).toContainText('Хустайн нуруу руу');
    await expect(page.getByTestId('home-upcoming-item').first()).toBeVisible();
    await expect(page.getByTestId('home-memory').filter({ hasText: 'Анхны цас' })).toBeVisible();
    await expect(page.getByTestId('home-unread-messages')).toContainText('2');
  });

  test('AC-73 2025-11-07-ны дурсамжтай хост 2026-11-07-нд «Жилийн өмнөх өнөөдөр» → S-23; өөр өдөр нуугдана', async ({ partnerA, partnerB }) => {
    await setServerClock('2026-11-07T04:00:00Z');
    try {
      const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac73');
      await confirmStartDate(a, b, '2024-10-24');
      await createMemoryApi(a, await makeJpeg(partnerA.page), { title: 'Нэг жилийн өмнө', occurredOn: '2025-11-07' });
      await partnerA.page.clock.setFixedTime(new Date('2026-11-07T04:00:00Z'));
      await signInUi(partnerA.page, a);
      await partnerA.page.getByTestId('home-on-this-day').click();
      await expect(partnerA.page.getByTestId('screen-S-23')).toBeVisible();
      await expect(partnerA.page.getByTestId('on-this-day-year')).toContainText('2025');
      await expect(partnerA.page.getByText('Нэг жилийн өмнө')).toBeVisible();

      await setServerClock('2026-11-08T04:00:00Z');
      await partnerA.page.clock.setFixedTime(new Date('2026-11-08T04:00:00Z'));
      await partnerA.page.goto('/home');
      await expect(partnerA.page.getByTestId('screen-S-20')).toBeVisible();
      await expect(partnerA.page.getByTestId('home-on-this-day')).toHaveCount(0);
    } finally {
      await resetServerClock();
    }
  });
});
