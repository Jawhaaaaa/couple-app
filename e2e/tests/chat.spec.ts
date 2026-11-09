import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { openChat, sendTextApi } from '../support/chat';
import { linkedCouple } from '../support/couple';

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
});
