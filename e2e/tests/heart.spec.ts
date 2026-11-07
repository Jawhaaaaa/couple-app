import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple, sendSignalApi } from '../support/couple';
import { apiJson, signInUi, type TestUser } from '../support/users';

/**
 * Зүрх, тэврэлт, «Чамайг бодож байна» (T-30, FR-4): A-д ANIM-01, B-д WebSocket-оор ≤ 2 с-д
 * ANIM-02 (AC-17); апп хаалттай үеийн нэгтгэсэн карт (AC-18); 10/мин-ээс хойш cooldown
 * (AC-19); ≥ 0.6 с дарвал тэврэлт (AC-76); ≤ 80 тэмдэгт (AC-77).
 */
interface SignalSummary {
  count: number;
  kinds: string[];
}

async function openHome(page: Page, user: TestUser) {
  await signInUi(page, user);
  await expect(page.getByTestId('screen-S-20')).toBeVisible();
  await expect(page.getByTestId('heart-button')).toBeVisible();
  // STOMP холболт тогтох хүртэл (realtime нь networkidle-д ороогүй ч REST ачаалал дууссан байна)
  await page.waitForLoadState('networkidle');
}

test.describe('Зүрх', () => {
  test('AC-17 A «Зүрх илгээх» → A-д ANIM-01, B-д ≤ 2 с-д ANIM-02', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac17');
    await openHome(partnerA.page, a);
    await openHome(partnerB.page, b);

    await partnerA.page.getByTestId('heart-button').click();
    await expect(partnerA.page.getByTestId('anim-ANIM-01')).toHaveAttribute('data-anim-state', /playing|reduced|off/);
    await expect(partnerA.page.getByTestId('heart-sent')).toBeVisible();

    await expect(partnerB.page.getByTestId('anim-ANIM-02')).toBeAttached({ timeout: 2_000 });
    await expect(partnerB.page.getByTestId('signal-overlay-HEART')).toBeAttached();
    await expect(partnerB.page.getByTestId('signal-overlay-text')).toHaveText(`${partnerA.name} чамд зүрх илгээлээ`);
    // ≈ 1.6 с-ийн дараа өөрөө арилна
    await expect(partnerB.page.getByTestId('signal-overlay-HEART')).toHaveCount(0, { timeout: 5_000 });
  });

  test('AC-18 B апп хаалттай үед A 3 зүрх — B нээхэд нэг нэгтгэсэн карт «3 💗», ANIM-02 нэг удаа', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac18');
    for (let i = 0; i < 3; i += 1) expect((await sendSignalApi(a, 'HEART')).status).toBe(201);
    expect((await apiJson<SignalSummary>(b, 'GET', '/signals/unseen')).count).toBe(3);

    await signInUi(partnerB.page, b);
    const card = partnerB.page.getByTestId('home-unseen-signals');
    await expect(card).toBeVisible();
    await expect(partnerB.page.getByTestId('home-unseen-text')).toContainText('3 💗');
    await expect(partnerB.page.getByTestId('anim-ANIM-02')).toHaveCount(1);

    // Үзсэн гэж тэмдэглэгдсэн — дахин нээхэд карт ба ANIM-02 дахин гарахгүй
    await expect.poll(async () => (await apiJson<SignalSummary>(b, 'GET', '/signals/unseen')).count).toBe(0);
    await partnerB.page.reload();
    await expect(partnerB.page.getByTestId('screen-S-20')).toBeVisible();
    await expect(partnerB.page.getByTestId('home-signals-today')).toBeVisible();
    await expect(partnerB.page.getByTestId('home-unseen-signals')).toHaveCount(0);
    await expect(partnerB.page.getByTestId('anim-ANIM-02')).toHaveCount(0);
  });

  test('AC-19 минутад 10-аас хойших дохио 429 — UI-д алдаа биш, товчны cooldown', async ({ partnerA, partnerB }) => {
    const [a] = await linkedCouple(partnerA.name, partnerB.name, 'ac19');
    for (let i = 0; i < 10; i += 1) expect((await sendSignalApi(a, 'HEART')).status).toBe(201);
    expect((await sendSignalApi(a, 'HEART')).status).toBe(429);

    await openHome(partnerA.page, a);
    await partnerA.page.getByTestId('heart-button').click();
    await expect(partnerA.page.getByTestId('heart-cooldown')).toBeVisible();
    await expect(partnerA.page.getByTestId('heart-button')).toBeDisabled();
    await expect(partnerA.page.getByTestId('heart-error')).toHaveCount(0);
    await expect(partnerA.page.getByRole('alert')).toHaveCount(0);
  });

  test('AC-76 товчийг ≥ 0.6 с дарвал «Тэврэлт» — B-д ANIM-02-оос өөр анимаци', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac76');
    await openHome(partnerA.page, a);
    await openHome(partnerB.page, b);

    await partnerA.page.getByTestId('heart-button').click({ delay: 800 });
    await expect(partnerA.page.getByTestId('anim-HUG')).toBeAttached();
    await expect(partnerA.page.getByTestId('heart-sent')).toHaveText('🤗 Тэврэлт чинь очлоо');

    await expect(partnerB.page.getByTestId('signal-overlay-HUG')).toBeAttached({ timeout: 2_000 });
    await expect(partnerB.page.getByTestId('anim-HUG-received')).toBeAttached();
    await expect(partnerB.page.getByTestId('anim-ANIM-02')).toHaveCount(0);
    await expect(partnerB.page.getByTestId('signal-overlay-text')).toHaveText(`${partnerA.name} чамайг чанга тэврэлээ`);
  });

  test('AC-77 S-26: 81 дэх тэмдэгт орохгүй (сервер ч 400); 80 тэмдэгт B-д ANIM-03 ба S-24-т', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac77');
    const tooLong = await sendSignalApi(a, 'THINKING', 'ж'.repeat(81));
    expect(tooLong.status).toBe(400);

    await openHome(partnerA.page, a);
    await openHome(partnerB.page, b);
    await partnerA.page.getByTestId('home-thinking-open').click();
    await expect(partnerA.page.getByTestId('screen-S-26')).toBeVisible();

    const input = partnerA.page.getByTestId('thinking-input');
    await input.fill('ж'.repeat(81));
    await expect(input).toHaveValue('ж'.repeat(80));
    await expect(partnerA.page.getByTestId('thinking-counter')).toHaveText('80/80');

    const text = 'Чамайг санаж байна'.padEnd(80, '.');
    await input.fill(text);
    await partnerA.page.getByTestId('thinking-send').click();
    await expect(partnerA.page.getByTestId('anim-ANIM-03')).toBeAttached();
    await expect(partnerA.page.getByTestId('thinking-sent')).toBeVisible();

    await expect(partnerB.page.getByTestId('anim-ANIM-03')).toBeAttached({ timeout: 2_000 });
    await expect(partnerB.page.getByTestId('signal-overlay-quote')).toHaveText(`«${text}»`);
    await expect
      .poll(async () => (await apiJson<{ items: { body: string }[] }>(b, 'GET', '/notifications')).items.some((n) => n.body.includes(text)))
      .toBe(true);
  });
});
