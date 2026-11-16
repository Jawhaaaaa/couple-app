import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { localDate } from '../support/anims';
import { linkedCouple } from '../support/couple';
import { apiJson, signInUi, type TestUser } from '../support/users';

/**
 * S-63 хамтын жагсаалт (T-58, T-60, FR-9.1, 9.2, 9.5, 9.6, FR-15.1): bucket дуусахад confetti ба
 * «Дурсамж болгох уу?» (AC-106), хэн хэзээ тэмдэглэсэн ба «Дууссаныг цэвэрлэх» (AC-107), хоёулаа
 * хүссэн нь дээр ба эрэмбэ хоёр талд ижил (AC-109), wishlist → S-54 (AC-110), зэрэг засварт
 * «миний / түүний хувилбар» (AC-131). Хоёр хамтрагч = хоёр browser context; `list.updated` WS.
 */
type ListKind = 'bucket' | 'todo' | 'shopping' | 'wishlist';

interface ListItem {
  id: string;
  title: string;
  version: number;
  doneBy?: string | null;
  doneAt?: string | null;
}

function addItemApi(user: TestUser, kind: ListKind, title: string, extra: Record<string, unknown> = {}) {
  return apiJson<ListItem>(user, 'POST', `/lists/${kind}/items`, { title, clientId: randomUUID(), ...extra });
}

async function openLists(page: Page, user: TestUser, kind: ListKind) {
  await signInUi(page, user);
  await page.goto(`/together/lists?kind=${kind}`);
  await expect(page.getByTestId('screen-S-63')).toBeVisible();
  // STOMP холболт тогтох хүртэл (`list.updated`-ыг алдахгүй)
  await page.waitForLoadState('networkidle');
}

/** Жагсаалтын мөрүүдийн ID-г дэлгэц дээрх дарааллаар (бүх хэсэг: хүссэн → нээлттэй → дууссан). */
function itemOrder(page: Page): Promise<string[]> {
  return page
    .getByTestId('screen-S-63')
    .locator('[data-testid^="list-item-"]')
    .evaluateAll((els) => els.map((el) => (el.getAttribute('data-testid') ?? '').replace(/^list-item-/, '')));
}

/** «Бат · 2026.11.16 14:05» — өнөөдрийн огноо (хөтчийн бүс Asia/Ulaanbaatar) ба цаг. */
function doneByPattern(name: string): RegExp {
  return new RegExp(`^${name} · ${localDate(0).replace(/-/g, '\\.')} \\d{1,2}:\\d{2}$`);
}

