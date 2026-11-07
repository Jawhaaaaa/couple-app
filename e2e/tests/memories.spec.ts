import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { commentApi, createMemoryApi, getMemory, makeJpeg } from '../support/memories';
import { apiAs, apiJson, signInUi } from '../support/users';

/**
 * S-30 timeline, S-31 дэлгэрэнгүй (T-38, FR-5.3, FR-5.4, FR-5.9): сараар наалддаг толгой ба
 * хязгааргүй ачаалал (AC-80), хоёр өнцөг (AC-82), сэтгэгдэл/реакц бодит цагаар (AC-173).
 */
test.describe('Дурсамж — timeline ба дэлгэрэнгүй', () => {
  test('AC-80 «2025 оны 11 сар · 2 дурсамж» толгой, гүйлгэхэд дараагийн хуудас ачаална', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac80');
    await signInUi(partnerA.page, a);
    const image = await makeJpeg(partnerA.page);
    await createMemoryApi(a, image, { title: 'Намрын алхалт', occurredOn: '2025-11-20' });
    await createMemoryApi(a, image, { title: 'Анхны цас', occurredOn: '2025-11-03' });
    // 2025 оны 10 сард 21 дурсамж — эхний хуудсанд (20) багтахгүй
    for (let i = 1; i <= 21; i += 1) {
      await createMemoryApi(a, image, { title: `Аравдугаар сар ${i}`, occurredOn: `2025-10-${String(i).padStart(2, '0')}` });
    }

    await partnerA.page.goto('/memories');
    await expect(partnerA.page.getByTestId('screen-S-30')).toBeVisible();
    await expect(partnerA.page.getByText('2025 оны 11 сар · 2 дурсамж')).toBeVisible();
    await expect(partnerA.page.getByText('2025 оны 10 сар · 21 дурсамж')).toBeAttached();

    // Хязгааргүй ачаалал: доош гүйлгэхэд 23 карт бүгд ачаалагдана
    const timeline = partnerA.page.getByTestId('memories-timeline');
    await expect(async () => {
      await timeline.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect(partnerA.page.locator('[data-testid^="memory-card-"]').filter({ hasText: 'Аравдугаар сар 1' }).first()).toBeAttached();
    }).toPass({ timeout: 20_000 });
    // Наалддаг толгой: гүйлгэсний дараа 10 сарын толгой харагдсаар
    await expect(partnerA.page.getByText('2025 оны 10 сар · 21 дурсамж')).toBeVisible();
  });

  test('AC-82 хоёр өнцөг нэр/өнгөөр ялгаатай; B A-гийн дурсамжийг засах API → 403', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac82');
    await signInUi(partnerA.page, a);
    const memory = await createMemoryApi(a, await makeJpeg(partnerA.page), { title: 'Хустайн аялал', occurredOn: '2025-08-15' });

    // A өөрийн өнцгийг UI-аар
    await partnerA.page.goto(`/memories/${memory.id}`);
    await expect(partnerA.page.getByTestId('screen-S-31')).toBeVisible();
    await partnerA.page.getByTestId('perspective-mine-edit').click();
    await partnerA.page.getByTestId('perspective-mine-input').fill('Тахь харсан мөч мартагдашгүй');
    await partnerA.page.getByTestId('perspective-mine-save').click();
    await expect(partnerA.page.getByTestId('perspective-mine-text')).toHaveText('Тахь харсан мөч мартагдашгүй');

    // B өөрийн өнцгийг API-аар
    await apiJson(b, 'PUT', `/memories/${memory.id}/perspective`, { text: 'Салхитай ч дулаахан өдөр' });

    await signInUi(partnerB.page, b);
    await partnerB.page.goto(`/memories/${memory.id}`);
    await expect(partnerB.page.getByTestId('perspective-partner-author')).toHaveText(`${partnerA.name}-ийн өнцөг`);
    await expect(partnerB.page.getByTestId('perspective-partner-text')).toHaveText('Тахь харсан мөч мартагдашгүй');
    await expect(partnerB.page.getByTestId('perspective-mine-text')).toHaveText('Салхитай ч дулаахан өдөр');
    // B-д A-гийн өнцгийг засах товч байхгүй; хоёр картын хүрээний өнгө ялгаатай
    await expect(partnerB.page.getByTestId('perspective-partner-edit')).toHaveCount(0);
    const borders = await Promise.all(
      ['perspective-mine', 'perspective-partner'].map((id) => partnerB.page.getByTestId(id).evaluate((el) => getComputedStyle(el).borderTopColor)),
    );
    expect(borders[0]).not.toBe(borders[1]);
    // INV-03: B A-гийн дурсамжийг засах/устгах → 403
    const patch = await apiAs(b, 'PATCH', `/memories/${memory.id}`, { title: 'Өөрчилсөн', version: memory.version });
    expect(patch.status).toBe(403);
    await expect(partnerB.page.getByTestId('memory-edit')).toHaveCount(0);
  });

  test('AC-173 B сэтгэгдэл бичиж, удаан дарж реакц (ANIM-07) сонгоно → A-д бодит цагаар; B өөрийнхөө л сэтгэгдлийг засна', async ({
    partnerA,
    partnerB,
  }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac173');
    await signInUi(partnerA.page, a);
    const memory = await createMemoryApi(a, await makeJpeg(partnerA.page), { title: 'Анхны болзоо', occurredOn: '2025-05-01' });
    await commentApi(a, memory.id, 'Тэр кафе одоо ч байгаа');
    await partnerA.page.goto(`/memories/${memory.id}`);
    await expect(partnerA.page.getByTestId('comment')).toHaveCount(1);

    await signInUi(partnerB.page, b);
    await partnerB.page.goto(`/memories/${memory.id}`);
    await partnerB.page.getByTestId('comment-input').fill('Дахиад очъё!');
    await partnerB.page.getByTestId('comment-send').click();
    await expect(partnerB.page.getByTestId('comment')).toHaveCount(2);

    // Удаан дарах → ANIM-07 нум, 6 реакц
    const main = partnerB.page.getByTestId('reaction-main');
    const box = await main.boundingBox();
    if (!box) throw new Error('reaction-main харагдахгүй');
    await partnerB.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await partnerB.page.mouse.down();
    await partnerB.page.waitForTimeout(700);
    await partnerB.page.mouse.up();
    await expect(partnerB.page.getByTestId('anim-ANIM-07')).toBeAttached();
    await expect(partnerB.page.locator('[data-testid^="reaction-pick-"]')).toHaveCount(6);
    await partnerB.page.getByTestId('reaction-pick-HUG').click();

    // A-д WebSocket-оор (`memory.comment`, `memory.reaction`)
    await expect(partnerA.page.getByText('Дахиад очъё!')).toBeVisible({ timeout: 10_000 });
    await expect(partnerA.page.getByTestId('reaction-count-HUG')).toBeVisible({ timeout: 10_000 });
    const after = await getMemory(a, memory.id);
    expect(after.reactions.find((r) => r.emoji === 'HUG')?.count).toBe(1);

    // B: зөвхөн өөрийн сэтгэгдэлд «Засах/Устгах»
    const comments = partnerB.page.getByTestId('comment');
    await expect(comments.filter({ hasText: 'Тэр кафе одоо ч байгаа' }).getByTestId('comment-edit')).toHaveCount(0);
    await expect(comments.filter({ hasText: 'Дахиад очъё!' }).getByTestId('comment-edit')).toBeVisible();
    const aComment = after.comments.find((c) => c.author.id === a.id);
    if (!aComment) throw new Error('A-гийн сэтгэгдэл алга');
    const forbidden = await apiAs(b, 'PATCH', `/comments/${aComment.id}`, { text: 'засав', version: 0 });
    expect(forbidden.status).toBe(403);
  });
});
