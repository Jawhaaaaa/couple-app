import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Browser, expect, type Page, test } from '@playwright/test';

import { collectErrors, NON_ROUTE_SIDS, ROUTES, seedSmokeCouple, type SmokeIds, type Who } from '../support/routes';
import { signInUi, type TestUser } from '../support/users';

/**
 * AC-143: S-ID бүр route/компоненттой — E2E smoke бүх route-ыг нээж crash 0, console error 0.
 * AC-219: ижил smoke Chromium (Pixel 7), WebKit (iPhone 14), Firefox дээр (project бүрд ажиллана).
 * Нэг context-д нэг удаа нэвтэрч route бүрийг `page.goto`-оор (бүтэн ачаалал) нээнэ.
 */
const APP = fileURLToPath(new URL('../../mobile/src/app/', import.meta.url));

let seeded: { a: TestUser; solo: TestUser; ids: SmokeIds };

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  seeded = await seedSmokeCouple(page);
  await page.close();
});

async function openAs(browser: Browser, who: Who, contextOptions: object): Promise<Page> {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  if (who === 'couple') await signInUi(page, seeded.a);
  if (who === 'solo') await signInUi(page, seeded.solo);
  return page;
}

for (const who of ['anon', 'solo', 'couple'] as const) {
  test(`AC-143 AC-219 smoke — ${who}: route бүр нээгдэж crash 0, console error 0`, async ({ browser, contextOptions }) => {
    const routes = ROUTES.filter((r) => r.who === who);
    const page = await openAs(browser, who, contextOptions);
    const errors = collectErrors(page);
    for (const route of routes) {
      const url = route.path(seeded.ids);
      await test.step(`${route.sid} ${url}`, async () => {
        errors.length = 0;
        await page.goto(url);
        await expect.soft(page.getByTestId(route.testId ?? `screen-${route.sid}`), `${route.sid} ${url}`).toBeVisible({ timeout: 15_000 });
        // Хүлээгдэж буй query дуусах хүртэл (алдаа нь сүлжээний дараа гарна)
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
        expect.soft(errors, `${route.sid} ${url}: console error`).toEqual([]);
      });
    }
    await page.context().close();
  });
}

test('AC-143 Хавсралт А-ийн S-ID бүр route эсвэл тайлбартай route-гүй компоненттой', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-pixel7', 'Файлын шалгалт — нэг project-д');
  const expected = [
    ...Array.from({ length: 14 }, (_, i) => i + 1),
    ...Array.from({ length: 7 }, (_, i) => i + 20),
    ...Array.from({ length: 10 }, (_, i) => i + 30),
    ...Array.from({ length: 8 }, (_, i) => i + 40),
    ...Array.from({ length: 10 }, (_, i) => i + 50),
    ...Array.from({ length: 13 }, (_, i) => i + 60),
    ...Array.from({ length: 12 }, (_, i) => i + 80),
    ...Array.from({ length: 8 }, (_, i) => i + 95),
  ].map((n) => `S-${String(n).padStart(2, '0')}`);
  expect(expected).toHaveLength(82);
  const covered = new Set([...ROUTES.map((r) => r.sid), ...NON_ROUTE_SIDS]);
  expect(expected.filter((sid) => !covered.has(sid))).toEqual([]);

  // Route файл бүр smoke-д нээгдэнэ (route нэмээд smoke-д оруулахаа мартвал унана)
  const files: string[] = [];
  const walk = (d: string) =>
    readdirSync(d).forEach((n) => {
      const p = join(d, n);
      if (statSync(p).isDirectory()) return n === '__tests__' ? undefined : walk(p);
      if (/\.tsx$/.test(n) && !/^(_layout|\+html|\+not-found)/.test(n)) files.push(relative(APP, p).split('\\').join('/'));
    });
  walk(APP);
  const toUrl = (f: string) =>
    '/' +
    f
      .replace(/\.tsx$/, '')
      .replace(/\([^)]+\)\//g, '')
      .replace(/(^|\/)index$/, '')
      .replace(/\[[^\]]+\]/g, ':');
  const smokePaths = ROUTES.map((r) => r.path(fakeIds).split('?')[0].replace(/\/(0192f3a4-[^/]+|2026|birthday%3A[^/]+)/g, '/:'));
  // S-ID-гүй туслах route: gate, OAuth буцалт, «Би биш», урилгын холбоос, мэдэгдэл нээх, түгжээ, баяр, бодлогын хаалга, ганцаараа хуваалцах
  const helper = new Set(['/', '/oauth-callback', '/not-me', '/i/:', '/invite', '/notification-open', '/lock', '/celebration', '/policy-update', '/solo-share', '/join-confirm']);
  const missing = files.map(toUrl).filter((u) => !helper.has(u) && !smokePaths.includes(u));
  expect(missing).toEqual([]);
});

const FAKE = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const fakeIds: SmokeIds = {
  memory: { id: FAKE } as SmokeIds['memory'],
  groupId: FAKE,
  planId: FAKE,
  goalId: FAKE,
  letterId: FAKE,
  capsuleId: FAKE,
  recapId: FAKE,
  userA: { id: FAKE } as TestUser,
};
