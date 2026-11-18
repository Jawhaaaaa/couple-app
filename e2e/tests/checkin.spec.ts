import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { expectAnim, localDate, recordAnims } from '../support/anims';
import { resetServerClock, setClock, setServerClock } from '../support/clock';
import { linkedCouple } from '../support/couple';
import { apiJson, reloginApi, signInUi, type TestUser } from '../support/users';

/**
 * S-69 сэтгэл санааны check-in (T-63, FR-11.1…11.3): «Хуваалцах» анхдагчаар унтраастай, 5 түвшнээс
 * сонгоход ANIM-15, «автоматаар хуваалцах» асаасны дараах check-in хуваалцагдана (AC-183); сар/улирлын
 * график — өөрийн өдөр бүр, хамтрагчийн зөвхөн хуваалцсан өдрүүд хоёр дахь (тасархай) шугамаар, бусад
 * өдөр хоосон; хамтрагч хуваалцахад `checkin.shared`-ээр reload-гүй шинэчлэгдэнэ (AC-115).
 */
interface CheckIn {
  localDate: string;
  level: number;
  shared: boolean;
}
interface CheckInSeries {
  mine: CheckIn[];
  partner: CheckIn[];
}

async function openCheckIn(page: Page, user: TestUser) {
  await signInUi(page, user);
  await page.goto('/together/checkin');
  await expect(page.getByTestId('screen-S-69')).toBeVisible();
  await expect(page.getByTestId('checkin-save')).toBeVisible();
}

/** RN-web `Switch` нь `data-testid`-тэй wrapper дотор `role=switch` checkbox зурна. */
function toggle(page: Page, testId: string) {
  return page.getByTestId(testId).getByRole('switch');
}

/** Графикийн цэгүүдийн огноо (`mood-dot-mine-<огноо>` / `mood-dot-partner-<огноо>`). */
function dots(page: Page, who: 'mine' | 'partner'): Promise<string[]> {
  return page
    .getByTestId('mood-chart-area')
    .locator(`[data-testid^="mood-dot-${who}-"]`)
    .evaluateAll((els, prefix) => els.map((el) => (el.getAttribute('data-testid') ?? '').slice(prefix.length)).sort(), `mood-dot-${who}-`);
}

