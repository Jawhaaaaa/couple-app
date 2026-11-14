import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { commentApi, createMemoryApi, getMemory, listMemories, makeJpeg } from '../support/memories';
import { apiAs, apiJson, signInUi } from '../support/users';

/**
 * S-34…S-37 (T-40, FR-5.5, FR-5.7, FR-5.8, FR-5.10): цомог устгахад дурсамж үлдэнэ (AC-81),
 * дуртай нь хүн тус бүрийнх (AC-83), устгахын өмнө хамтрагчийн сэтгэгдлийн тоо ба хогийн сав
 * (AC-174), хайлтын шүүлтүүр нэг нэгээр ба хослуулан (AC-175).
 */
test.describe('Дурсамж — цэгцлэх', () => {
  test('AC-81 «Анхны аялал» цомогт 2 дурсамж; цомгийг устгахад дурсамжууд хэвээр', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac81');
    await signInUi(partnerA.page, a);
    const group = await apiJson<{ id: string }>(a, 'POST', '/memory-groups', { name: 'Анхны аялал' });
    const image = await makeJpeg(partnerA.page);
    const m1 = await createMemoryApi(a, image, { title: 'Төв цэнгэлдэх', occurredOn: '2025-06-01', groupIds: [group.id] });
    const m2 = await createMemoryApi(a, image, { title: 'Тэрэлж', occurredOn: '2025-06-02', groupIds: [group.id] });

    await partnerA.page.goto(`/memories/groups/${group.id}`);
    await expect(partnerA.page.getByTestId('group-count')).toHaveText('2 дурсамж');
    await partnerA.page.getByTestId('group-delete').click();
    await expect(partnerA.page.getByTestId('group-delete-confirm-body')).toHaveText('Зөвхөн цомог устна — доторх 2 дурсамж хэвээр үлдэнэ.');
    await partnerA.page.getByTestId('group-delete-confirm-confirm').click();
    // Устгасан цомгийн хуудаснаас гарна (буцах түүхээр эсвэл цомгийн жагсаалт руу)
    await expect(partnerA.page).not.toHaveURL(new RegExp(group.id));

    expect((await apiAs(a, 'GET', `/memory-groups/${group.id}`)).status).toBe(404);
    expect((await getMemory(a, m1.id)).title).toBe('Төв цэнгэлдэх');
    expect((await getMemory(a, m2.id)).title).toBe('Тэрэлж');
  });

  test('AC-83 A «Дуртай» болгоход A-гийн S-36-д; B-гийн жагсаалтад нөлөөгүй', async ({ partnerA }) => {
    const [a, b] = await linkedCouple(partnerA.name, 'Ану', 'ac83');
    await signInUi(partnerA.page, a);
    const m = await createMemoryApi(a, await makeJpeg(partnerA.page), { title: 'Нар жаргах', occurredOn: '2025-09-09' });
    await partnerA.page.goto(`/memories/${m.id}`);
    await partnerA.page.getByTestId('memory-favorite').click();
    await partnerA.page.goto('/memories/favorites');
    await expect(partnerA.page.getByTestId(`memory-tile-${m.id}`)).toBeVisible();
    expect((await listMemories(a, { favorite: 'true' })).map((x) => x.id)).toEqual([m.id]);
    expect(await listMemories(b, { favorite: 'true' })).toEqual([]);
  });

  test('AC-174 «Анугийн 2 сэтгэгдэл хамт устна» → батлахад S-37-д үлдсэн хоногтой', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac174');
    await signInUi(partnerA.page, a);
    const m = await createMemoryApi(a, await makeJpeg(partnerA.page), { title: 'Хоёулаа', occurredOn: '2025-03-08' });
    await commentApi(b, m.id, 'Ямар гоё');
    await commentApi(b, m.id, 'Дахиад очъё');

    await partnerA.page.goto(`/memories/${m.id}`);
    await partnerA.page.getByTestId('memory-delete').click();
    await expect(partnerA.page.getByTestId('memory-delete-confirm-body')).toHaveText('Анугийн 2 сэтгэгдэл хамт устна');
    await partnerA.page.getByTestId('memory-delete-confirm-confirm').click();
    await expect(partnerA.page.getByTestId('screen-S-37')).toBeVisible();
    await expect(partnerA.page.getByTestId(`trash-days-${m.id}`)).toHaveText(/^(29|30) хоногийн дараа бүрмөсөн устна$/);
    expect((await listMemories(b, {})).map((x) => x.id)).not.toContain(m.id);

    // Сэргээхэд сэтгэгдэлтэйгээ буцна (AC-23)
    await partnerA.page.getByTestId(`trash-restore-${m.id}`).click();
    await expect(partnerA.page.getByTestId('trash-restored')).toBeVisible();
    expect((await getMemory(a, m.id)).comments).toHaveLength(2);
  });

  test('AC-175 S-34: огноо, шошго, байршил, хэн нэмсэн, дуртай — нэг нэгээр ба хослуулан', async ({ partnerA }) => {
    const [a, b] = await linkedCouple(partnerA.name, 'Ану', 'ac175');
    await signInUi(partnerA.page, a);
    const image = await makeJpeg(partnerA.page);
    const hustai = { name: 'Хустай', lat: 47.8, lon: 106 };
    const m1 = await createMemoryApi(a, image, { title: 'Уулын аялал', occurredOn: '2025-07-01', tags: ['аялал'], location: hustai });
    const m2 = await createMemoryApi(a, image, { title: 'Гэрийн кино', occurredOn: '2025-02-01', tags: ['гэр'] });
    const m3 = await createMemoryApi(b, image, { title: 'Нуурын аялал', occurredOn: '2025-08-01', tags: ['аялал'] });
    expect((await apiAs(a, 'PUT', `/memories/${m3.id}/favorite`)).status).toBe(204);

    await partnerA.page.goto('/memories/search');
    await expect(partnerA.page.getByTestId('screen-S-34')).toBeVisible();
    // S-30 нь stack-д нуугдмал байдаг тул зөвхөн S-34 доторх картууд
    const cards = partnerA.page.getByTestId('screen-S-34').locator('[data-testid^="memory-card-"]').filter({ visible: true });

    await partnerA.page.getByTestId('search-tag-аялал').click();
    await expect(cards).toHaveCount(2);
    await partnerA.page.getByTestId('search-author-partner').click();
    await expect(cards).toHaveCount(1);
    await expect(partnerA.page.getByTestId(`memory-card-${m3.id}`)).toBeVisible();
    await partnerA.page.getByTestId('search-favorite').click();
    await expect(partnerA.page.getByTestId(`memory-card-${m3.id}`)).toBeVisible();

    await partnerA.page.getByTestId('search-clear').click();
    await partnerA.page.getByTestId('search-place').fill('Хустай');
    await expect(cards).toHaveCount(1);
    await expect(partnerA.page.getByTestId(`memory-card-${m1.id}`)).toBeVisible();

    await partnerA.page.getByTestId('search-clear').click();
    await partnerA.page.getByTestId('search-from').fill('2025-01-01');
    await partnerA.page.getByTestId('search-to').fill('2025-03-01');
    await expect(cards).toHaveCount(1);
    await expect(partnerA.page.getByTestId(`memory-card-${m2.id}`)).toBeVisible();

    // Offline-д идэвхгүй, шалтгаантай
    await partnerA.context.setOffline(true);
    await expect(partnerA.page.getByTestId('search-offline')).toBeVisible();
    await partnerA.context.setOffline(false);
  });
});
