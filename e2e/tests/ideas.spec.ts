import { type BrowserContext, expect, type Page, type Response } from '@playwright/test';

import { suppressPwaPrompts, test } from '../fixtures/twoPartners';
import { animLog, expectAnim, recordAnims } from '../support/anims';
import { linkedCouple } from '../support/couple';
import { createIdeaApi, listIdeasApi, openPlans, uniqueSuffix } from '../support/plans';
import { apiJson, signInUi } from '../support/users';

/**
 * Болзооны санаа (T-55, FR-7.1, 7.9, 7.11): S-53 санаа үүсгэх ба S-51-ийн ангиллын шүүлт
 * (AC-179), S-57 нууц санал нэгдэл (AC-36), S-58 санааны сан (AC-99). Хос ба эхний санааг
 * API-аар бэлтгэж, AC-ийн алхмыг хамтрагчдын UI-аар хийнэ.
 */

interface LibraryIdea {
  id: string;
  title: string;
  category: string;
  seasons: string[];
  setting: string;
}

interface Captured {
  url: string;
  method: string;
  requestBody: string | null;
  body: unknown;
}

/** Хуудасны API-ийн JSON хариу бүрийг (бодит сүлжээний) цуглуулна. */
function captureApiResponses(page: Page) {
  const pending: Promise<void>[] = [];
  const captured: Captured[] = [];
  page.on('response', (res: Response) => {
    if (!res.url().includes('/api/v1/')) return;
    if (!(res.headers()['content-type'] ?? '').includes('json')) return;
    // Навигацаар тасарсан хариуны body WebKit-д хэзээ ч ирэхгүй байж болно — 5 с-ээс илүү хүлээхгүй
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    const read = res
      .json()
      .then((body) => {
        captured.push({ url: res.url(), method: res.request().method(), requestBody: res.request().postData(), body });
      })
      .catch(() => undefined);
    pending.push(Promise.race([read, timeout]));
  });
  return async () => {
    await Promise.all(pending);
    return captured;
  };
}

/** WebSocket-оор ирсэн frame-ууд (STOMP — realtime үйл явдлууд). */
function captureWsFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(typeof f.payload === 'string' ? f.payload : f.payload.toString('utf8'))));
  return frames;
}

/** JSON-ын бүх түлхүүр (гүнзгий). */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

/**
 * S-53-ийн хот сонгогч нь backend-ээр дамжин гадны geocoder (Open-Meteo) руу хандана — CI-ийн
 * сүлжээнээс хамаарахгүйн тулд зөвхөн `GET /geo/cities`-ийн хариуг тогтмол болгоно (санаа нь
 * бодит backend-д хадгалагдана). Service worker хянаж буй хуудасны fetch-ийг WebKit-д route
 * барьдаггүй тул энэ context-д SW-ийг хаана (version.spec-тэй ижил).
 */
async function stubCitySearch(context: BrowserContext) {
  await context.route('**/api/v1/geo/cities?**', async (route) => {
    const origin = route.request().headers()['origin'] ?? '*';
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Accept-Language, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    return route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify([{ name: 'Улаанбаатар', countryCode: 'MN', lat: 47.9077, lon: 106.8832, timezone: 'Asia/Ulaanbaatar' }]),
    });
  });
}

/** Service worker-гүй ганц хэрэглэгчийн хуудас (хотын хайлтыг `context.route`-оор тогтмол болгоно). */
const testWithoutSw = test.extend<{ noSwPage: Page }>({
  noSwPage: async ({ browser, contextOptions }, use) => {
    const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' });
    await suppressPwaPrompts(context);
    await stubCitySearch(context);
    await use(await context.newPage());
    await context.close();
  },
});

