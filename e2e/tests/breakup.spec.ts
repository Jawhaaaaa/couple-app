import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { resetServerClock, setClock, setServerClock } from '../support/clock';
import { linkedCouple } from '../support/couple';
import { createMemoryApi, getMemory, listMemories, makeJpeg, pickFiles } from '../support/memories';
import { runJob } from '../support/seed';
import { apiJson, PASSWORD, reloginApi, signInUi, type TestUser } from '../support/users';

/**
 * S-86 хосоо салгах (T-75, FR-14.6, DD-AURA-034): 1, 2 дахь баталгаажуулалт → экспортын санал → 14 хоногийн
 * төлөв хоёуланд, B-д мэдэгдэл (AC-185); хоёулаа «Сэргээх» → бүтэн буцна, зөвхөн A → сэргэхгүй, энэ хугацаанд
 * дурсамж нэмэх/засах татгалзана — зөвхөн харах/экспорт (AC-127).
 */
const DAY = 24 * 3600_000;
const READ_ONLY = 'Хосын орон зай одоо зөвхөн унших горимд байна. Өгөгдлөө татаж авах боломжтой хэвээр.';
/** `BREAKUP_STARTED`-ийн мэдэгдлийн гарчгийн хувилбарууд (`content/notifications.json`). */
const BREAKUP_TITLES = /Хосын орон зай хаагдах гэж байна|Холболт дуусах гэж байна|Чухал мэдээ/;

interface CoupleView {
  kind: string;
  status: string;
}

async function coupleOf(user: TestUser): Promise<CoupleView> {
  return apiJson<CoupleView>(user, 'GET', '/couple');
}

/** UI-гүй тасалалт (AC-127-ийн бэлтгэл) — UI-ийн урсгалыг AC-185 шалгана. */
async function breakupApi(user: TestUser) {
  await apiJson(user, 'POST', '/couple/breakup', { password: PASSWORD, confirmStep: 2 });
}

async function openHome(page: Page, user: TestUser) {
  await signInUi(page, user);
  await expect(page.getByTestId('screen-S-20')).toBeVisible();
}

/** Дээд талын «зөвхөн харах» зурваснаас S-86 (тасарсан төлөв). */
async function openBreakupFromBanner(page: Page) {
  await page.getByTestId('space-banner-breaking').click();
  await expect(page.getByTestId('screen-S-86')).toBeVisible();
  await expect(page.getByTestId('breakup-state')).toBeVisible();
}

