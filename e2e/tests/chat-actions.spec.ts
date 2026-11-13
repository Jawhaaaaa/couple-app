import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { messagesApi, openChat, sendMessageApi, sendTextApi } from '../support/chat';
import { linkedCouple } from '../support/couple';
import { apiAs } from '../support/users';

/**
 * S-41…S-44 (T-48, FR-6.5, FR-6.7, FR-6.8): хайлт ба огноо руу үсрэх (AC-89), pin (AC-90),
 * «Дурсамж болгох» ноорог (AC-91), байршлыг газрын зурагт нээх (AC-87).
 */
test.describe('Чатын цэс, хайлт, pin', () => {
  test('AC-89 «Тэрэлж» хайлт тодруулгатай, товшвол контекст рүү; огноо руу үсрэх', async ({ partnerA }) => {
    const [a, b] = await linkedCouple(partnerA.name, 'Ану', 'ac89');
    for (let i = 0; i < 5; i += 1) await sendTextApi(b, `дүүргэгч ${i}`);
    const target = await sendTextApi(b, 'Бямба гарагт Тэрэлж явах уу?');
    for (let i = 0; i < 5; i += 1) await sendTextApi(a, `хариу ${i}`);

    await openChat(partnerA.page, a);
    await partnerA.page.getByTestId('chat-open-search').click();
    await expect(partnerA.page.getByTestId('screen-S-43')).toBeVisible();
    await partnerA.page.getByTestId('chat-search-input').fill('Тэрэлж');
    const result = partnerA.page.getByTestId(`search-result-${target.id}`);
    await expect(result.getByTestId('search-highlight')).toHaveText(/Тэрэлж/i);
    await result.click();
    await expect(partnerA.page.getByTestId('chat-back-to-latest')).toBeVisible();
    await expect(partnerA.page.getByText('Бямба гарагт Тэрэлж явах уу?')).toBeVisible();

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
    await partnerA.page.goto('/chat/search');
    await partnerA.page.getByTestId('chat-jump-input').fill(today);
    await partnerA.page.getByTestId('chat-jump').click();
    await expect(partnerA.page.getByText('дүүргэгч 0')).toBeVisible();
  });

  test('AC-90 pin толгойд, «Бүх pin» жагсаалтад; хамтрагч хасаж болно', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac90');
    const m = await sendTextApi(a, 'Шүдний эмчид 15:00');
    await openChat(partnerA.page, a);
    await partnerA.page.getByTestId(`message-${m.clientMessageId}`).click({ delay: 600 });
    await partnerA.page.getByTestId('message-action-pin').click();
    await expect(partnerA.page.getByTestId('chat-pinned-banner')).toContainText('Шүдний эмчид');

    await openChat(partnerB.page, b);
    await expect(partnerB.page.getByTestId('chat-pinned-banner')).toBeVisible();
    await partnerB.page.getByTestId('chat-pinned-banner').click();
    await expect(partnerB.page.getByTestId('screen-S-42')).toBeVisible();
    await partnerB.page.getByTestId(`unpin-${m.id}`).click();
    await expect.poll(async () => ((await (await apiAs(a, 'GET', '/messages/pinned')).json()) as unknown[]).length).toBe(0);
  });

  test('AC-91 «Дурсамж болгох» → мессежийн текст, огноогоор бөглөгдсөн S-32 ноорог', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac91');
    const m = await sendTextApi(a, 'Анхны цас орлоо\nХоёулаа гадаа гарсан');
    await openChat(partnerA.page, a);
    await partnerA.page.getByTestId(`message-${m.clientMessageId}`).click({ delay: 600 });
    await partnerA.page.getByTestId('message-action-memory').click();
    await expect(partnerA.page.getByTestId('screen-S-32')).toBeVisible();
    await expect(partnerA.page.getByTestId('editor-title')).toHaveValue('Анхны цас орлоо');
  });

  test('AC-87 байршлын мессеж газрын зурагт нээгдэнэ; хориотой файл (.exe) серверт татгалзагдана', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac87');
    const loc = await sendMessageApi(a, { kind: 'LOCATION', location: { name: 'Хустайн нуруу', lat: 47.8, lon: 106.0 } });
    await openChat(partnerB.page, b);
    const popup = partnerB.page.waitForEvent('popup');
    await partnerB.page.getByTestId(`message-${loc.clientMessageId}`).getByTestId('message-location').click();
    expect((await popup).url()).toContain('openstreetmap.org/?mlat=47.8&mlon=106');

    const upload = await apiAs(a, 'POST', '/uploads', { purpose: 'FILE', fileName: 'setup.exe', mime: 'application/x-msdownload', totalBytes: 10 });
    expect([400, 415]).toContain(upload.status);
    expect((await messagesApi(b)).items.filter((m) => m.kind === 'FILE')).toHaveLength(0);
  });
});
