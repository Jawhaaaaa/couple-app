import { expect, test } from '../fixtures/twoPartners';
import { messagesApi, openChat, sendTextApi } from '../support/chat';
import { linkedCouple } from '../support/couple';
import { waitForRuntimeCache, waitForServiceWorker } from '../support/pwa';

/**
 * PWA offline (T-83, FR-17.4, FR-19.5, NFR-03): AC-140 (offline-д shell + «Интернэт алга»), AC-156
 * (S-20, S-40-ийг үзсэний дараа offline болгож дахин ачаалахад shell ба сүүлд үзсэн нүүр/чат
 * кэшээс; offline-д бичсэн мессеж online болоход нэг л удаа илгээгдэнэ; `navigator.storage.persist()`).
 *
 * Shell нь service worker-ийн precache/runtime кэшээс, өгөгдөл TanStack Query persist-ээс
 * (IndexedDB/localStorage), бичсэн мессеж outbox-оос (`aura.outbox.v1`) — reload-ыг даван гарна.
 */
const OFFLINE_TEXT = 'Интернэт алга';

test.describe('PWA offline', () => {
  test('AC-140 AC-156 offline reload — shell, «Интернэт алга», сүүлд үзсэн нүүр/чат кэшээс; offline мессеж нэг удаа; storage.persist()', async ({
    partnerA,
    browserName,
  }) => {
    test.setTimeout(90_000);
    const [a, b] = await linkedCouple(partnerA.name, 'Ану', 'pwaoff');
    const greeting = `Офлайн шалгалт ${Date.now()}`;
    await sendTextApi(b, greeting);

    const { page, context } = partnerA;
    // `navigator.storage.persist()` дуудагдсаныг хуудасны ачаалал бүрт тоолно (апп өөрөө дууддаг)
    await context.addInitScript(() => {
      const proto = typeof StorageManager !== 'undefined' ? StorageManager.prototype : undefined;
      if (!proto?.persist) return;
      const original = proto.persist;
      const w = window as unknown as { __persistCalls: number };
      w.__persistCalls = 0;
      proto.persist = function persist(this: StorageManager) {
        w.__persistCalls += 1;
        return original.call(this);
      };
    });

    if (browserName === 'firefox') {
      // Playwright-ийн Firefox (Juggler)-ийн offline эмуляцид offline үед шинээр ачаалсан хуудасны
      // cross-origin POST (`/auth/refresh`) алдаа ч, хариу ч өгөлгүй өлгөгддөг — S-01-ийн сесс
      // сэргээлт дуусахгүй, splash үлдэнэ. Бодит Firefox (мөн онлайнаар ачаалсан хуудсанд энэ
      // эмуляц) шууд `TypeError: NetworkError` өгдөг тул offline үед өөр origin-ийн fetch-ийг тэр
      // алдаагаар унагана — апп-ын код бодит offline-тай ижил алдаа хүлээн авна.
      await context.addInitScript(() => {
        const original = window.fetch.bind(window);
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          if (!navigator.onLine && url.origin !== location.origin) {
            return Promise.reject(new TypeError('NetworkError when attempting to fetch resource.'));
          }
          return original(input, init);
        };
      });
    }

    // Онлайн: нүүр (S-20) ба чат (S-40)-ыг үзнэ
    await openChat(page, a);
    await expect(page.getByText(greeting, { exact: true })).toBeVisible();
    await page.getByTestId('tab-home').click();
    await expect(page.getByTestId('screen-S-20').filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId('screen-S-20').filter({ visible: true })).toContainText('Ану');
    await page.getByTestId('tab-chat').click();
    await expect(page.getByText(greeting, { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __persistCalls?: number }).__persistCalls ?? 0)).toBeGreaterThan(0);
    await waitForServiceWorker(page);
    await waitForRuntimeCache(page);

    // Offline болгож дахин ачаална — shell SW-ээс, чат persist кэшээс, «Интернэт алга»
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('offline-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('offline-banner')).toContainText(OFFLINE_TEXT);
    await expect(page.getByTestId('screen-S-40').filter({ visible: true })).toBeVisible();
    await expect(page.getByText(greeting, { exact: true })).toBeVisible();

    // Нүүр (S-20) offline-д шууд хаягаар нээгдэнэ — navigation нь SW-ийн shell, өгөгдөл кэшээс
    await page.goto('/home');
    await expect(page.getByTestId('offline-banner')).toContainText(OFFLINE_TEXT);
    const home = page.getByTestId('screen-S-20').filter({ visible: true });
    await expect(home).toBeVisible();
    await expect(home).toContainText('Ану');

    // Offline-д мессеж бичнэ → SENDING (outbox); дахин ачаалсан ч outbox хадгалагдана
    await page.getByTestId('tab-chat').click();
    await expect(page.getByTestId('screen-S-40').filter({ visible: true })).toBeVisible();
    const offlineText = `Холбогдмогц илгээнэ ${Date.now()}`;
    await page.getByTestId('composer-input').fill(offlineText);
    await page.getByTestId('composer-send').click();
    await expect(page.locator('[data-testid="message-status"][data-status="SENDING"]')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('offline-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(offlineText, { exact: true })).toBeVisible();
    expect((await messagesApi(b)).items.filter((m) => m.text === offlineText)).toHaveLength(0);

    // Online — нэг л удаа илгээгдэнэ (`clientMessageId`-аар idempotent), зурвас алга болно
    await context.setOffline(false);
    if (browserName === 'firefox') {
      // Juggler: offline үед ачаалсан баримтад `online` үйл явдал ирдэггүй, өөр origin руу хүсэлт
      // online болсны дараа ч NetworkError хэвээр — апп-ыг онлайнаар дахин нээж (нээх үеийн flush)
      // шалгана. `online` үйл явдлын замыг Chromium/WebKit шалгана.
      await page.reload();
    }
    await expect.poll(async () => (await messagesApi(b)).items.filter((m) => m.text === offlineText).length, { timeout: 20_000 }).toBe(1);
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
    await expect(page.getByText(offlineText, { exact: true })).toHaveCount(1);
    await expect(page.locator('[data-testid="message-status"][data-status="SENDING"]')).toHaveCount(0);
    // Илгээсний дараа давхар илгээлт гараагүйг дахин баталгаажуулна (outbox хоосон)
    await page.reload();
    await expect(page.getByText(offlineText, { exact: true })).toHaveCount(1);
    expect((await messagesApi(b)).items.filter((m) => m.text === offlineText)).toHaveLength(1);
  });
});