test.describe('Хосоо салгах', () => {
  test.afterEach(async () => resetServerClock());

  test('AC-185 A S-86: 1 → 2 дахь баталгаажуулалт → экспорт санал → 14 хоногийн төлөв хоёуланд; B-д мэдэгдэл', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac185');
    await openHome(partnerA.page, a);
    await openHome(partnerB.page, b);
    await partnerB.page.waitForLoadState('networkidle');

    const page = partnerA.page;
    await page.getByTestId('screen-S-20').getByTestId('topbar-avatar').click();
    await expect(page.getByTestId('screen-S-80')).toBeVisible();
    await page.getByTestId('settings-breakup').click();
    await expect(page.getByTestId('screen-S-86')).toBeVisible();

    // 1 дэх баталгаажуулалт — анхааруулга
    await expect(page.getByTestId('breakup-step-1')).toBeVisible();
    await expect(page.getByTestId('breakup-warn')).toContainText('14');
    await page.getByTestId('breakup-continue').click();

    // 2 дахь баталгаажуулалт — нууц үг; буруу бол татгалзана
    await expect(page.getByTestId('breakup-step-2')).toBeVisible();
    await page.getByTestId('breakup-password').fill('буруу-нууц-үг');
    await page.getByTestId('breakup-confirm').click();
    await expect(page.getByTestId('breakup-step-2')).toBeVisible();
    await expect(page.getByTestId('breakup-step-3')).toHaveCount(0);
    expect((await coupleOf(a)).status).toBe('ACTIVE');
    await page.getByTestId('breakup-password').fill(PASSWORD);
    await page.getByTestId('breakup-confirm').click();

    // Экспортын санал
    await expect(page.getByTestId('breakup-step-3')).toBeVisible();
    await expect(page.getByTestId('breakup-export')).toBeVisible();
    await expect(page.getByTestId('breakup-export-open')).toBeVisible();
    await page.getByTestId('breakup-export-later').click();

    // 14 хоногийн төлөв — A
    await expect(page.getByTestId('breakup-days-left')).toHaveText('Устахад 14 хоног үлдлээ');
    await expect(page.getByTestId('breakup-read-only')).toBeVisible();
    await expect(page.getByTestId('space-banner-breaking')).toContainText('14 хоногийн дотор');
    expect((await coupleOf(a)).status).toBe('BREAKING');

    // B — realtime-аар зурвас, мэдэгдэл → S-86-д мөн 14 хоног
    const pb = partnerB.page;
    await expect(pb.getByTestId('space-banner-breaking')).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => (await apiJson<{ items: { type: string }[] }>(b, 'GET', '/notifications')).items.some((n) => n.type === 'BREAKUP_STARTED'))
      .toBe(true);
    await pb.reload();
    await expect(pb.getByTestId('screen-S-20')).toBeVisible();
    await pb.getByTestId('screen-S-20').getByTestId('topbar-bell').click();
    await expect(pb.getByTestId('screen-S-24')).toBeVisible();
    const item = pb.getByTestId('notification-item-unread').filter({ hasText: BREAKUP_TITLES });
    await expect(item).toHaveCount(1);
    // Бичвэрийн орлуулга бүрэн (`{days}` г.м. үлдэхгүй)
    await expect(item).not.toContainText('{');
    await item.click();
    await expect(pb.getByTestId('screen-S-86')).toBeVisible();
    await expect(pb.getByTestId('breakup-days-left')).toHaveText('Устахад 14 хоног үлдлээ');
    await expect(pb.getByTestId('breakup-restore')).toBeVisible();
    expect((await coupleOf(b)).status).toBe('BREAKING');
  });

  test('AC-127 (а) хоёулаа «Сэргээх» → хос ACTIVE, дурсамж бүтэн буцна', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac127a');
    const image = await makeJpeg(partnerA.page);
    const mA = await createMemoryApi(a, image, { title: 'Батын дурсамж', occurredOn: '2025-05-01' });
    const mB = await createMemoryApi(b, image, { title: 'Анугийн дурсамж', occurredOn: '2025-06-01' });
    await breakupApi(a);

    await openHome(partnerA.page, a);
    await openBreakupFromBanner(partnerA.page);
    await partnerA.page.getByTestId('breakup-restore').click();
    await expect(partnerA.page.getByTestId('breakup-restore-mine')).toBeVisible();
    expect((await coupleOf(a)).status).toBe('BREAKING');

    await openHome(partnerB.page, b);
    await openBreakupFromBanner(partnerB.page);
    await expect(partnerB.page.getByTestId('breakup-restore-partner')).toBeVisible();
    await partnerB.page.getByTestId('breakup-restore').click();
    await expect(partnerB.page.getByTestId('breakup-restored')).toBeVisible();

    // Хоёуланд зурвас алга, өгөгдөл бүтэн
    await expect(partnerB.page.getByTestId('space-banner-breaking')).toHaveCount(0);
    await expect(partnerA.page.getByTestId('space-banner-breaking')).toHaveCount(0, { timeout: 10_000 });
    expect((await coupleOf(a)).status).toBe('ACTIVE');
    expect((await coupleOf(b)).status).toBe('ACTIVE');
    await partnerA.page.goto('/memories');
    await expect(partnerA.page.getByTestId(`memory-card-${mA.id}`)).toBeVisible();
    await expect(partnerA.page.getByTestId(`memory-card-${mB.id}`)).toBeVisible();
    expect((await listMemories(b, {})).map((m) => m.id).sort()).toEqual([mA.id, mB.id].sort());
  });

  test('AC-127 (б) зөвхөн A «Сэргээх» → сэргэхгүй; 14 хоногийн дараа B сэргээж чадахгүй, хос устна', async ({ partnerA, partnerB }) => {
    const start = new Date('2026-11-07T04:00:00Z');
    await setServerClock(start);
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac127b');
    await breakupApi(a);
    // Хөтчийн цаг (S-86-ийн үлдсэн хоногийг хөтөч тоолно) — тасалснаас 1 минутын дараа апп нээв
    for (const p of [partnerA.page, partnerB.page]) await p.clock.setFixedTime(new Date(start.getTime() + 60_000));

    await openHome(partnerA.page, a);
    await openBreakupFromBanner(partnerA.page);
    await expect(partnerA.page.getByTestId('breakup-days-left')).toHaveText('Устахад 14 хоног үлдлээ');
    await partnerA.page.getByTestId('breakup-restore').click();
    await expect(partnerA.page.getByTestId('breakup-restore-mine')).toBeVisible();

    // B дараагүй — хос BREAKING хэвээр, хоёуланд зурвас
    await openHome(partnerB.page, b);
    await expect(partnerB.page.getByTestId('space-banner-breaking')).toBeVisible();
    await partnerA.page.reload();
    await expect(partnerA.page.getByTestId('space-banner-breaking')).toBeVisible();
    expect((await coupleOf(a)).status).toBe('BREAKING');

    // 14 хоног өнгөрсний дараа — B-гийн «Сэргээх» татгалзана
    await setClock([partnerA.page, partnerB.page], new Date(start.getTime() + 14 * DAY + 3600_000));
    await partnerB.page.goto('/settings/breakup');
    await expect(partnerB.page.getByTestId('breakup-state')).toBeVisible();
    await expect(partnerB.page.getByTestId('breakup-days-left')).toHaveText('Устахад 0 хоног үлдлээ');
    await partnerB.page.getByTestId('breakup-restore').click();
    await expect(partnerB.page.getByTestId('breakup-restore-error')).toBeVisible();
    await expect(partnerB.page.getByTestId('breakup-restored')).toHaveCount(0);

    // Устгалын ажил — хос сэргээгүй, хоёулаа ганцаараа үлдэнэ
    await runJob('couplePurge');
    await reloginApi(a);
    await reloginApi(b);
    expect((await coupleOf(a)).kind).toBe('SOLO');
    expect((await coupleOf(b)).kind).toBe('SOLO');
  });

  test('AC-127 (в) 14 хоногийн дотор дурсамж нэмэх/засах UI-аар татгалзана — харах ба экспорт боломжтой', async ({ partnerA }) => {
    const page = partnerA.page;
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac127c');
    const memory = await createMemoryApi(a, await makeJpeg(page), { title: 'Хадгалагдсан дурсамж', occurredOn: '2025-08-15' });
    await breakupApi(a);
    await openHome(page, a);
    await expect(page.getByTestId('space-banner-breaking')).toBeVisible();

    // Харах — боломжтой
    await page.getByTestId('tab-memories').click();
    await expect(page.getByTestId('screen-S-30')).toBeVisible();
    await page.getByTestId(`memory-card-${memory.id}`).click();
    await expect(page.getByTestId('screen-S-31')).toBeVisible();
    await expect(page.getByTestId('memory-title')).toHaveText('Хадгалагдсан дурсамж');

    // Засах — татгалзана
    await page.getByTestId('memory-edit').click();
    await expect(page.getByTestId('screen-S-32')).toBeVisible();
    await expect(page.getByTestId('editor-title')).toHaveValue('Хадгалагдсан дурсамж');
    await page.getByTestId('editor-title').fill('Өөрчилсөн гарчиг');
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('editor-save-error')).toHaveText(READ_ONLY);
    expect((await getMemory(a, memory.id)).title).toBe('Хадгалагдсан дурсамж');

    // Нэмэх — татгалзана
    await page.goto('/memories');
    await expect(page.getByTestId('screen-S-30')).toBeVisible();
    await page.getByTestId('memories-fab').click();
    await expect(page.getByTestId('screen-S-32')).toBeVisible();
    await pickFiles(page, 'editor-pick', [{ name: 'new.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(page) }]);
    await page.getByTestId('editor-title').fill('Шинэ дурсамж');
    await expect(page.getByTestId('editor-media-0-status')).toHaveText(READ_ONLY, { timeout: 20_000 });
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('editor-save-error')).toBeVisible();
    await expect(page.getByTestId('screen-S-31')).toHaveCount(0);
    expect((await listMemories(a, {})).map((m) => m.title)).toEqual(['Хадгалагдсан дурсамж']);

    // Экспорт — боломжтой (S-86 → S-85)
    await page.goto('/settings/breakup');
    await expect(page.getByTestId('breakup-state')).toBeVisible();
    await page.getByTestId('breakup-state-export').click();
    await expect(page.getByTestId('screen-S-85')).toBeVisible();
    await page.getByTestId('data-export-start').click();
    await expect(page.getByTestId('data-export-started')).toBeVisible();
  });
});
