import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { animLog, CELEBRATION_MAX_MS, expectAnim, localDate, recordAnims } from '../support/anims';
import { resetServerClock, setServerClock } from '../support/clock';
import { confirmStartDate, linkedCouple } from '../support/couple';
import { createMemoryApi, makeJpeg } from '../support/memories';
import { apiJson, signInUi, type TestUser, ZONE } from '../support/users';

/**
 * S-61, S-62, S-25 тэмдэглэлт өдрүүд (T-56, T-57, FR-8.1, 8.5, 8.6): 1000 дахь өдөр хоёр хамтрагчид
 * тус тусдаа нэг удаа ANIM-05 (AC-39, GAP-23), ойд тэмдэглэл ба 2 дурсамж (AC-105), «Анх уулзсан»
 * төрөл ба давтагдах/давталтгүй ой — дараагийн жилд (AC-181).
 */
interface Occasion {
  occasionKey: string;
  title: string;
  kind: string;
  nextOn: string;
  recurring: boolean;
}

interface Celebration {
  eventKey: string;
  kind: string;
  days?: number | null;
}

const DAY_MS = 86_400_000;
const dotted = (date: string) => date.replace(/-/g, '.');

function occasionsApi(user: TestUser) {
  return apiJson<Occasion[]>(user, 'GET', `/anniversaries?tz=${encodeURIComponent(ZONE)}`);
}

async function occasionKeyOf(user: TestUser, title: string): Promise<string> {
  const found = (await occasionsApi(user)).find((o) => o.title === title);
  if (!found) throw new Error(`«${title}» ой жагсаалтад алга`);
  return found.occasionKey;
}

async function openOccasions(page: Page, user: TestUser) {
  await signInUi(page, user);
  await page.goto('/together/occasions');
  await expect(page.getByTestId('screen-S-61')).toBeVisible();
}

/** `date`-ийн жилийн ой — `from`-оос хойших (тэр өдрийг оруулаад) хамгийн ойрын нь (02-29-гүй огноонд). */
function nextAnnual(date: string, from: string): string {
  const mmdd = date.slice(5);
  for (let year = Number(from.slice(0, 4)); ; year += 1) {
    const candidate = `${year}-${mmdd}`;
    if (candidate >= from) return candidate;
  }
}

/** Өнөөдрөөс `offset` өдөр, 02-29 бол дараагийн өдөр (үсэрт жилийн ойн SD-03 дүрмээс зайлсхийнэ). */
function safeDate(offset: number): string {
  const d = localDate(offset);
  return d.endsWith('-02-29') ? localDate(offset + 1) : d;
}

