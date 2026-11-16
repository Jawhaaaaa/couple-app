import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { expectAnim, localDate, recordAnims } from '../support/anims';
import { linkedCouple } from '../support/couple';
import { getMemory, makeJpeg, pickFiles } from '../support/memories';
import {
  calendarGoToMonth,
  createPlanApi,
  getPlanApi,
  openPlans,
  respondPlanApi,
  ubDateTime,
  uniqueSuffix,
} from '../support/plans';
import { signInUi } from '../support/users';

/**
 * Төлөвлөгөө (T-54, FR-7.2, 7.3, 7.5, 7.6): «Өөр цаг»-тай RSVP ба ANIM-12 (AC-33), S-50 таб ба
 * календарь (AC-94), өнгөрсөн болзоог дурсамж болгох (AC-95), checklist бодит цагаар (AC-96).
 * Хос ба болзоог API-аар бэлтгэж, AC-ийн алхмыг хоёр хамтрагчийн UI-аар хийнэ.
 */

/** `YYYY-MM-DD` → апп-ын анхдагч `YMD_DOT` «2026.11.19». */
const dotted = (date: string) => date.replaceAll('-', '.');

/** Тест дундуур хуудас дахин ачаалагдаагүйг (бодит цагийн шинэчлэл) шалгах тэмдэг. */
async function markNoReload(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __noReload?: boolean }).__noReload = true;
  });
}

async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true), 'хуудас дахин ачаалагдсан').toBe(true);
}

