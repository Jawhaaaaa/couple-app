import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { messagesApi, openChat, sendTextApi } from '../support/chat';
import { resetServerClock, setServerClock } from '../support/clock';
import { linkedCouple } from '../support/couple';
import { apiAs } from '../support/users';

/**
 * Алга болдог мессеж (T-45, FR-6.9): хугацаа хамтрагч уншсанаас эхэлнэ, дуусахад хоёр талаас ба
 * серверээс алга (AC-92); вэб хувилбарт дэлгэцийн зургийн хамгаалалтгүйг S-46 шударга бичнэ (GAP-12).
 */
test.describe('Алга болдог мессеж', () => {
  test.afterEach(async () => resetServerClock());

  test('AC-92 1 минутын мессеж уншаагүй бол үлдэнэ, B уншсанаас 60 ± 5 с-д хоёр талаас ба серверээс алга', async () => {
    const start = new Date('2026-11-07T04:00:00Z');
    await setServerClock(start);
    const [a, b] = await linkedCouple('Бат', 'Ану', 'ac92');
    const sent = await sendTextApi(a, 'Нууц мэдээ 🌙', { disappearSeconds: 60 });

    await setServerClock(new Date(start.getTime() + 10 * 60_000));
    expect((await messagesApi(b)).items.map((m) => m.id)).toContain(sent.id);

    expect((await apiAs(b, 'POST', '/messages/read', { upToMessageId: sent.id })).status).toBe(204);
    const readAt = start.getTime() + 10 * 60_000;
    await setServerClock(new Date(readAt + 55_000));
    expect((await messagesApi(a)).items.map((m) => m.id)).toContain(sent.id);

    await setServerClock(new Date(readAt + 65_000));
    await expect
      .poll(async () => (await messagesApi(b)).items.some((m) => m.id === sent.id), { timeout: 10_000 })
      .toBe(false);
    expect((await messagesApi(a)).items.some((m) => m.id === sent.id)).toBe(false);
  });

  test('GAP-12 S-46 вэбэд дэлгэцийн зургийн хамгаалалт ажиллахгүйг бичнэ; «1 цаг» сонголт хадгалагдана', async ({ partnerA }) => {
    const [a, b] = await linkedCouple(partnerA.name, 'Ану', 'gap12');
    await openChat(partnerA.page, a);
    await partnerA.page.goto('/chat/disappearing');
    await expect(partnerA.page.getByTestId('screen-S-46')).toBeVisible();
    await expect(partnerA.page.getByTestId('disappear-protection')).toContainText(/Вэб хувилбарт/);
    await partnerA.page.getByTestId('disappear-3600').click();
    await expect(partnerA.page.getByTestId('disappear-saved')).toBeVisible();
    const next = await sendTextApi(b, 'дараагийн');
    expect(next).toMatchObject({ kind: 'TEXT' });
    expect((next as unknown as { disappearSeconds?: number }).disappearSeconds).toBe(3600);
  });
});