test.describe('Хамтын жагсаалт', () => {
  // Хоёр context (хоёр хамтрагч) — WebKit-д нэвтрэх, WS холболт удаан тул анхдагч 60 с хүрэлцэхгүй байж болно
  test.describe.configure({ timeout: 120_000 });

  test('AC-106 bucket зүйлийг дуусгахад confetti + «Дурсамж болгох уу?»; «Үгүй» бол «Дууссан» хэсэгт огноотой', async ({ partnerA, partnerB }) => {
    const [a] = await linkedCouple(partnerA.name, partnerB.name, 'ac106');
    const item = await addItemApi(a, 'bucket', 'Хөвсгөлд майхантай хонох');
    const page = partnerA.page;
    await openLists(page, a, 'bucket');
    await expect(page.getByTestId(`list-title-${item.id}`)).toHaveText(item.title);

    await page.getByTestId(`list-done-${item.id}`).click();
    await expect(page.getByTestId('confetti')).toBeAttached();
    await expect(page.getByTestId('bucket-memory-sheet')).toBeVisible();
    await expect(page.getByTestId('bucket-memory-sheet')).toContainText('Биелүүллээ! 🎉');
    await expect(page.getByTestId('bucket-memory-sheet-body')).toHaveText(`«${item.title}»-г дурсамж болгох уу?`);
    await expect(page.getByTestId('bucket-memory-sheet-confirm')).toHaveText('Дурсамж болгох');

    await page.getByTestId('bucket-memory-sheet-cancel').click();
    await expect(page.getByTestId('bucket-memory-sheet')).toHaveCount(0);
    await expect(page.getByTestId('confetti')).toHaveCount(0);
    // S-63 дээр үлдэнэ (S-32 руу шилжихгүй), зүйл «Дууссан» хэсэгт огноотой
    await expect(page.getByTestId('screen-S-63')).toBeVisible();
    const done = page.getByTestId('list-section-done');
    await expect(done).toContainText('Дууссан (1)');
    await expect(done.getByTestId(`list-item-${item.id}`)).toBeVisible();
    await expect(page.getByTestId(`list-done-${item.id}`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`list-doneby-${item.id}`)).toHaveText(doneByPattern(partnerA.name));
    const saved = (await apiJson<ListItem[]>(a, 'GET', '/lists/bucket/items')).find((i) => i.id === item.id);
    expect(saved?.doneBy).toBe(a.id);
    expect(saved?.doneAt).toBeTruthy();
  });

  test('AC-107 To-do ба худалдан авалт: B тэмдэглэхэд хэн, хэзээ; дууссан нь доор; «Дууссаныг цэвэрлэх»', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac107');
    const kinds: Record<'todo' | 'shopping', [string, string]> = {
      todo: ['Байрны төлбөр төлөх', 'Машинаа угаалгах'],
      shopping: ['Сүү', 'Талх'],
    };
    const items: Record<string, [ListItem, ListItem]> = {};
    for (const [kind, [t1, t2]] of Object.entries(kinds)) {
      items[kind] = [await addItemApi(a, kind as ListKind, t1), await addItemApi(a, kind as ListKind, t2)];
    }
    await openLists(partnerA.page, a, 'todo');
    await openLists(partnerB.page, b, 'todo');

    for (const kind of ['todo', 'shopping'] as const) {
      const [first, second] = items[kind];
      for (const page of [partnerA.page, partnerB.page]) {
        await page.getByTestId(`list-kinds-${kind}`).click();
        await expect(page.getByTestId(`list-title-${first.id}`)).toHaveText(first.title);
        await expect(page.getByTestId('list-section-done')).toHaveCount(0);
      }

      // B нэгийг тэмдэглэнэ
      await partnerB.page.getByTestId(`list-done-${first.id}`).click();
      for (const page of [partnerB.page, partnerA.page]) {
        const done = page.getByTestId('list-section-done');
        await expect(done.getByTestId(`list-item-${first.id}`)).toBeVisible();
        // Хэн (аватар + нэр), хэзээ (огноо, цаг)
        await expect(page.getByTestId(`list-doneby-${first.id}`)).toHaveText(doneByPattern(partnerB.name));
        await expect(page.getByTestId('list-section-open').getByTestId(`list-item-${second.id}`)).toBeVisible();
        // Дууссан нь доор бүлэглэгдэнэ
        const openBox = await page.getByTestId('list-section-open').boundingBox();
        const doneBox = await done.boundingBox();
        expect(doneBox!.y).toBeGreaterThan(openBox!.y + openBox!.height - 1);
        expect((await itemOrder(page)).at(-1)).toBe(first.id);
      }

      // «Дууссаныг цэвэрлэх» — дууссан нь жагсаалтаас гарна, нээлттэй нь үлдэнэ
      await partnerB.page.getByTestId('list-clear-done').click();
      for (const page of [partnerB.page, partnerA.page]) {
        await expect(page.getByTestId(`list-item-${first.id}`)).toHaveCount(0);
        await expect(page.getByTestId('list-section-done')).toHaveCount(0);
        await expect(page.getByTestId(`list-item-${second.id}`)).toBeVisible();
      }
      expect((await apiJson<ListItem[]>(a, 'GET', `/lists/${kind}/items`)).map((i) => i.id)).toEqual([second.id]);
    }
  });

  test('AC-109 хоёулаа санал өгсөн нь «Хоёулаа хүсэж байна 💗» дээд талд; A эрэмбэлэхэд дараалал хоёр талд ижил', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac109');
    const created = [
      await addItemApi(a, 'bucket', 'Шумбах'),
      await addItemApi(a, 'bucket', 'Шүхрээр буух'),
      await addItemApi(a, 'bucket', 'Хойд туйлын туяа үзэх'),
    ];
    await openLists(partnerA.page, a, 'bucket');
    await openLists(partnerB.page, b, 'bucket');
    for (const page of [partnerA.page, partnerB.page]) {
      await expect.poll(async () => (await itemOrder(page)).sort()).toEqual(created.map((i) => i.id).sort());
      await expect(page.getByTestId('list-section-wanted')).toHaveCount(0);
    }
    // Хамгийн доор байгаа зүйлд хоёулаа санал өгнө
    const initial = await itemOrder(partnerA.page);
    const wanted = initial[2];

    await partnerA.page.getByTestId(`list-vote-${wanted}`).click();
    await expect(partnerA.page.getByTestId(`list-vote-${wanted}`)).toContainText('1');
    // Нэг санал — «Хоёулаа» биш
    await expect(partnerB.page.getByTestId(`list-vote-${wanted}`)).toContainText('1');
    await expect(partnerB.page.getByTestId(`list-bothwant-${wanted}`)).toHaveCount(0);
    await partnerB.page.getByTestId(`list-vote-${wanted}`).click();

    for (const page of [partnerA.page, partnerB.page]) {
      await expect(page.getByTestId(`list-bothwant-${wanted}`)).toHaveText('Хоёулаа хүсэж байна 💗');
      await expect(page.getByTestId('list-section-wanted').getByTestId(`list-item-${wanted}`)).toBeVisible();
      await expect.poll(() => itemOrder(page)).toEqual([wanted, initial[0], initial[1]]);
    }

    // A эрэмбэлнэ: нээлттэй хэсгийн эхний зүйлийг доош (чирэхийн оронд апп-ын дээш/доош товч — ListItemRow)
    await partnerA.page.getByTestId(`list-down-${initial[0]}`).click();
    const expected = [wanted, initial[1], initial[0]];
    await expect.poll(() => itemOrder(partnerA.page)).toEqual(expected);
    // B-д reload-гүй ижил дараалал (`list.updated`), сервер ч мөн адил
    await expect.poll(() => itemOrder(partnerB.page)).toEqual(expected);
    await expect
      .poll(async () => (await apiJson<ListItem[]>(b, 'GET', '/lists/bucket/items')).map((i) => i.id).filter((id) => id !== wanted))
      .toEqual([initial[1], initial[0]]);
    // Дахин нээхэд хадгалагдсан дараалал
    await partnerB.page.reload();
    await expect(partnerB.page.getByTestId('screen-S-63')).toBeVisible();
    await expect.poll(() => itemOrder(partnerB.page)).toEqual(expected);
  });

  test('AC-110 wishlist-ийн кино «Болзоо болгох» → S-54 гарчиг ба ангиллаар бөглөгдсөн', async ({ partnerA, partnerB }) => {
    const [a] = await linkedCouple(partnerA.name, partnerB.name, 'ac110');
    const page = partnerA.page;
    await openLists(page, a, 'wishlist');

    // Wishlist-д кино нэмнэ (UI)
    const title = `Interstellar ${Date.now().toString(36)}`;
    await page.getByTestId('list-new-title').fill(title);
    await page.getByTestId('list-wish-MOVIE').click();
    await page.getByTestId('list-add').click();
    const row = page.getByTestId('screen-S-63').locator('[data-testid^="list-item-"]', { hasText: title });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Кино');

    await row.locator('[data-testid^="list-plan-"]').click();
    await expect(page.getByTestId('screen-S-54-form')).toBeVisible();
    await expect(page.getByTestId('plan-form-title')).toHaveValue(title);
    // Кино → «Соёл» ангилал сонгогдсон, бусад нь үгүй. `Chip` вэбэд сонголтыг aria-аар гаргадаггүй
    // (role=button) тул сонгогдсон chip-ийн `primary` дэвсгэрээр (үндсэн товчтой ижил өнгө) шалгана.
    const background = (testId: string) => page.getByTestId(testId).evaluate((el) => getComputedStyle(el).backgroundColor);
    const primary = await background('plan-form-submit');
    await expect.poll(() => background('plan-form-category-CULTURE')).toBe(primary);
    for (const other of ['FOOD', 'TRAVEL', 'HOME', 'SPORT', 'OUTDOOR', 'OTHER']) {
      expect(await background(`plan-form-category-${other}`), other).not.toBe(primary);
    }
  });

  test('AC-131 жагсаалтын зүйлийг хоёулаа зөрүүтэй засахад хоёр дахь хадгалагчид «миний / түүний хувилбар»', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac131l');
    const item = await addItemApi(a, 'todo', 'Бэлэг авах');
    await openLists(partnerA.page, a, 'todo');
    await openLists(partnerB.page, b, 'todo');

    // Хоёулаа зэрэг засварын горимд
    await partnerB.page.getByTestId(`list-edit-${item.id}`).click();
    await partnerB.page.getByTestId('list-edit-title').fill('Ээжид бэлэг авах');
    await partnerA.page.getByTestId(`list-edit-${item.id}`).click();
    await partnerA.page.getByTestId('list-edit-title').fill('Аавд бэлэг авах');
    await partnerA.page.getByTestId('list-edit-save').click();
    await expect(partnerA.page.getByTestId(`list-title-${item.id}`)).toHaveText('Аавд бэлэг авах');

    // B хуучин хувилбараар хадгална → сонголт; A-гийн өөрчлөлт хэвээр
    await partnerB.page.getByTestId('list-edit-save').click();
    const sheet = partnerB.page.getByTestId('conflict-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(`${partnerA.name} үүнийг саяхан өөрчилжээ`);
    await expect(partnerB.page.getByTestId('conflict-mine')).toContainText('Миний хувилбар');
    await expect(partnerB.page.getByTestId('conflict-mine-title')).toHaveText('Ээжид бэлэг авах');
    await expect(partnerB.page.getByTestId('conflict-theirs')).toContainText('Түүний хувилбар');
    await expect(partnerB.page.getByTestId('conflict-theirs-title')).toHaveText('Аавд бэлэг авах');
    expect((await apiJson<ListItem[]>(a, 'GET', '/lists/todo/items'))[0].title).toBe('Аавд бэлэг авах');

    // «Түүний хувилбар» → B-гийн засвар хаагдаж A-гийнх үлдэнэ
    await partnerB.page.getByTestId('conflict-keep-theirs').click();
    await expect(sheet).toHaveCount(0);
    await expect(partnerB.page.getByTestId(`list-editing-${item.id}`)).toHaveCount(0);
    await expect(partnerB.page.getByTestId(`list-title-${item.id}`)).toHaveText('Аавд бэлэг авах');

    // Дахин зөрчил: A хуучин хувилбараар засахад «Миний хувилбар» сонгоход A-гийнх хадгалагдаж B-д харагдана
    await partnerB.page.getByTestId(`list-edit-${item.id}`).click();
    await partnerA.page.getByTestId(`list-edit-${item.id}`).click();
    await partnerB.page.getByTestId('list-edit-title').fill('Аавд цаг авах');
    await partnerB.page.getByTestId('list-edit-save').click();
    await expect(partnerB.page.getByTestId(`list-title-${item.id}`)).toHaveText('Аавд цаг авах');
    await partnerA.page.getByTestId('list-edit-title').fill('Аавд ном авах');
    await partnerA.page.getByTestId('list-edit-save').click();
    await expect(partnerA.page.getByTestId('conflict-sheet')).toBeVisible();
    await expect(partnerA.page.getByTestId('conflict-sheet')).toContainText(`${partnerB.name} үүнийг саяхан өөрчилжээ`);
    await expect(partnerA.page.getByTestId('conflict-mine-title')).toHaveText('Аавд ном авах');
    await expect(partnerA.page.getByTestId('conflict-theirs-title')).toHaveText('Аавд цаг авах');
    await partnerA.page.getByTestId('conflict-keep-mine').click();
    await expect(partnerA.page.getByTestId('conflict-sheet')).toHaveCount(0);
    await expect(partnerA.page.getByTestId(`list-title-${item.id}`)).toHaveText('Аавд ном авах');
    await expect(partnerB.page.getByTestId(`list-title-${item.id}`)).toHaveText('Аавд ном авах');
    expect((await apiJson<ListItem[]>(b, 'GET', '/lists/todo/items'))[0].title).toBe('Аавд ном авах');
  });
});
