import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { openChat } from '../support/chat';
import { resetServerClock, setServerClock } from '../support/clock';
import { linkedCouple } from '../support/couple';

/** Хамтын амлалт (T-49, FR-6.11): санал → зөвшөөрөх → 7 хоног толгойд → «Амлалтаа биелүүлсэн үү?» (AC-93). */
test.describe('Хамтын амлалт', () => {
  test.afterEach(async () => resetServerClock());

  test('AC-93 A санал болгож B зөвшөөрөхөд толгойд 7 хоног; дуусахад «Амлалтаа биелүүлсэн үү?»', async ({ partnerA, partnerB }) => {
    const start = new Date('2026-11-07T04:00:00Z');
    await setServerClock(start);
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac93');

    await openChat(partnerA.page, a);
    await partnerA.page.goto('/chat/promise');
    await partnerA.page.getByTestId('promise-input').fill('Ням гараг бүр утасгүй орой');
    await partnerA.page.getByTestId('promise-propose').click();
    await expect(partnerA.page.getByTestId('promise-waiting')).toBeVisible();

    await openChat(partnerB.page, b);
    await expect(partnerB.page.getByTestId('chat-promise')).toContainText('Ням гараг бүр утасгүй орой');
    await partnerB.page.getByTestId('chat-promise').click();
    await partnerB.page.getByTestId('promise-accept').click();
    await expect(partnerB.page.getByTestId('promise-status')).toHaveText('Энэ 7 хоногийн амлалт');

    await partnerA.page.goto('/chat');
    await expect(partnerA.page.getByTestId('chat-promise')).toContainText('Энэ 7 хоногийн амлалт');

    // 7 хоног өнгөрөхөд ENDED — сервер хандалт бүрд хосын бүсээр шилжүүлнэ
    await setServerClock(new Date(start.getTime() + 8 * 24 * 3600_000));
    await partnerA.page.goto('/chat/promise');
    await expect(partnerA.page.getByTestId('promise-outcome')).toBeVisible({ timeout: 10_000 });
    await partnerA.page.getByTestId('promise-kept').click();
    await expect(partnerA.page.getByTestId('promise-kept')).toBeVisible();
  });
});
