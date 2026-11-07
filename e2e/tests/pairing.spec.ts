import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { apiAs, apiJson, createVerifiedUser, signInUi, type TestUser, ZONE } from '../support/users';

/**
 * Хос холбох (T-27, FR-2): S-13 → S-08 урилга (AC-169) → S-09 код (жижиг үсэг, угтваргүй) →
 * S-10 нэгдэх/батлах (AC-170, AC-68) → хоёр context-д ANIM-14 + S-12 (AC-11) → S-11 эхэлсэн
 * өдрийн зөрүү (AC-65) → ганцаараа үеийн агуулгыг хуваалцах эсэх (AC-67).
 * Хоёр хамтрагч = хоёр browser context (`fixtures/twoPartners.ts`).
 */
const CODE_RE = /^AURA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

interface Invite {
  id: string;
  code: string;
  link: string;
  expiresAt: string;
}
interface Pairing {
  id: string;
  status: string;
}
interface Me {
  space: { kind: 'SOLO' | 'COUPLE' };
}

/** UI-гүй холбоно: A урилга → B нэгдэх → A батлах. */
async function linkViaApi(a: TestUser, b: TestUser) {
  const invite = await apiJson<Invite>(a, 'POST', '/invites');
  const pairing = await apiJson<Pairing>(b, 'POST', '/pairings', { code: invite.code });
  await apiJson(a, 'POST', `/pairings/${pairing.id}/confirm`);
}

async function spaceKind(user: TestUser) {
  return (await apiJson<Me>(user, 'GET', '/me')).space.kind;
}

/** S-13 → «Урилга үүсгэх» → S-08-д харагдсан код. */
async function createInviteUi(page: Page): Promise<string> {
  await expect(page.getByTestId('screen-S-13')).toBeVisible();
  await page.getByTestId('waiting-create-invite').click();
  await expect(page.getByTestId('screen-S-08')).toBeVisible();
  const code = (await page.getByTestId('invite-code').innerText()).trim();
  expect(code).toMatch(CODE_RE);
  return code;
}

/** ANIM-14 баярын мөч ≤ 2.5 с-д өөрөө хаагдана (AC-MO-02). */
async function celebrationDone(page: Page) {
  await expect(page.getByTestId('celebration-overlay')).toHaveCount(0, { timeout: 5_000 });
}