test.describe('S-69 check-in', () => {
  // Хоёр хамтрагчийн олон дэлгэцтэй урсгал — WebKit/Firefox-д нэг тест 60 с-ийн ерөнхий хязгаарт ойртдог
  test.describe.configure({ timeout: 90_000 });
  test.afterEach(async () => resetServerClock());

  test('AC-183 «Хуваалцах» анхдагчаар унтраастай; 5 түвшнээс сонгоход ANIM-15; «автоматаар хуваалцах» асаасны дараах check-in хуваалцагдана', async ({
    partnerA,
    partnerB,
  }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac183');
    const A = partnerA.page;
    await recordAnims(partnerA.context);
    await openCheckIn(A, a);

    // Шинэ хэрэглэгч: хоёр сонголт хоёулаа унтраастай
    await expect(toggle(A, 'checkin-share')).not.toBeChecked();
    await expect(toggle(A, 'checkin-auto-share')).not.toBeChecked();
    for (let level = 1; level <= 5; level += 1) await expect(A.getByTestId(`checkin-level-${level}`)).toBeVisible();

    await A.getByTestId('checkin-level-3').click();
    await expect(A.getByTestId('checkin-level-3')).toHaveAttribute('aria-checked', 'true');
    await expectAnim(A, 'ANIM-15', { reduced: false, within: 'screen-S-69' });
    await A.getByTestId('checkin-save').click();
    await expect(A.getByTestId('checkin-message')).toHaveText('Тэмдэглэлээ — өдөр дуустал засаж болно.');

    const today = localDate(0);
    const mine = await apiJson<CheckInSeries>(a, 'GET', `/checkins?from=${today}&to=${today}`);
    expect(mine.mine).toEqual([expect.objectContaining({ localDate: today, level: 3, shared: false })]);
    // Хамтрагчид хуваалцаагүй өдөр 0
    expect((await apiJson<CheckInSeries>(b, 'GET', `/checkins?from=${today}&to=${today}`)).partner).toEqual([]);

    // «Автоматаар хуваалцах» асаана — тохиргоонд хадгалагдана
    await toggle(A, 'checkin-auto-share').click();
    await expect(toggle(A, 'checkin-auto-share')).toBeChecked();
    await expect.poll(async () => (await apiJson<{ checkinAutoShare: boolean }>(a, 'GET', '/me/preferences')).checkinAutoShare).toBe(true);
    // Өнөөдрийнх аль хэдийн хийгдсэн тул түүний сонголт хэвээр (хуваалцахгүй)
    await expect(toggle(A, 'checkin-share')).not.toBeChecked();

    // Маргааш (серверийн ба хөтчийн цаг): шинэ check-in-д «Хуваалцах» анхдагчаар асаалттай → хуваалцагдана
    const tomorrow = localDate(1);
    await setClock([A, partnerB.page], `${tomorrow}T12:00:00+08:00`);
    await A.reload();
    await expect(A.getByTestId('screen-S-69')).toBeVisible();
    await expect(A.getByTestId('checkin-save')).toBeVisible();
    await expect(toggle(A, 'checkin-auto-share')).toBeChecked();
    await expect(toggle(A, 'checkin-share')).toBeChecked();
    await A.getByTestId('checkin-level-5').click();
    await A.getByTestId('checkin-save').click();
    await expect(A.getByTestId('checkin-message')).toHaveText('Тэмдэглэлээ — өдөр дуустал засаж болно.');
    // Серверийн цаг 1 өдөр урагшилсан тул API-ийн access token-ийг шинэчилнэ
    await reloginApi(b);
    await expect
      .poll(async () => (await apiJson<CheckInSeries>(b, 'GET', `/checkins?from=${tomorrow}&to=${tomorrow}`)).partner)
      .toEqual([expect.objectContaining({ localDate: tomorrow, level: 5, shared: true })]);

    // B-гийн графикт A-гийн зөвхөн хуваалцсан (маргаашийн) өдөр
    await openCheckIn(partnerB.page, b);
    await expect(partnerB.page.getByTestId(`mood-dot-partner-${tomorrow}`)).toBeAttached();
    await expect.poll(() => dots(partnerB.page, 'partner')).toEqual([tomorrow]);
  });

  test('AC-115 сар/улирлын график: өөрийн өдөр бүр; хамтрагчийн 10 хуваалцсан өдөр хоёр дахь шугамаар, бусад хоосон; хуваалцахад reload-гүй', async ({
    partnerA,
    partnerB,
  }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac115');
    // 30 хоног: A өдөр бүр (хуваалцахгүй), B 29 өдөр бичсэн ч зөвхөн 10-ыг хуваалцсан (5 + 5 дараалсан)
    const sharedOffsets = new Set([-25, -24, -23, -22, -21, -9, -8, -7, -6, -5]);
    for (let offset = -29; offset <= -1; offset += 1) {
      await setServerClock(`${localDate(offset)}T12:00:00+08:00`);
      await apiJson(a, 'PUT', '/checkins/today', { level: 1 + ((offset + 29) % 5), shared: false });
      await apiJson(b, 'PUT', '/checkins/today', { level: 1 + ((offset + 31) % 5), shared: sharedOffsets.has(offset) });
    }
    await resetServerClock();
    await apiJson(a, 'PUT', '/checkins/today', { level: 4, shared: false });
    const month = Array.from({ length: 30 }, (_, i) => localDate(i - 29)).sort();
    const sharedDates = [...sharedOffsets].map((o) => localDate(o)).sort();

    const A = partnerA.page;
    await openCheckIn(A, a);
    await expect(A.getByTestId('mood-chart')).toBeVisible();
    await expect.poll(() => dots(A, 'mine')).toEqual(month);
    await expect.poll(() => dots(A, 'partner')).toEqual(sharedDates);
    // Хамтрагчийнх хоёр дахь, тасархай шугам — дараалсан хоёр хэсэг
    await expect(A.getByTestId('mood-chart-area').locator('polyline[stroke-dasharray]')).toHaveCount(2);
    await expect(A.getByTestId('mood-legend-partner')).toContainText(partnerB.name);

    // Улирал (90 өдөр) — ижил өгөгдөл, хуваалцаагүй өдөр мөн хоосон
    await A.getByTestId('checkin-range-quarter').click();
    await expect.poll(() => dots(A, 'mine')).toEqual(month);
    await expect.poll(() => dots(A, 'partner')).toEqual(sharedDates);
    await A.getByTestId('checkin-range-month').click();
    await expect.poll(() => dots(A, 'mine')).toEqual(month);
    await A.waitForLoadState('networkidle');

    // B өнөөдрийнхөө check-in-ийг UI-аар хуваалцана → A-гийн график reload-гүй шинэчлэгдэнэ (`checkin.shared`)
    const B = partnerB.page;
    await openCheckIn(B, b);
    // B-д A-гийн хуваалцаагүй өдрүүд хоосон
    await expect.poll(() => dots(B, 'partner')).toEqual([]);
    await B.getByTestId('checkin-level-5').click();
    await toggle(B, 'checkin-share').click();
    await expect(toggle(B, 'checkin-share')).toBeChecked();
    await B.getByTestId('checkin-save').click();
    await expect(B.getByTestId('checkin-message')).toHaveText('Тэмдэглэлээ — өдөр дуустал засаж болно.');

    const today = localDate(0);
    await expect(A.getByTestId(`mood-dot-partner-${today}`)).toBeAttached({ timeout: 5_000 });
    await expect.poll(() => dots(A, 'partner')).toEqual([...sharedDates, today].sort());
  });
});