test.describe('Тэмдэглэлт өдрүүд', () => {
  // Хоёр context (хоёр хамтрагч) — WebKit-д нэвтрэх, WS холболт удаан тул анхдагч 60 с хүрэлцэхгүй байж болно
  test.describe.configure({ timeout: 120_000 });

  test.afterEach(async () => resetServerClock());

  test('AC-39 1000 дахь өдөр: A, B тус тусдаа нээхэд S-25 ANIM-05 нэг удаа; дахин нээхэд гарахгүй', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac39');
    // SD-01, SD-06: эхэлсэн өдөр = 1 → эхэлсэн + 999 = өнөөдөр тоолуур 1000
    await confirmStartDate(a, b, localDate(-999));
    await recordAnims(partnerA.context);
    await recordAnims(partnerB.context);

    for (const [partner, user] of [
      [partnerA, a],
      [partnerB, b],
    ] as const) {
      const page = partner.page;
      // Апп нээх — S-25 өөрөө гарна
      await signInUi(page, user);
      await expect(page.getByTestId('screen-S-25')).toBeVisible({ timeout: 15_000 });
      await expectAnim(page, 'ANIM-05', { reduced: false, within: 'screen-S-25' });
      await expect(page.getByTestId('celebration-days')).toHaveText('Хамтдаа 1000 дахь өдөр');
      // Баярын мөч ≤ 2.5 с-д өөрөө хаагдана (AC-MO-02) — товшилт/хугацааг `animations.spec` шалгадаг;
      // энд хаагдсаныг л хүлээнэ (удаан хөтөчид товших агшинд аль хэдийн хаагдаж болно)
      await expect(page.getByTestId('celebration-overlay')).toHaveCount(0, { timeout: CELEBRATION_MAX_MS + 5_000 });
      await expect(page.getByTestId('screen-S-25')).toHaveCount(0);
      await expect(page.getByTestId('screen-S-20')).toBeVisible();
      // Нэг удаа: S-25 энэ сессэд дахин нээгдэхгүй
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('screen-S-25')).toHaveCount(0);
      // ANIM-05 нэг л удаа: тэмдэглэгээ DOM-оос нэг удаа гарсан, түүнээс хойш дахин тоглоогүй
      const log = (await animLog(page, 'ANIM-05')).filter((r) => r.within.includes('screen-S-25'));
      // (вэбэд хаагдах FadeOut нь тэмдэглэгээг хэдхэн мс-д хуулбарлан дахин оруулдаг тул эхний хаалтаас
      // хойш 1 с-ийн дотор бүртгэгдсэнийг тэр нэг тоглолтод тооцно)
      const closedAt = Math.min(...log.filter((r) => r.state === 'removed').map((r) => r.t));
      expect(Number.isFinite(closedAt), `ANIM-05 хаагдсангүй: ${JSON.stringify(log)}`).toBe(true);
      expect(
        log.filter((r) => r.state !== 'removed' && r.t > closedAt + 1_000),
        `ANIM-05 дахин тоглогдов: ${JSON.stringify(log)}`,
      ).toEqual([]);
      // Сервер энэ хэрэглэгчид «үзсэн» гэж тэмдэглэнэ (GAP-23 — хэрэглэгч тутамд)
      await expect
        .poll(async () => (await apiJson<Celebration[]>(user, 'GET', '/me/celebrations')).filter((c) => c.eventKey === 'milestone:days:1000').length)
        .toBe(0);
    }

    // Дахин нээх (апп-ыг эхлэлээс нь — хаалга `/` → S-20) — хоёуланд нь S-25 ба ANIM-05 гарахгүй
    for (const page of [partnerA.page, partnerB.page]) {
      await page.goto('/');
      await expect(page.getByTestId('screen-S-20')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('heart-button')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('screen-S-25')).toHaveCount(0);
      expect(await animLog(page, 'ANIM-05')).toEqual([]);
      await expect(page.getByTestId('anim-ANIM-05')).toHaveCount(0);
    }
  });

  test('AC-105 ойд тэмдэглэл + 2 дурсамж хавсаргахад S-61-д харагдана', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac105');
    const title = 'Хуримын ой';
    await apiJson(a, 'POST', '/anniversaries', { title, date: safeDate(12), kind: 'ANNIVERSARY', recurring: true, reminderDays: [7, 1, 0] });
    const key = await occasionKeyOf(a, title);
    const image = await makeJpeg(partnerA.page);
    const m1 = await createMemoryApi(a, image, { title: 'Хуримын ёслол', occurredOn: '2024-06-01' });
    const m2 = await createMemoryApi(b, image, { title: 'Бал сарын аялал', occurredOn: '2024-06-10' });
    const note = 'Жил бүр Тэрэлжид очиж тэмдэглэнэ';

    const page = partnerA.page;
    await openOccasions(page, a);
    await page.getByTestId(`occasion-${key}`).click();
    await expect(page.getByTestId('screen-S-61-detail')).toBeVisible();
    await page.getByTestId('occasion-note').fill(note);
    await page.getByTestId('occasion-attach').click();
    await expect(page.getByTestId('occasion-memory-picker')).toBeVisible();
    await page.getByTestId(`occasion-pick-${m1.id}`).click();
    await page.getByTestId(`occasion-pick-${m2.id}`).click();
    await page.getByTestId('occasion-save').click();
    await expect(page.getByTestId('occasion-saved')).toBeVisible();
    await expect(page.getByTestId(`occasion-memory-${m1.id}`)).toContainText(m1.title);
    await expect(page.getByTestId(`occasion-memory-${m2.id}`)).toContainText(m2.title);

    // S-61 жагсаалтад «2 дурсамж»; хамтрагчид ч тэмдэглэл ба дурсамжууд харагдана
    for (const [p, user] of [
      [partnerA.page, a],
      [partnerB.page, b],
    ] as const) {
      if (p === partnerB.page) await openOccasions(p, user);
      else {
        await p.goto('/together/occasions');
        await expect(p.getByTestId('screen-S-61')).toBeVisible();
      }
      await expect(p.getByTestId(`occasion-${key}`)).toContainText('2 дурсамж');
      await p.getByTestId(`occasion-${key}`).click();
      await expect(p.getByTestId('screen-S-61-detail')).toBeVisible();
      await expect(p.getByTestId('occasion-note')).toHaveValue(note);
      await expect(p.getByTestId(`occasion-memory-${m1.id}`)).toContainText(m1.title);
      await expect(p.getByTestId(`occasion-memory-${m2.id}`)).toContainText(m2.title);
    }
  });

  test('AC-181 S-62 «Анх уулзсан» жил бүр ба давталтгүй ой — дараагийн жилд давтагдах нь гарч, давталтгүй нь гарахгүй', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac181');
    const today = localDate(0);
    const firstMet = { title: 'Анх уулзсан өдөр', date: safeDate(-340) };
    const once = { title: 'Наадмын тоглолт', date: safeDate(30) };
    const page = partnerA.page;
    await openOccasions(page, a);

    // «Анх уулзсан», жил бүр давтагдана (анхдагч)
    await page.getByTestId('occasions-add').click();
    await expect(page.getByTestId('screen-S-62')).toBeVisible();
    await page.getByTestId('occasion-form-title').fill(firstMet.title);
    await page.getByTestId('occasion-form-date').fill(firstMet.date);
    await page.getByTestId('occasion-form-kind-FIRST_MET').click();
    await expect(page.getByRole('switch', { name: 'Жил бүр давтагдана' })).toBeChecked();
    await page.getByTestId('occasion-form-save').click();
    await expect(page.getByTestId('screen-S-61')).toBeVisible();

    // Давталтгүй ой
    await page.getByTestId('occasions-add').click();
    await expect(page.getByTestId('screen-S-62')).toBeVisible();
    await page.getByTestId('occasion-form-title').fill(once.title);
    await page.getByTestId('occasion-form-date').fill(once.date);
    await page.getByTestId('occasion-form-kind-OTHER').click();
    const recurring = page.getByRole('switch', { name: 'Жил бүр давтагдана' });
    await recurring.click();
    await expect(recurring).not.toBeChecked();
    await page.getByTestId('occasion-form-save').click();
    await expect(page.getByTestId('screen-S-61')).toBeVisible();

    const firstKey = await occasionKeyOf(a, firstMet.title);
    const onceKey = await occasionKeyOf(a, once.title);
    const saved = await occasionsApi(a);
    expect(saved.find((o) => o.occasionKey === firstKey)).toMatchObject({ kind: 'FIRST_MET', recurring: true });
    expect(saved.find((o) => o.occasionKey === onceKey)).toMatchObject({ kind: 'OTHER', recurring: false });

    // Жагсаалтад төрөлтэйгөө: «Анх уулзсан» ирэх ойгоороо, давталтгүй нь өөрийн огноогоор
    await expect(page.getByTestId(`occasion-kind-${firstKey}`)).toHaveText(`Анх уулзсан · ${dotted(nextAnnual(firstMet.date, today))}`);
    await expect(page.getByTestId(`occasion-kind-${onceKey}`)).toHaveText(`Бусад · ${dotted(once.date)}`);

    // Дараагийн жил (өнөөдрөөс 400 хоногийн дараа): серверийн ба B-гийн хөтчийн цагийг тавина
    const later = new Date(new Date(`${today}T12:00:00+08:00`).getTime() + 400 * DAY_MS);
    const laterDate = later.toISOString().slice(0, 10);
    await setServerClock(later);
    await partnerB.page.clock.setFixedTime(later);
    await openOccasions(partnerB.page, b);
    await expect(partnerB.page.getByTestId(`occasion-kind-${firstKey}`)).toHaveText(`Анх уулзсан · ${dotted(nextAnnual(firstMet.date, laterDate))}`);
    expect(nextAnnual(firstMet.date, laterDate) > nextAnnual(firstMet.date, today)).toBe(true);
    await expect(partnerB.page.getByTestId(`occasion-${onceKey}`)).toHaveCount(0);
  });
});