/** Тухайн бүсийн өнөөдрөөс `days` өдрийн дараах огноо, `YYYYMMDD` цифр. */
function dayDigits(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

test.describe('Хос холбох', () => {
  test('AC-169 урилгын код AURA-XXXX, холбоос ба QR ижил код, 7 хоног, «Цуцлах»-ын дараа хүчингүй', async ({ partnerA, partnerB }) => {
    const a = await createVerifiedUser(partnerA.name, 'ac169a');
    const b = await createVerifiedUser(partnerB.name, 'ac169b');
    await signInUi(partnerA.page, a);
    const code = await createInviteUi(partnerA.page);

    // Холбоос (QR-ийн агуулга) ижил кодтой, хугацаа 7 хоног
    const current = await apiJson<Invite>(a, 'GET', '/invites/current');
    expect(current.code).toBe(code);
    expect(current.link.endsWith(`/i/${code}`)).toBe(true);
    const days = (Date.parse(current.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7.01);
    await expect(partnerA.page.getByTestId('invite-qr')).toBeVisible();
    await expect(partnerA.page.getByTestId('invite-valid')).toHaveText('7 хоног хүчинтэй');
    await expect(partnerA.page.getByTestId('invite-remaining')).toContainText('хоног');

    // Цуцлах → код хүчингүй (API ба S-09)
    await partnerA.page.getByTestId('invite-cancel').click();
    await expect(partnerA.page.getByTestId('invite-notice')).toContainText('цуцлагдлаа');
    const lookup = await apiAs(b, 'GET', `/invites/lookup?code=${code}`);
    expect(lookup.status).toBe(410);
    expect(((await lookup.json()) as { code: string }).code).toBe('INVITE_INVALID');

    await signInUi(partnerB.page, b);
    await partnerB.page.goto(`/invite-enter?code=${code}`);
    await expect(partnerB.page.getByTestId('invite-enter-error')).toContainText('хүчингүй');
  });

  test('AC-170 AC-68 AC-11 код оруулж нэгдэх → урьсан хүн батлах → хоёуланд ANIM-14 ба S-12', async ({ partnerA, partnerB }) => {
    const a = await createVerifiedUser(partnerA.name, 'ac170a');
    const b = await createVerifiedUser(partnerB.name, 'ac170b');
    await signInUi(partnerA.page, a);
    const code = await createInviteUi(partnerA.page);

    // B: S-13 → «Код оруулах» → жижиг үсгээр, угтваргүй (AC-169 хэвийн болгол)
    await signInUi(partnerB.page, b);
    await expect(partnerB.page.getByTestId('screen-S-13')).toBeVisible();
    await partnerB.page.getByTestId('waiting-enter-code').click();
    await expect(partnerB.page.getByTestId('screen-S-09')).toBeVisible();
    await partnerB.page.getByTestId('invite-enter-code').fill(code.slice(5).toLowerCase());
    await partnerB.page.getByTestId('invite-enter-submit').click();

    // S-10: урьсан хүний нэр (ба зураг) → «Нэгдэх»
    await expect(partnerB.page.getByTestId('screen-S-10')).toBeVisible();
    await expect(partnerB.page.getByTestId('join-title')).toHaveText(`${partnerA.name} чамайг урьж байна`);
    await expect(partnerB.page.getByTestId('join-avatar')).toBeVisible();
    await partnerB.page.getByTestId('join-accept').click();
    await expect(partnerB.page.getByTestId('join-waiting')).toContainText(`${partnerA.name} батлахыг хүлээж байна`);

    // Эхний баталгааны дараа хос үүсээгүй (AC-170)
    expect(await spaceKind(a)).toBe('SOLO');
    expect(await spaceKind(b)).toBe('SOLO');

    // AC-68: A-д апп доторх мэдэгдэл, S-08 → S-10 «Ану нэгдэх гэж байна»
    const notes = await apiJson<{ items: { title: string; body: string; deepLink: string }[] }>(a, 'GET', '/notifications');
    expect(notes.items.some((n) => `${n.title} ${n.body}`.includes(partnerB.name) && n.deepLink.startsWith('/join-confirm'))).toBe(true);
    await expect(partnerA.page.getByTestId('screen-S-10')).toBeVisible({ timeout: 20_000 });
    await expect(partnerA.page.getByTestId('join-title')).toHaveText(`${partnerB.name} нэгдэх гэж байна`);

    // Хоёр дахь баталгаа → хоёр context-д ANIM-14 ба S-12 (AC-11)
    await partnerA.page.getByTestId('join-confirm').click();
    for (const page of [partnerA.page, partnerB.page]) {
      await expect(page.getByTestId('anim-ANIM-14')).toBeAttached({ timeout: 20_000 });
      await expect(page.getByTestId('screen-S-12')).toBeVisible();
    }
    expect(await spaceKind(a)).toBe('COUPLE');
    expect(await spaceKind(b)).toBe('COUPLE');

    // S-12 → S-11 эхэлсэн өдөр (AC-170 «S-11 руу»), «Эхний дурсамжаа нэмье» (AC-188)
    await celebrationDone(partnerA.page);
    await expect(partnerA.page.getByTestId('linked-first-memory')).toBeVisible();
    await partnerA.page.getByTestId('linked-start-date').click();
    await expect(partnerA.page.getByTestId('screen-S-11')).toBeVisible();
  });

  test('AC-65 эхэлсэн өдөр зөрвөл хоёуланд хоёр огноо харагдаж, нэгийг нь батлахад нэгдэнэ', async ({ partnerA, partnerB }) => {
    const a = await createVerifiedUser(partnerA.name, 'ac65a');
    const b = await createVerifiedUser(partnerB.name, 'ac65b');
    await linkViaApi(a, b);
    await signInUi(partnerA.page, a);
    await signInUi(partnerB.page, b);

    // Ирээдүйн огноо хориотой
    await partnerA.page.goto('/start-date');
    await expect(partnerA.page.getByTestId('screen-S-11')).toBeVisible();
    await partnerA.page.getByTestId('start-date-input').fill(dayDigits(1));
    await expect(partnerA.page.getByText('Ирээдүйн огноо оруулах боломжгүй.')).toBeVisible();

    // A 2024-10-24, B 2024-10-25
    await partnerA.page.getByTestId('start-date-input').fill('20241024');
    await partnerA.page.getByTestId('start-date-submit').click();
    await expect(partnerA.page.getByTestId('start-date-waiting')).toContainText('2024.10.24');

    await partnerB.page.goto('/start-date');
    await expect(partnerB.page.getByTestId('start-date-partner')).toContainText('2024.10.24');
    await partnerB.page.getByTestId('start-date-edit').click();
    await partnerB.page.getByTestId('start-date-input').fill('20241025');
    await partnerB.page.getByTestId('start-date-submit').click();

    for (const page of [partnerA.page, partnerB.page]) {
      if (page === partnerA.page) await page.reload();
      await expect(page.getByTestId('start-date-mismatch')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('start-date-mine')).toBeVisible();
      await expect(page.getByTestId('start-date-theirs')).toBeVisible();
    }
    await expect(partnerA.page.getByTestId('start-date-mine')).toContainText('2024.10.24');
    await expect(partnerA.page.getByTestId('start-date-theirs')).toContainText('2024.10.25');

    // B A-гийн огноог сонгоно → хоёуланд батлагдсан
    await partnerB.page.getByTestId('start-date-pick-partner').click();
    await expect(partnerB.page.getByTestId('start-date-confirmed')).toContainText('2024.10.24');
    await partnerA.page.reload();
    await expect(partnerA.page.getByTestId('start-date-confirmed')).toContainText('2024.10.24');
    const couple = await apiJson<{ startDate: string; startDateStatus: string }>(a, 'GET', '/couple');
    expect(couple).toMatchObject({ startDate: '2024-10-24', startDateStatus: 'CONFIRMED' });
  });

  for (const share of [false, true]) {
    test(`AC-67 ганцаараа нэмсэн 3 зүйл — «${share ? 'Тийм' : 'Үгүй'}»`, async ({ partnerA, partnerB }) => {
      const a = await createVerifiedUser(partnerA.name, 'ac67a');
      const b = await createVerifiedUser(partnerB.name, 'ac67b');
      // A ганцаараа 3 болзооны санаа нэмнэ (SoloContentCounter-ийн тоолдог агуулга)
      for (let i = 1; i <= 3; i += 1) {
        await apiJson(a, 'POST', '/ideas', { title: `Ганцаараа санаа ${i}`, category: 'FOOD', clientId: randomUUID() });
      }

      await signInUi(partnerA.page, a);
      await expect(partnerA.page.getByTestId('screen-S-13')).toBeVisible();
      await linkViaApi(a, b);

      // S-13 холбогдсоныг мэдэж S-12 → баярын дараа хуваалцах асуулт
      await expect(partnerA.page.getByTestId('screen-S-12')).toBeVisible({ timeout: 20_000 });
      await celebrationDone(partnerA.page);
      await expect(partnerA.page.getByTestId('screen-solo-share')).toBeVisible();
      await expect(partnerA.page.getByText(`Өмнө оруулсан 3 зүйлээ ${partnerB.name}-тай хуваалцах уу?`)).toBeVisible();
      await partnerA.page.getByTestId(share ? 'solo-share-yes' : 'solo-share-no').click();
      await expect(partnerA.page.getByTestId('linked-first-memory')).toBeVisible();

      const seenByB = await apiJson<{ title: string }[]>(b, 'GET', '/ideas');
      expect(seenByB.filter((i) => i.title.startsWith('Ганцаараа санаа'))).toHaveLength(share ? 3 : 0);

      // Дахин асуухгүй (ALREADY_DECIDED)
      const again = await apiAs(a, 'POST', '/couple/solo-share', { share: !share });
      expect(again.status).toBe(409);
    });
  }

  test('S-09 буруу хэлбэрийн кодыг серверт илгээхгүй, холбоосоор нээвэл код бөглөгдөнө', async ({ partnerA, partnerB }) => {
    const a = await createVerifiedUser(partnerA.name, 's09a');
    const b = await createVerifiedUser(partnerB.name, 's09b');
    const invite = await apiJson<Invite>(a, 'POST', '/invites');
    await signInUi(partnerB.page, b);

    await partnerB.page.goto('/invite-enter');
    await partnerB.page.getByTestId('invite-enter-code').fill('AURA-0O1I');
    await partnerB.page.getByTestId('invite-enter-submit').click();
    await expect(partnerB.page.getByTestId('invite-enter-code-error')).toContainText('AURA-7K3M');

    // Холбоос /i/AURA-XXXX → S-09 → S-10
    await partnerB.page.goto(`/i/${invite.code}`);
    await expect(partnerB.page.getByTestId('screen-S-10')).toBeVisible();
    await expect(partnerB.page.getByTestId('join-title')).toHaveText(`${partnerA.name} чамайг урьж байна`);
  });

  test('GAP-13 нэвтрээгүй хөтөчид холбоос кодыг ба «апп-аа нээж кодоо оруул» зааврыг харуулна', async ({ partnerA }) => {
    const a = await createVerifiedUser(partnerA.name, 'gap13');
    const invite = await apiJson<Invite>(a, 'POST', '/invites');
    const page = partnerA.page;
    await page.goto(`/i/${invite.code}`);
    await expect(page.getByTestId('screen-invite-link')).toBeVisible();
    await expect(page.getByTestId('invite-link-code')).toHaveText(invite.code);
    await expect(page.getByText('Aura апп-аа нээж энэ кодоо оруулаарай.', { exact: false })).toBeVisible();
  });
});
