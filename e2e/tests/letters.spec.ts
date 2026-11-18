import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { expectAnim, localDate, recordAnims } from '../support/anims';
import { resetServerClock, setServerClock } from '../support/clock';
import { linkedCouple } from '../support/couple';
import { makeJpeg, pickFiles } from '../support/memories';
import { runJob } from '../support/seed';
import { apiJson, signInUi, type TestUser, ZONE } from '../support/users';

/**
 * Захидал (T-62, FR-10.1…10.4): S-66 бичих — 3 загвар, ≤ 5 зураг, 6 дахь нь татгалзана, B-д ANIM-06-тай
 * S-67 (AC-111); S-65 «Надад ирсэн / Миний илгээсэн» огноогоор, шүүлт зөв (AC-113); товлосон захидал —
 * B-гийн S-20 ба S-65-д агуулгагүй «💌 Чамд … захидал ирнэ» тэмдэг, A-д хүлээгдэж буй → хүргэгдсэн →
 * уншсан (AC-182).
 */
interface LetterRow {
  id: string;
  status: 'DRAFT' | 'SCHEDULED' | 'DELIVERED' | 'READ' | 'CANCELLED';
  template: string;
  body?: string;
  media?: { id: string }[];
  author: { id: string };
  recipient: { id: string };
}

/**
 * Харагдаж буй S-65. S-66 хадгалсны дараа `router.replace`-ээр S-65 руу буцдаг тул stack-д өмнөх S-65
 * нуугдмал (display: none) үлддэг — хайлтыг харагдах дэлгэцээр хязгаарлана.
 */
function s65(page: Page) {
  return page.getByTestId('screen-S-65').filter({ visible: true });
}

async function openLetters(page: Page, user: TestUser, box?: 'inbox' | 'sent' | 'upcoming') {
  await signInUi(page, user);
  await page.goto(box ? `/together/letters?box=${box}` : '/together/letters');
  await expect(s65(page)).toBeVisible();
}

const BOX_LABEL = { upcoming: 'Ирэх', inbox: 'Надад ирсэн', sent: 'Миний илгээсэн' } as const;

/** S-65-ийн хайрцаг солих (SegmentedTabs — `letter-boxes-<key>`, нэр нь «Надад ирсэн / Миний илгээсэн»). */
async function chooseBox(page: Page, box: keyof typeof BOX_LABEL) {
  const tab = s65(page).getByTestId(`letter-boxes-${box}`);
  await expect(tab).toHaveText(BOX_LABEL[box]);
  await tab.click();
}

/** Жагсаалтад харагдах захидлын id-г дэлгэц дээрх дарааллаар (`letter-<id>`). */
function shownIds(page: Page): Promise<string[]> {
  return s65(page)
    .locator('[data-testid^="letter-"]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getAttribute('data-testid') ?? '')
        .filter((id) => /^letter-[0-9a-f-]{36}$/.test(id))
        .map((id) => id.slice('letter-'.length)),
    );
}