test.describe('S-51…S-58 болзооны санаа', () => {
  // Хоёр хамтрагч (хоёр хөтөч) — ачаалалтай машинд WebKit-д 60 с хүрэлцэхгүй байсан
  test.describe.configure({ timeout: 90_000 });

  testWithoutSw('AC-179 S-53 гарчиг, тайлбар, ангилал, төсөв ₮, газар, холбоостой санаа S-51-д ангиллаар шүүгдэнэ; гарчиггүй бол талбарын алдаа', async ({ noSwPage: page }) => {
    const [a] = await linkedCouple('Бат', 'Ану', 'ac179');
    const food = await createIdeaApi(a, `Бууз чимхэх ${uniqueSuffix()}`, 'FOOD');
    const title = `Драмын театр ${uniqueSuffix()}`;

    // S-50 «Санаанууд» → «Санаа нэмэх» → S-53
    await signInUi(page, a);
    await page.goto('/plans');
    await page.getByTestId('plans-tabs-ideas').click();
    await expect(page.getByTestId('plans-ideas')).toContainText(food.title);
    await page.getByTestId('ideas-add').click();
    await expect(page.getByTestId('screen-S-53')).toBeVisible();

    // Ангилал: хоол, аялал, гэртээ, спорт, соёл, гадаа, бусад
    const categories: [string, string][] = [
      ['FOOD', 'Хоол'],
      ['TRAVEL', 'Аялал'],
      ['HOME', 'Гэртээ'],
      ['SPORT', 'Спорт'],
      ['CULTURE', 'Соёл'],
      ['OUTDOOR', 'Гадаа'],
      ['OTHER', 'Бусад'],
    ];
    for (const [key, label] of categories) await expect(page.getByTestId(`idea-category-${key}`)).toHaveText(label);

    // Гарчиггүй хадгалах — талбарын алдаа, хадгалагдахгүй
    await page.getByTestId('idea-description').fill('Шинэ жүжгийн нээлт');
    await page.getByTestId('idea-save').click();
    await expect(page.getByTestId('idea-title-error')).toHaveText('Гарчгаа бичнэ үү');
    await expect(page.getByTestId('screen-S-53')).toBeVisible();
    expect((await listIdeasApi(a)).map((i) => i.id)).toEqual([food.id]);

    await page.getByTestId('idea-title').fill(title);
    await expect(page.getByTestId('idea-title-error')).toHaveCount(0);
    await page.getByTestId('idea-category-CULTURE').click();
    await page.getByTestId('idea-budget').fill('45000');
    await page.getByTestId('idea-venue').fill('Улсын драмын театр');
    await page.getByTestId('profile-city').fill('Улаан');
    await page.getByTestId('profile-city-option').first().click();
    await expect(page.getByTestId('profile-city-selected')).toContainText('Улаанбаатар');
    await page.getByTestId('idea-url').fill('https://drama.mn/tasalbar');
    await page.getByTestId('idea-save').click();
    await expect(page.getByTestId('screen-S-53')).toHaveCount(0);

    // S-51 — ангиллаар шүүх
    await page.goto('/plans/ideas');
    await expect(page.getByTestId('screen-S-51')).toBeVisible();
    const pane = page.getByTestId('plans-ideas');
    await expect(pane).toContainText(title);
    await expect(pane).toContainText(food.title);
    await page.getByTestId('ideas-category-CULTURE').click();
    await expect(pane).toContainText(title);
    await expect(pane).not.toContainText(food.title);
    await expect(pane.getByText('Улсын драмын театр')).toBeVisible();
    await page.getByTestId('ideas-category-FOOD').click();
    await expect(pane).toContainText(food.title);
    await expect(pane).not.toContainText(title);
    await page.getByTestId('ideas-category-SPORT').click();
    await expect(page.getByTestId('ideas-no-match')).toHaveText('Энэ шүүлтэд тохирох санаа алга.');

    const saved = (await listIdeasApi(a)).find((i) => i.title === title);
    expect(saved).toMatchObject({
      description: 'Шинэ жүжгийн нээлт',
      category: 'CULTURE',
      budgetMnt: 45_000,
      url: 'https://drama.mn/tasalbar',
      place: { name: 'Улсын драмын театр', city: 'Улаанбаатар', lat: 47.9077, lon: 106.8832 },
    });
  });

  test('AC-36 нууц deck: A «тийм» B «үгүй» бол таарал гарахгүй; хоёулаа «тийм» бол хоёуланд ANIM-18; A-гийн хариунд B-гийн сонголт алга', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac36');
    // Deck-д хосын санаа үүсгэсэн дарааллаар эхэнд (SecretDeckService.next)
    const s1 = await createIdeaApi(a, `Гэртээ кино ${uniqueSuffix()}`, 'HOME');
    const s2 = await createIdeaApi(a, `Тэшүүр ${uniqueSuffix()}`, 'SPORT');
    const ref1 = `idea:${s1.id}`;
    const ref2 = `idea:${s2.id}`;
    await recordAnims(partnerA.context);
    await recordAnims(partnerB.context);
    const responsesA = captureApiResponses(partnerA.page);
    const framesA = captureWsFrames(partnerA.page);

    // A: S1 «Тийм», S2 «Тийм» — хамтрагч swipe хийгээгүй тул таарал алга
    await openPlans(partnerA.page, a, '/plans/deck', 'screen-S-57');
    const cardA = partnerA.page.getByTestId('deck-card');
    await expect(cardA).toContainText(s1.title);
    await partnerA.page.getByTestId('deck-yes').click();
    await expect(cardA).toContainText(s2.title);
    await partnerA.page.getByTestId('deck-yes').click();
    await expect(cardA).not.toContainText(s2.title);
    await expect(partnerA.page.getByTestId('celebration-overlay')).toHaveCount(0);
    await expect(partnerA.page.getByTestId('deck-matches')).toHaveCount(0);

    // B: S1 «Үгүй» — хэнд ч таарал гарахгүй
    await openPlans(partnerB.page, b, '/plans/deck', 'screen-S-57');
    const cardB = partnerB.page.getByTestId('deck-card');
    await expect(cardB).toContainText(s1.title);
    await partnerB.page.getByTestId('deck-no').click();
    await expect(cardB).toContainText(s2.title);
    await expect(partnerB.page.getByTestId('celebration-overlay')).toHaveCount(0);
    await expect(partnerB.page.getByTestId('deck-matches')).toHaveCount(0);
    // A ба B-гийн S-57 нээгдсэнээс хойш ANIM-18 огт тоглогдоогүй (S1 таарал болоогүй)
    for (const page of [partnerA.page, partnerB.page]) expect(await animLog(page, 'ANIM-18')).toEqual([]);

    // B: S2 «Тийм» — хоёуланд ANIM-18 (A-д `deck.matched`-ээр reload-гүй)
    await partnerB.page.getByTestId('deck-yes').click();
    await expectAnim(partnerB.page, 'ANIM-18', { reduced: false, within: 'celebration-overlay' });
    await expect(partnerB.page.getByTestId('deck-match-celebration')).toContainText(s2.title);
    await expectAnim(partnerA.page, 'ANIM-18', { reduced: false, within: 'celebration-overlay', timeout: 15_000 });
    await expect(partnerA.page.getByTestId('deck-match-celebration')).toContainText(s2.title);

    for (const page of [partnerA.page, partnerB.page]) {
      await expect(page.getByTestId('celebration-overlay')).toHaveCount(0, { timeout: 5_000 });
      await expect(page.getByTestId(`deck-match-${ref2}`)).toBeVisible();
      await expect(page.getByTestId(`deck-match-${ref1}`)).toHaveCount(0);
    }

    // A deck-ээ дахин нээж (B-гийн сонголтын дараах) хариуг авна
    await partnerA.page.goto('/plans/deck');
    await expect(partnerA.page.getByTestId(`deck-match-${ref2}`)).toBeVisible();
    await partnerA.page.waitForLoadState('networkidle');

    // A-гийн хөтчийн бодит хариунд B-гийн сонголт (S1-ийн «үгүй» оруулаад) алга
    const captured = await responsesA();
    const swipes = captured.filter((c) => c.method === 'POST' && c.url.includes('/deck/swipes'));
    expect(swipes).toHaveLength(2);
    for (const s of swipes) {
      expect(s.body).toMatchObject({ matched: false });
      expect([...allKeys(s.body)].every((k) => k === 'matched' || k === 'match')).toBe(true);
      expect((s.body as { match?: unknown }).match ?? null).toBeNull();
    }
    const deckReads = captured.filter((c) => /\/deck\/(next|matches)/.test(c.url));
    expect(deckReads.some((c) => c.url.includes('/deck/matches'))).toBe(true);
    const leakKey = /^(liked|likes|like|swiped|swipes?|votes?|choices?|partner.*)$/i;
    for (const c of captured) {
      const keys = [...allKeys(c.body)].filter((k) => leakKey.test(k));
      if (!c.url.includes('/couple') && !c.url.includes('/me')) expect(keys, `${c.method} ${c.url}`).toEqual([]);
      if (c.url.includes('/deck/matches')) expect(JSON.stringify(c.body)).not.toContain(ref1);
    }
    // S1 нь зөвхөн A өөрөө swipe хийхээс өмнөх deck-ийн картад л байна
    const withS1 = captured.filter((c) => JSON.stringify(c.body).includes(s1.id));
    expect(withS1.length).toBeGreaterThan(0);
    for (const c of withS1) expect(c.url).toMatch(/\/deck\/next/);
    const afterReload = deckReads.filter((c) => c.url.includes('/deck/next')).at(-1);
    expect(JSON.stringify(afterReload?.body)).not.toContain(s1.id);
    // Realtime: A-д ирсэн frame-д S1 огт байхгүй, `deck.matched` нь зөвхөн S2
    expect(framesA.some((f) => f.includes(ref2))).toBe(true);
    expect(framesA.filter((f) => f.includes(s1.id))).toEqual([]);
  });

  test('AC-99 S-58 «Өвөл» + «Гадаа» — зөвхөн тохирох санаа; «Миний санаа болгох» хосын жагсаалтад хуулбар, эх өөрчлөгдөхгүй', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac99');
    const all = await apiJson<LibraryIdea[]>(a, 'GET', '/idea-library?locale=mn');
    const expected = all.filter((i) => i.seasons.includes('WINTER') && i.setting === 'OUTDOOR');
    const other = all.find((i) => !(i.seasons.includes('WINTER') && i.setting === 'OUTDOOR'));
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(all.length);
    const pick = expected.find((i) => i.seasons.length === 1) ?? expected[0];

    // S-50 «Санаанууд» → «Санааны сан» (S-58)
    const page = partnerA.page;
    await signInUi(page, a);
    await page.goto('/plans');
    await page.getByTestId('plans-tabs-ideas').click();
    await page.getByTestId('ideas-open-library').click();
    await expect(page.getByTestId('screen-S-58')).toBeVisible();
    const cards = page.locator('[data-testid^="idea-lib-"]');
    await expect(cards).toHaveCount(all.length);

    await page.getByTestId('library-season-WINTER').click();
    await page.getByTestId('library-setting-OUTDOOR').click();
    await expect(cards).toHaveCount(expected.length);
    const shown = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(shown.sort()).toEqual(expected.map((i) => `idea-${i.id}`).sort());
    if (other) await expect(page.getByTestId(`idea-${other.id}`)).toHaveCount(0);

    // «Миний санаа болгох»
    const before = await apiJson<LibraryIdea[]>(a, 'GET', '/idea-library?locale=mn');
    await page.getByTestId(`library-adopt-${pick.id}`).click();
    await expect(page.getByTestId(`library-adopted-${pick.id}`)).toHaveText('Санаануудад чинь нэмэгдлээ.');

    // Хосын жагсаалтад хуулбар (A ба B-гийн S-51)
    const copy = (await listIdeasApi(a)).find((i) => i.title === pick.title);
    expect(copy, 'хуулбар хосын санаанд алга').toBeTruthy();
    expect(copy?.id).not.toBe(pick.id);
    expect(copy?.category).toBe(pick.category);
    await page.goto('/plans/ideas');
    await expect(page.getByTestId(`idea-${copy?.id}`)).toContainText(pick.title);
    await signInUi(partnerB.page, b);
    await partnerB.page.goto('/plans/ideas');
    await expect(partnerB.page.getByTestId(`idea-${copy?.id}`)).toContainText(pick.title);

    // Эх нь өөрчлөгдөөгүй, сан хэвээр
    const after = await apiJson<LibraryIdea[]>(a, 'GET', '/idea-library?locale=mn');
    expect(after).toEqual(before);
    expect(after.find((i) => i.id === pick.id)).toEqual(pick);
  });
});