test.describe('S-50…S-55 төлөвлөгөө', () => {
  // Хоёр хамтрагч (хоёр хөтөч) — ачаалалтай машинд WebKit-д 60 с хүрэлцэхгүй байсан
  test.describe.configure({ timeout: 90_000 });

  test('AC-33 A санал болгож, B «Өөр цаг»-аар 2 цаг; B-д «Хүлээгдэж буй», A-д 2 сонголт; сонгоход хоёуланд баталгаажиж ANIM-12', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac33');
    await recordAnims(partnerA.context);
    await recordAnims(partnerB.context);
    const title = `Хөгжмийн үдэш ${uniqueSuffix()}`;

    // A: S-50 «Болзоо санал болгох» → S-54 маягт → дэлгэрэнгүй (хариу хүлээж буй)
    await openPlans(partnerA.page, a);
    await partnerA.page.getByTestId('plans-propose').click();
    await expect(partnerA.page.getByTestId('screen-S-54-form')).toBeVisible();
    await partnerA.page.getByTestId('plan-form-title').fill(title);
    await partnerA.page.getByTestId('plan-form-date').fill(localDate(5));
    await partnerA.page.getByTestId('plan-form-time').fill('18:00');
    await partnerA.page.getByTestId('plan-form-submit').click();
    await expect(partnerA.page.getByTestId('screen-S-54')).toBeVisible();
    await expect(partnerA.page.getByTestId('plan-rsvp-waiting')).toHaveText('Хариу хүлээгдэж байна');
    const planId = new URL(partnerA.page.url()).pathname.split('/').pop() ?? '';
    expect(planId).toMatch(/^[0-9a-f-]{36}$/);
    await partnerA.page.waitForLoadState('networkidle');

    // B: S-50-ийн «Хариу хүлээж буй» хэсгээс «Өөр цаг» → S-55-д 2 цаг
    await openPlans(partnerB.page, b);
    const card = partnerB.page.getByTestId(`plan-card-${planId}`);
    await expect(partnerB.page.getByTestId('plans-awaiting').getByTestId(`plan-card-${planId}`)).toContainText(title);
    await partnerB.page.getByTestId(`rsvp-counter-${planId}`).click();
    await expect(partnerB.page.getByTestId('screen-S-55')).toBeVisible();
    const day1 = localDate(6);
    const day2 = localDate(7);
    await partnerB.page.getByTestId('counter-date-0').fill(day1);
    await partnerB.page.getByTestId('counter-time-0').fill('19:00');
    await partnerB.page.getByTestId('counter-add').click();
    await partnerB.page.getByTestId('counter-date-1').fill(day2);
    await partnerB.page.getByTestId('counter-time-1').fill('20:30');
    await partnerB.page.getByTestId('counter-submit').click();
    await expect(partnerB.page.getByTestId('screen-S-55')).toHaveCount(0);

    // B-д «Хүлээгдэж буй»: жагсаалтад ба дэлгэрэнгүйд (сонгох ээлж B-гийнх биш)
    await expect(card.getByTestId(`plan-card-${planId}-status`)).toHaveText('Өөр цаг санал болгосон');
    await expect(partnerB.page.getByTestId(`rsvp-waiting-${planId}`)).toHaveText('Хариу хүлээгдэж байна');
    await expect(partnerB.page.getByTestId(`rsvp-choose-${planId}`)).toHaveCount(0);
    await card.getByTestId(`plan-card-${planId}-open`).click();
    await expect(partnerB.page.getByTestId('screen-S-54')).toBeVisible();
    await expect(partnerB.page.getByTestId('plan-rsvp-waiting')).toHaveText('Хариу хүлээгдэж байна');
    await expect(partnerB.page.locator('[data-testid^="plan-option-"]')).toHaveCount(0);
    await partnerB.page.waitForLoadState('networkidle');

    // A: дэлгэрэнгүй дээрээ (reload-гүй, `plan.updated`) B-гийн 2 цаг
    const options = partnerA.page.locator('[data-testid^="plan-option-"]');
    await expect(options).toHaveCount(2, { timeout: 15_000 });
    await expect(options.filter({ hasText: `${dotted(day1)} · 19:00` })).toHaveCount(1);
    const second = options.filter({ hasText: `${dotted(day2)} · 20:30` });
    await expect(second).toHaveCount(1);

    // A хоёр дахийг сонгоно → хоёуланд баталгаажсан, ANIM-12
    await second.click();
    await expectAnim(partnerA.page, 'ANIM-12', { reduced: false, within: 'plan-confirmed-moment' });
    await expect(partnerA.page.getByTestId('plan-confirmed')).toHaveText('Хоёулаа баталгаажууллаа');
    await expect(partnerA.page.getByTestId('plan-when')).toHaveText(`${dotted(day2)} · 20:30`);

    await expectAnim(partnerB.page, 'ANIM-12', { reduced: false, within: 'plan-confirmed-moment', timeout: 15_000 });
    await expect(partnerB.page.getByTestId('plan-confirmed')).toHaveText('Хоёулаа баталгаажууллаа');
    await expect(partnerB.page.getByTestId('plan-status')).toHaveText('Баталгаажсан');
    await expect(partnerB.page.getByTestId('plan-when')).toHaveText(`${dotted(day2)} · 20:30`);

    const plan = await getPlanApi(b, planId);
    expect(plan.status).toBe('CONFIRMED');
    expect(new Date(plan.startsAt).toISOString()).toBe(new Date(ubDateTime(day2, '20:30')).toISOString());
  });

  test('AC-94 S-50 «Удахгүй / Санаанууд / Календарь»; болзоотой өдөр цэгтэй, өдөр товшвол тухайн өдрийн болзоо; сар/долоо хоногоор', async ({ partnerA }) => {
    const [a, b] = await linkedCouple(partnerA.name, 'Ану', 'ac94');
    const near = localDate(3);
    const nextWeek = localDate(10);
    const empty = localDate(4);
    const t1 = `Кино ${uniqueSuffix()}`;
    const t2 = `Уулын алхалт ${uniqueSuffix()}`;
    const p1 = await createPlanApi(a, { title: t1, startsAt: ubDateTime(near, '19:00') });
    await respondPlanApi(b, p1.id, 'ACCEPT');
    await createPlanApi(a, { title: t2, startsAt: ubDateTime(nextWeek, '10:00') });

    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/plans');
    const page = partnerA.page;
    await expect(page.getByTestId('screen-S-50')).toBeVisible();
    await expect(page.getByTestId('plans-tabs-upcoming')).toHaveText('Удахгүй');
    await expect(page.getByTestId('plans-tabs-ideas')).toHaveText('Санаанууд');
    await expect(page.getByTestId('plans-tabs-calendar')).toHaveText('Календарь');
    await expect(page.getByTestId('plans-next')).toContainText(t1);

    await page.getByTestId('plans-tabs-ideas').click();
    await expect(page.getByTestId('plans-ideas')).toBeVisible();

    // Календарь — сараар (анхдагч)
    await page.getByTestId('plans-tabs-calendar').click();
    await expect(page.getByTestId('plans-calendar')).toBeVisible();
    await calendarGoToMonth(page, near);
    const monthDays = page.locator('[data-testid^="calendar-day-20"]');
    expect([35, 42]).toContain(await monthDays.count());
    await expect(page.getByTestId(`calendar-dot-${near}`)).toBeVisible();
    await expect(page.getByTestId(`calendar-day-${near}`)).toHaveAttribute('aria-label', `${dotted(near)}, болзоотой`);
    await expect(page.getByTestId(`calendar-dot-${empty}`)).toHaveCount(0);

    await page.getByTestId(`calendar-day-${near}`).click();
    await expect(page.getByTestId('calendar-selected')).toHaveText(dotted(near));
    await expect(page.getByTestId('calendar-day-plans')).toContainText(t1);
    await expect(page.getByTestId('calendar-day-plans')).not.toContainText(t2);

    await calendarGoToMonth(page, empty);
    await page.getByTestId(`calendar-day-${empty}`).click();
    await expect(page.getByTestId('calendar-day-empty')).toHaveText('Энэ өдөр болзоо алга.');

    // Долоо хоногоор — 7 өдөр; дараагийн 7 хоногт хоёр дахь болзоо
    await calendarGoToMonth(page, near);
    await page.getByTestId(`calendar-day-${near}`).click();
    await page.getByTestId('calendar-mode-week').click();
    await expect(monthDays).toHaveCount(7);
    await expect(page.getByTestId(`calendar-dot-${near}`)).toBeVisible();
    await expect(page.getByTestId(`calendar-day-${nextWeek}`)).toHaveCount(0);
    await page.getByTestId('calendar-next').click();
    await expect(page.getByTestId(`calendar-dot-${nextWeek}`)).toBeVisible();
    await expect(monthDays).toHaveCount(7);
    await page.getByTestId(`calendar-day-${nextWeek}`).click();
    await expect(page.getByTestId('calendar-day-plans')).toContainText(t2);
    await expect(page.getByTestId('calendar-day-plans')).not.toContainText(t1);

    // Тухайн өдрийн болзоо → S-54
    await page.getByTestId('calendar-day-plans').getByText(t2).click();
    await expect(page.getByTestId('screen-S-54')).toBeVisible();
    await expect(page.getByTestId('plan-when')).toHaveText(`${dotted(nextWeek)} · 10:00`);
  });

  test('AC-95 өнгөрсөн болзоо «Дурсамж болгох» → S-32 гарчиг, огноо, газраар бөглөгдсөн; хадгалахад болзоо ↔ дурсамж хоёр талаас', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac95');
    const day = localDate(-2);
    const title = `Зайсангийн орой ${uniqueSuffix()}`;
    const place = { name: 'Зайсан толгой', lat: 47.8864, lon: 106.9057, city: 'Улаанбаатар', countryCode: 'MN' };
    const plan = await createPlanApi(a, { title, startsAt: ubDateTime(day, '19:00'), place });
    await respondPlanApi(b, plan.id, 'ACCEPT');

    // A: S-50 «Өнгөрсөн болзоо» → S-54 → «Дурсамж болгох»
    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/plans');
    const pa = partnerA.page;
    await expect(pa.getByTestId('plans-past')).toContainText(title);
    await pa.getByTestId(`plan-card-${plan.id}-open`).click();
    await expect(pa.getByTestId('screen-S-54')).toBeVisible();
    await expect(pa.getByTestId('plan-to-memory-card')).toBeVisible();
    await pa.getByTestId('plan-to-memory').click();

    // S-32 — болзооноос бөглөгдсөн ноорог
    await expect(pa.getByTestId('screen-S-32')).toBeVisible();
    await expect(pa.getByTestId('editor-title')).toHaveValue(title);
    await expect(pa.getByTestId('editor-date')).toHaveValue(day);
    await expect(pa.getByTestId('editor-place')).toHaveValue(place.name);
    await expect(pa.getByTestId('editor-lat')).toHaveValue(String(place.lat));
    await expect(pa.getByTestId('editor-lon')).toHaveValue(String(place.lon));

    // Дурсамжид ≥ 1 зураг шаардлагатай (FR-5.1)
    await pickFiles(pa, 'editor-pick', [{ name: 'zaisan.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(pa) }]);
    await expect(pa.getByTestId('editor-media-0-status')).toHaveText('Илгээгдсэн', { timeout: 20_000 });
    await pa.getByTestId('editor-save').click();
    await expect(pa.getByTestId('screen-S-32')).toHaveCount(0, { timeout: 20_000 });
    // S-32 хаагдаад болзоо (S-54) руу буцна — дурсамж руу «Дурсамжийг үзэх»-ээр
    // Болзооны талаас (reload-гүй, буцаж ирэхэд): «Дурсамжийг үзэх» → тэр дурсамж (A ба B)
    await expect(pa.getByTestId('screen-S-54')).toBeVisible();
    await expect(pa.getByTestId('plan-open-memory')).toHaveText('Дурсамжийг үзэх');
    await expect(pa.getByTestId('plan-to-memory-card')).toHaveCount(0);
    await pa.getByTestId('plan-open-memory').click();
    await expect(pa.getByTestId('screen-S-31')).toBeVisible();
    await expect(pa.getByTestId('memory-title')).toHaveText(title);
    await expect(pa.getByTestId('memory-place')).toHaveText(place.name);
    const memoryId = new URL(pa.url()).pathname.split('/').pop() ?? '';
    expect(memoryId).toMatch(/^[0-9a-f-]{36}$/);

    await signInUi(partnerB.page, b);
    await partnerB.page.goto(`/plans/${plan.id}`);
    await partnerB.page.getByTestId('plan-open-memory').click();
    await expect(partnerB.page.getByTestId('screen-S-31')).toBeVisible();
    await expect(partnerB.page.getByTestId('memory-title')).toHaveText(title);

    // Дурсамжийн талаас: `Memory.datePlan` — S-31 холбоосыг харуулдаггүй (тайланд), API-аар хоёр хамтрагчид
    for (const user of [a, b]) {
      const memory = (await getMemory(user, memoryId)) as unknown as { datePlan?: { id: string; title: string } | null; occurredOn: string };
      expect(memory.datePlan?.id).toBe(plan.id);
      expect(memory.datePlan?.title).toBe(title);
      expect(memory.occurredOn).toBe(day);
      expect((await getPlanApi(user, plan.id)).memoryId).toBe(memoryId);
    }
  });

  test('AC-96 4 зүйлтэй checklist — A 1, B 1 тэмдэглэхэд хоёр талд reload-гүй «2 / 4», хэн тэмдэглэснийг аватараар', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac96');
    const plan = await createPlanApi(a, {
      title: `Тэрэлжийн аялал ${uniqueSuffix()}`,
      startsAt: ubDateTime(localDate(5), '10:00'),
      checklist: ['Хөнжил авах', 'Майхан', 'Хоол бэлтгэх', 'Цэнэглэгч'],
    });
    const items = [...plan.checklist].sort((x, y) => x.position - y.position);
    expect(items).toHaveLength(4);
    const [first, second] = items;

    await openPlans(partnerA.page, a, `/plans/${plan.id}`, 'screen-S-54');
    await openPlans(partnerB.page, b, `/plans/${plan.id}`, 'screen-S-54');
    for (const page of [partnerA.page, partnerB.page]) {
      await expect(page.getByTestId('plan-checklist-progress')).toHaveText('0 / 4 бэлэн');
      await markNoReload(page);
    }

    await partnerA.page.getByTestId(`checklist-toggle-${first.id}`).click();
    await expect(partnerA.page.getByTestId(`checklist-toggle-${first.id}`)).toHaveAttribute('aria-checked', 'true');
    await partnerB.page.getByTestId(`checklist-toggle-${second.id}`).click();
    await expect(partnerB.page.getByTestId(`checklist-toggle-${second.id}`)).toHaveAttribute('aria-checked', 'true');

    for (const page of [partnerA.page, partnerB.page]) {
      await expect(page.getByTestId('plan-checklist-progress')).toHaveText('2 / 4 бэлэн', { timeout: 10_000 });
      await expect(page.getByTestId(`checklist-toggle-${first.id}`)).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId(`checklist-toggle-${second.id}`)).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId(`checklist-done-by-${first.id}`).getByRole('img', { name: `${partnerA.name} тэмдэглэсэн` })).toBeVisible();
      await expect(page.getByTestId(`checklist-done-by-${second.id}`).getByRole('img', { name: `${partnerB.name} тэмдэглэсэн` })).toBeVisible();
      for (const rest of items.slice(2)) {
        await expect(page.getByTestId(`checklist-toggle-${rest.id}`)).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByTestId(`checklist-done-by-${rest.id}`)).toHaveCount(0);
      }
      await expectNoReload(page);
    }

    const saved = await getPlanApi(b, plan.id);
    const byId = new Map(saved.checklist.map((i) => [i.id, i]));
    expect(byId.get(first.id)?.doneBy).toBe(a.id);
    expect(byId.get(second.id)?.doneBy).toBe(b.id);
  });
});