/** UB бүсийн (UTC+8, зуны цаггүй) огноо, цаг — S-66-ийн «Огноо», «Цаг» талбарын хэлбэрээр. */
function zonedParts(instant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

test.describe('Захидал', () => {
  // Хоёр хамтрагчийн олон дэлгэцтэй урсгал — WebKit/Firefox-д нэг тест 60 с-ийн ерөнхий хязгаарт ойртдог
  test.describe.configure({ timeout: 90_000 });
  test.afterEach(async () => resetServerClock());

  test('AC-111 S-66: 3 загвараас сонгох, 5 зураг (6 дахь нь татгалзана); B нээхэд ANIM-06-тай S-67', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac111');
    const A = partnerA.page;
    await openLetters(A, a);
    await A.getByTestId('letter-write').click();
    await expect(A.getByTestId('screen-S-66')).toBeVisible();

    // Гурван загвар — нэг нь л сонгогдсон
    for (const tpl of ['PAPER_1', 'PAPER_2', 'PAPER_3']) await expect(A.getByTestId(`letter-template-${tpl}`)).toBeVisible();
    await expect(A.getByTestId('letter-template-PAPER_1')).toHaveAttribute('aria-checked', 'true');
    await A.getByTestId('letter-template-PAPER_3').click();
    await expect(A.getByTestId('letter-template-PAPER_3')).toHaveAttribute('aria-checked', 'true');
    await expect(A.getByTestId('letter-template-PAPER_1')).toHaveAttribute('aria-checked', 'false');
    await expect(A.getByTestId('letter-template-PAPER_2')).toHaveAttribute('aria-checked', 'false');

    const body = `Нар жаргах үеийн захидал ${Date.now().toString(36)}`;
    await A.getByTestId('letter-body').fill(body);

    // 3 зураг, дараа нь дахиад 3 — нийт 6-аас 5 нь орж, 6 дахь нь шалтгаантай татгалзана
    const photo = async (i: number) => ({ name: `letter-${i}.jpg`, mimeType: 'image/jpeg', buffer: await makeJpeg(A, 320, 240, i * 50) });
    await pickFiles(A, 'letter-photos-add', [await photo(1), await photo(2), await photo(3)]);
    await expect(A.getByTestId('letter-photos-item')).toHaveCount(3);
    await expect(A.getByTestId('letter-photos-notice')).toHaveCount(0);
    await pickFiles(A, 'letter-photos-add', [await photo(4), await photo(5), await photo(6)]);
    await expect(A.getByTestId('letter-photos-item')).toHaveCount(5);
    await expect(A.getByTestId('letter-photos-notice')).toHaveText('Нэг захидалд дээд тал нь 5 зураг — илүүг нь нэмсэнгүй.');
    await expect(A.getByTestId('letter-photos')).toContainText('5 / 5 зураг');
    // 5 болсны дараа нэмэх товч алга — 6 дахийг нэмэх зам үлдэхгүй
    await expect(A.getByTestId('letter-photos-add')).toHaveCount(0);

    await A.getByTestId('letter-send').click();
    await expect(s65(A)).toBeVisible({ timeout: 30_000 });
    const sent = await apiJson<LetterRow[]>(a, 'GET', '/letters?box=sent');
    expect(sent).toHaveLength(1);
    const letter = await apiJson<LetterRow>(a, 'GET', `/letters/${sent[0].id}`);
    expect(letter.template).toBe('PAPER_3');
    expect(letter.media).toHaveLength(5);
    expect(letter.status).toBe('DELIVERED');

    // B: S-65 «Надад ирсэн» → S-67 дугтуй → «Нээх» → ANIM-06
    const B = partnerB.page;
    await recordAnims(partnerB.context);
    await openLetters(B, b, 'inbox');
    await s65(B).getByTestId(`letter-${letter.id}`).click();
    await expect(B.getByTestId('screen-S-67')).toBeVisible();
    await expect(B.getByTestId('letter-envelope')).toBeVisible();
    await expect(B.getByTestId('letter-body-text')).toHaveCount(0);
    await B.getByTestId('letter-open').click();
    await expectAnim(B, 'ANIM-06', { reduced: false, within: 'screen-S-67' });
    await expect(B.getByTestId('letter-paper-PAPER_3')).toBeVisible();
    await expect(B.getByTestId('letter-body-text')).toHaveText(body);
    // 5 зураг (expo-image нь солигдох үедээ placeholder ба зургийг зэрэг зурж болно — ялгаатай эх файлаар тоолно)
    await expect
      .poll(() =>
        B.getByTestId('letter-paper-PAPER_3')
          .locator('img')
          .evaluateAll((imgs) => new Set(imgs.map((i) => (i as HTMLImageElement).src).filter((src) => /^https?:/.test(src)).map((src) => new URL(src).pathname)).size),
      )
      .toBe(5);
    await expect(B.getByTestId('letter-paper-PAPER_3').getByRole('img', { name: 'Захидлын зураг' }).first()).toBeVisible();
    await expect.poll(async () => (await apiJson<LetterRow>(a, 'GET', `/letters/${letter.id}`)).status).toBe('READ');
  });

  test('AC-113 S-65 «Надад ирсэн / Миний илгээсэн» — огноогоор (шинэ нь эхэнд), шүүлт зөв', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac113');
    // Хоёр талын хүргэгдсэн захидал өөр өөр өдөр (серверийн цагаар хүргэгдсэн огноо)
    const send = async (from: TestUser, offsetDays: number, body: string) => {
      await setServerClock(`${localDate(offsetDays)}T12:00:00+08:00`);
      return (await apiJson<{ id: string }>(from, 'POST', '/letters', { template: 'PAPER_1', body, mediaIds: [], draft: false })).id;
    };
    const aOld = await send(a, -40, 'A-гийн эхний захидал');
    const bOld = await send(b, -30, 'B-гийн эхний захидал');
    const aNew = await send(a, -20, 'A-гийн хоёр дахь захидал');
    const bNew = await send(b, -10, 'B-гийн хоёр дахь захидал');
    await resetServerClock();
    // Хүргэгдээгүй (товлосон) захидал хүлээн авагчийн «Надад ирсэн»-д орохгүй, илгээгчийнхэд л харагдана
    const scheduled = await apiJson<{ id: string }>(a, 'POST', '/letters', {
      template: 'PAPER_2',
      body: 'Товлосон',
      mediaIds: [],
      draft: false,
      deliverAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

    // A: «Надад ирсэн» — зөвхөн B-гийнх, шинэ нь эхэнд
    const A = partnerA.page;
    await openLetters(A, a);
    await chooseBox(A, 'inbox');
    await expect(s65(A).getByTestId(`letter-${bNew}`)).toBeVisible();
    await expect.poll(() => shownIds(A)).toEqual([bNew, bOld]);
    await expect(s65(A).getByTestId(`letter-date-${bNew}`)).toHaveText(localDate(-10).replace(/-/g, '.'));
    await expect(s65(A).getByTestId(`letter-date-${bOld}`)).toHaveText(localDate(-30).replace(/-/g, '.'));
    await expect(s65(A).getByTestId(`letter-${bNew}`)).toContainText(`${partnerB.name}-аас`);

    // A: «Миний илгээсэн» — зөвхөн өөрийнх (товлосон нь ч орно), огноогоор
    await chooseBox(A, 'sent');
    await expect(s65(A).getByTestId(`letter-${aNew}`)).toBeVisible();
    await expect.poll(() => shownIds(A)).toEqual([scheduled.id, aNew, aOld]);
    await expect(s65(A).getByTestId(`letter-status-${scheduled.id}`)).toHaveText('Хүлээгдэж буй');
    await expect(s65(A).getByTestId(`letter-status-${aNew}`)).toHaveText('Хүргэгдсэн');
    await expect(s65(A).getByTestId(`letter-${aNew}`)).toContainText(`${partnerB.name}-д`);

    // B: эсрэгээрээ — товлосон нь «Надад ирсэн»-д байхгүй
    const B = partnerB.page;
    await openLetters(B, b, 'inbox');
    await expect(s65(B).getByTestId(`letter-${aNew}`)).toBeVisible();
    await expect.poll(() => shownIds(B)).toEqual([aNew, aOld]);
    await expect(s65(B).getByTestId(`letter-${scheduled.id}`)).toHaveCount(0);
    await chooseBox(B, 'sent');
    await expect(s65(B).getByTestId(`letter-${bNew}`)).toBeVisible();
    await expect.poll(() => shownIds(B)).toEqual([bNew, bOld]);
  });

  test('AC-182 товлосон захидал: B-гийн S-20 ба S-65-д агуулгагүй «💌 Чамд … захидал ирнэ»; A-д хүлээгдэж буй → хүргэгдсэн → уншсан', async ({
    partnerA,
    partnerB,
  }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac182');
    const A = partnerA.page;
    const B = partnerB.page;
    const secret = `Нууц бичвэр ${Date.now().toString(36)}`;
    const occasion = '1000 дахь өдөр';
    // 5 минутын дараах минут (UB бүсээр) — серверийн цагийг тэр хүртэл урагшлуулна (access token хүчинтэй)
    const deliverAt = new Date(Math.ceil((Date.now() + 5 * 60_000) / 60_000) * 60_000);
    const { date, time } = zonedParts(deliverAt);

    // A: S-66-аар товлоно (үйл явдлын нэртэй)
    await openLetters(A, a);
    await A.getByTestId('letter-write').click();
    await expect(A.getByTestId('screen-S-66')).toBeVisible();
    await A.getByTestId('letter-body').fill(secret);
    await A.getByTestId('letter-mode-scheduled').click();
    await A.getByTestId('letter-date').fill(date);
    await A.getByTestId('letter-time').fill(time);
    await A.getByTestId('letter-occasion').fill(occasion);
    await expect(A.getByTestId('letter-send')).toHaveText('Товлох');
    await A.getByTestId('letter-send').click();
    await expect(s65(A)).toBeVisible();
    const [sent] = await apiJson<LetterRow[]>(a, 'GET', '/letters?box=sent');
    expect(sent.status).toBe('SCHEDULED');
    await expect(s65(A).getByTestId(`letter-status-${sent.id}`)).toHaveText('Хүлээгдэж буй');

    // Огноотой (үйл явдалгүй) хоёр дахь товлосон захидал — тэмдэгт огноо харагдана
    const dated = await apiJson<{ id: string }>(a, 'POST', '/letters', {
      template: 'PAPER_1',
      body: `${secret} 2`,
      mediaIds: [],
      draft: false,
      deliverAt: `${localDate(30)}T12:00:00+08:00`,
    });
    const [y, m, d] = localDate(30).split('-').map(Number);

    // B: S-20 — тэмдэг, агуулгагүй
    await signInUi(B, b);
    await expect(B.getByTestId('screen-S-20')).toBeVisible();
    await expect(B.getByTestId('home-letter').first()).toBeVisible();
    await expect(B.getByTestId('home-letter').filter({ hasText: `💌 Чамд ${occasion} захидал ирнэ` })).toHaveCount(1);
    await expect(B.getByTestId('home-letter').filter({ hasText: `💌 Чамд ${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} захидал ирнэ` })).toHaveCount(1);
    await expect(B.getByTestId('screen-S-20')).not.toContainText(secret);

    // B: S-65 «Ирэх» — тэмдэг, агуулгагүй; «Надад ирсэн»-д хараахан алга
    await B.goto('/together/letters');
    await expect(s65(B)).toBeVisible();
    await chooseBox(B, 'upcoming');
    await expect(s65(B).getByTestId(`letter-teaser-${sent.id}`)).toHaveText(`💌 Чамд ${occasion} захидал ирнэ`);
    await expect(s65(B).getByTestId(`letter-teaser-${dated.id}`)).toHaveText(`💌 Чамд ${y} оны ${m} сарын ${d} захидал ирнэ`);
    await expect(s65(B)).not.toContainText(secret);
    const teasers = await apiJson<Record<string, unknown>[]>(b, 'GET', '/letters?box=upcoming');
    expect(JSON.stringify(teasers)).not.toContain(secret);
    await chooseBox(B, 'inbox');
    await expect(s65(B).getByTestId(`letter-${sent.id}`)).toHaveCount(0);

    // Хүргэх агшин: серверийн цагийг урагшлуулж хүргэлтийн ажлыг ажиллуулна
    await setServerClock(new Date(deliverAt.getTime() + 30_000));
    await runJob('letterDelivery');
    await expect.poll(async () => (await apiJson<LetterRow>(a, 'GET', `/letters/${sent.id}`)).status).toBe('DELIVERED');
    await A.reload();
    await expect(s65(A)).toBeVisible();
    await expect(s65(A).getByTestId(`letter-status-${sent.id}`)).toHaveText('Хүргэгдсэн');

    // B уншина (S-67) → A-д «Уншсан»
    await B.reload();
    await chooseBox(B, 'inbox');
    await s65(B).getByTestId(`letter-${sent.id}`).click();
    await expect(B.getByTestId('screen-S-67')).toBeVisible();
    await B.getByTestId('letter-open').click();
    await expect(B.getByTestId('letter-body-text')).toHaveText(secret);
    await expect.poll(async () => (await apiJson<LetterRow>(a, 'GET', `/letters/${sent.id}`)).status).toBe('READ');
    await A.reload();
    await expect(s65(A)).toBeVisible();
    await expect(s65(A).getByTestId(`letter-status-${sent.id}`)).toHaveText('Уншсан');
  });
});
