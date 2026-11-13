import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { messagesApi, messageStatus, openChat, sendTextApi } from '../support/chat';
import { linkedCouple, patchMe } from '../support/couple';
import { apiAs } from '../support/users';

/**
 * Чат (T-43, T-47, FR-6.1…6.4, FR-6.6, FR-6.10): REST `POST /messages` → WS `chat.message.created`
 * (AC-27), outbox ба `clientMessageId` (AC-28), уншсан (AC-29), reply/засвар (AC-88), төлөв (AC-176),
 * тэгш «бичиж байна» (AC-177), «Хайртай» (AC-178).
 */
test.describe('Чат', () => {
  test('AC-27 A 100 мессеж илгээхэд B-д хүрэх хугацааны p95 ≤ 1 с', async ({ partnerA, partnerB }) => {
    test.setTimeout(240_000);
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac27');
    await openChat(partnerB.page, b);

    const latencies: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const text = `p95-${i}-${Date.now()}`;
      const started = Date.now();
      await sendTextApi(a, text);
      await expect(partnerB.page.getByText(text, { exact: true })).toBeVisible({ timeout: 5_000 });
      latencies.push(Date.now() - started);
    }
    latencies.sort((x, y) => x - y);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
    console.log(`AC-27 p95 = ${p95} ms`);
    expect(p95).toBeLessThanOrEqual(1_000);
  });

  test('AC-28 offline-д бичсэн 3 мессеж онлайн болоход B-д яг 3, дарааллаар, давхардалгүй', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac28');
    await openChat(partnerA.page, a);
    await partnerA.context.setOffline(true);
    for (const text of ['нэг', 'хоёр', 'гурав']) {
      await partnerA.page.getByTestId('composer-input').fill(text);
      await partnerA.page.getByTestId('composer-send').click();
    }
    await expect(partnerA.page.locator('[data-testid="message-status"][data-status="SENDING"]')).toHaveCount(3);
    await partnerA.context.setOffline(false);
    await expect.poll(async () => (await messagesApi(b)).items.map((m) => m.text), { timeout: 15_000 }).toEqual(['нэг', 'хоёр', 'гурав']);
    await openChat(partnerB.page, b);
    for (const text of ['нэг', 'хоёр', 'гурав']) await expect(partnerB.page.getByText(text, { exact: true })).toHaveCount(1);
  });

  test('AC-29 AC-176 A-д төлөв: илгээгдсэн → хүргэгдсэн → уншсан; устгасан мессеж хоёр талд «Мессеж устгагдсан»', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac176');
    const sent = await sendTextApi(a, 'Төлөв шалгах');
    expect(sent.status).toBe('SENT');
    await openChat(partnerB.page, b);
    await expect(partnerB.page.getByText('Төлөв шалгах')).toBeVisible();
    await expect.poll(() => messageStatus(a, sent.id), { timeout: 10_000 }).toBe('READ');
    await openChat(partnerA.page, a);
    await expect(partnerA.page.getByTestId(`message-${sent.clientMessageId}`).getByTestId('message-status')).toHaveAttribute('data-status', 'READ');

    const gone = await sendTextApi(a, 'Устгах мессеж');
    await expect(partnerB.page.getByText('Устгах мессеж')).toBeVisible();
    expect((await apiAs(a, 'DELETE', `/messages/${gone.id}`)).status).toBe(204);
    await expect(partnerB.page.getByTestId(`message-${gone.clientMessageId}`).getByTestId('message-deleted')).toBeVisible();
    await expect(partnerA.page.getByTestId(`message-${gone.clientMessageId}`).getByTestId('message-deleted')).toBeVisible();
  });

  test('AC-88 reply ишлэлтэй, засвар хоёр талд «засварласан»', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac88');
    const original = await sendTextApi(b, 'Тэрэлж явах уу?');
    await openChat(partnerA.page, a);
    await partnerA.page.getByTestId(`message-${original.clientMessageId}`).click({ button: 'left', delay: 600 });
    await partnerA.page.getByTestId('message-action-reply').click();
    await partnerA.page.getByTestId('composer-input').fill('Тэгье!');
    await partnerA.page.getByTestId('composer-send').click();
    await openChat(partnerB.page, b);
    const reply = partnerB.page.getByTestId('message-quote').filter({ hasText: 'Тэрэлж явах уу?' });
    await expect(reply).toBeVisible();

    const mine = (await messagesApi(a)).items.find((m) => m.text === 'Тэгье!');
    expect(mine?.replyTo?.id).toBe(original.id);
    expect((await apiAs(a, 'PATCH', `/messages/${mine!.id}`, { text: 'Тэгье, бямба гарагт!' })).status).toBe(200);
    await expect(partnerB.page.getByText('Тэгье, бямба гарагт!')).toBeVisible();
    await expect(partnerB.page.getByTestId(`message-${mine!.clientMessageId}`).getByTestId('message-edited')).toBeVisible();
  });

  test('AC-177 «Бичиж байна» тэгш: A унтраасан бол хэн нь ч харахгүй', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac177');
    await openChat(partnerA.page, a);
    await openChat(partnerB.page, b);
    await partnerB.page.getByTestId('composer-input').pressSequentially('сайн', { delay: 50 });
    await expect(partnerA.page.getByTestId('chat-typing')).toBeVisible();

    await patchMe(a, { typingVisible: false });
    await partnerB.page.getByTestId('composer-input').fill('');
    await partnerB.page.waitForTimeout(4_500);
    await partnerB.page.getByTestId('composer-input').pressSequentially('дахин', { delay: 50 });
    await partnerA.page.getByTestId('composer-input').pressSequentially('би ч', { delay: 50 });
    await partnerA.page.waitForTimeout(1_500);
    await expect(partnerA.page.getByTestId('chat-typing')).toHaveCount(0);
    await expect(partnerB.page.getByTestId('chat-typing')).toHaveCount(0);
  });

  test('AC-178 чатын «Хайртай» товч зүрх илгээнэ (FR-4.1-тэй ижил дохио)', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac178');
    await openChat(partnerA.page, a);
    const signal = partnerA.page.waitForResponse((r) => r.url().endsWith('/signals') && r.request().method() === 'POST');
    await partnerA.page.getByTestId('composer-heart').click();
    expect((await signal).status()).toBe(201);
    const dashboard = (await (await apiAs(b, 'GET', '/dashboard')).json()) as { signalsToday: { received: number } };
    expect(dashboard.signalsToday.received).toBeGreaterThanOrEqual(1);
  });
});
