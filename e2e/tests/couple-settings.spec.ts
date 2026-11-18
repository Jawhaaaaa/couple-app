import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { makeJpeg } from '../support/memories';
import { apiJson, signInUi, type TestUser } from '../support/users';

/**
 * S-82 хосын тохиргоо (T-80, FR-18.5…18.7) ба S-91 (T-79): A хамтрагчаа «Бөмбөгөө» гэж хочилж зураг
 * өгөхөд зөвхөн A-гийн дэлгэцүүдэд, B-гийн апп ба API-д харагдахгүй (AC-137); сэдвийн санал — B
 * зөвшөөрвөл хоёр апп-ын палитр ≤ 5 с-д солигдоно, татгалзвал хэвээр ба A-д мэдэгдэл (AC-138); маскотын
 * бүсний өнгө Бөмбөлөг, Бөмбий хоёуланд, S-91-д semver + build + commit SHA (AC-190).
 */
const NICKNAME = 'Бөмбөгөө';

/** `mobile/src/theme/tokens.ts` — палитрын `primary` (цайвар/бараан). */
const PRIMARY = {
  CORAL: { light: '#D46A5F', dark: '#E2847A' },
  LAVENDER: { light: '#7C5FC9', dark: '#B9A3F0' },
} as const;
/** `mascotColors` (FR-18.7). */
const MASCOT_MINT = '#8FCB9B';

/**
 * S-91-ийн хүлээгдэх утга: build-д өгсөн `EXPO_PUBLIC_*` (CI-д build ба тест хоёуланд ижил утгаар
 * дамжуулна). Өгөөгүй build нь `mobile/app.json`-ийн хувилбар, `dev`, `local` (`platform/buildInfo.ts`).
 */
const APP_JSON = JSON.parse(readFileSync(fileURLToPath(new URL('../../mobile/app.json', import.meta.url)), 'utf8')) as { expo: { version: string } };
const EXPECTED_BUILD = {
  version: process.env.EXPO_PUBLIC_APP_VERSION || APP_JSON.expo.version,
  build: process.env.EXPO_PUBLIC_BUILD || 'dev',
  commit: process.env.EXPO_PUBLIC_COMMIT_SHA || 'local',
};

function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function openCoupleSettings(page: Page, user: TestUser) {
  await signInUi(page, user);
  await page.goto('/settings/couple');
  await expect(page.getByTestId('screen-S-82')).toBeVisible();
  await expect(page.getByTestId('couple-theme-current')).toBeVisible();
}

/**
 * Одоогийн палитрын `primary`: S-82-ийн «Сэдэв» картын гарчгийн дүрс (`SectionTitle` — `colors.primary`
 * өнгөтэй lucide svg). Зөвхөн палитраас хамаарна (сонголтын төлөвөөс биш).
 */
function primaryColor(page: Page): Promise<string | null> {
  return page
    .getByTestId('couple-theme')
    .locator('svg')
    .first()
    .evaluate((svg) => getComputedStyle(svg).stroke || svg.getAttribute('stroke'));
}

/** Одоогийн палитрын нэр (цайвар ба бараан горимын аль алинд — `primary` нь палитр бүрт өөр). */
async function palette(page: Page): Promise<string | null> {
  const color = await primaryColor(page);
  const hit = Object.entries(PRIMARY).find(([, m]) => color === rgb(m.light) || color === rgb(m.dark));
  return hit ? hit[0] : color;
}

/** Маскотын бүс — маскот доторх, тухайн өнгөтэй дэвсгэртэй элемент байгаа эсэх. */
function hasBelt(mascot: Locator, color: string): Promise<boolean> {
  return mascot.evaluate((root, want) => Array.from(root.querySelectorAll('div')).some((el) => getComputedStyle(el).backgroundColor === want), color);
}

/** `<img>`-ийн src-ийн зам (presigned query-гүй). */
function imgPaths(scope: Locator): Promise<string[]> {
  return scope.locator('img').evaluateAll((imgs) => imgs.map((img) => new URL((img as HTMLImageElement).src).pathname));
}

test.describe('S-82 хосын тохиргоо', () => {
  // Хоёр хамтрагчийн олон дэлгэцтэй урсгал — WebKit/Firefox-д нэг тест 60 с-ийн ерөнхий хязгаарт ойртдог
  test.describe.configure({ timeout: 90_000 });
  test('AC-137 A хамтрагчаа «Бөмбөгөө» гэж хочилж зураг өгнө — A-гийн дэлгэцүүдэд; B-гийн апп ба API-д харагдахгүй', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac137');
    // S-63: B биелүүлсэн мөр — «хэн биелүүлсэн» аватар ба нэр A-д хамтрагчийн хоч/зургаар харагдана
    const item = await apiJson<{ id: string; version: number }>(a, 'POST', '/lists/bucket/items', { title: 'Хөвсгөлд очих', clientId: randomUUID() });
    await apiJson(b, 'PATCH', `/list-items/${item.id}`, { done: true, version: item.version });

    const A = partnerA.page;
    await openCoupleSettings(A, a);
    await A.getByTestId('couple-nickname').fill(NICKNAME);
    await A.getByTestId('couple-nickname-save').click();
    await expect(A.getByTestId('couple-nickname-saved')).toBeVisible();

    const chooser = A.waitForEvent('filechooser');
    await A.getByTestId('couple-avatar-pick').click();
    await (await chooser).setFiles({ name: 'bombogoo.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(A, 400, 400, 200) });
    await expect(A.getByTestId('couple-avatar-saved')).toBeVisible({ timeout: 20_000 });
    await expect(A.getByTestId('couple-partner-avatar').locator('img')).toHaveCount(1);

    const mine = await apiJson<{ myView: { partnerNickname: string | null; partnerAvatar?: { id: string } | null } }>(a, 'GET', '/couple');
    expect(mine.myView.partnerNickname).toBe(NICKNAME);
    const avatarId = mine.myView.partnerAvatar?.id ?? '';
    expect(avatarId).not.toBe('');
    const [avatarPath] = await imgPaths(A.getByTestId('couple-partner-avatar'));
    expect(avatarPath).toContain(avatarId);

    // A-гийн бусад дэлгэц: S-20 хамтрагчийн карт, S-69 хуваалцах сонголт, S-63 «хэн биелүүлсэн»
    await A.goto('/home');
    await expect(A.getByTestId('person-partner-name')).toHaveText(NICKNAME);
    await A.goto('/together/checkin');
    await expect(A.getByTestId('screen-S-69')).toContainText(`Өнөөдрийнхийг ${NICKNAME}-тай хуваалцах`);
    await A.goto('/together/lists');
    const doneBy = A.getByTestId(`list-doneby-${item.id}`);
    await expect(doneBy).toContainText(NICKNAME);
    await expect.poll(async () => (await imgPaths(doneBy)).some((p) => p.includes(avatarId))).toBe(true);

    // B: апп-д хоч ба A-гийн өгсөн зураг алга (өөрийн нэр, зураггүй)
    const B = partnerB.page;
    await signInUi(B, b);
    await expect(B.getByTestId('screen-S-20')).toBeVisible();
    await expect(B.getByTestId('person-partner-name')).toHaveText(partnerA.name);
    await expect(B.getByTestId('screen-S-20')).not.toContainText(NICKNAME);
    await B.goto('/settings/profile');
    await expect(B.getByTestId('screen-S-81')).toBeVisible();
    await expect(B.getByTestId('screen-S-81')).not.toContainText(NICKNAME);
    expect((await imgPaths(B.getByTestId('screen-S-81'))).some((p) => p.includes(avatarId))).toBe(false);
    await B.goto('/settings/couple');
    await expect(B.getByTestId('couple-nickname')).toHaveValue('');
    await expect(B.getByTestId('screen-S-82')).not.toContainText(NICKNAME);

    // B: API-ийн аль ч хариунд алга
    for (const path of ['/couple', '/me', '/dashboard', '/lists/bucket/items']) {
      const body = JSON.stringify(await apiJson(b, 'GET', path));
      expect(body, path).not.toContain(NICKNAME);
      expect(body, path).not.toContain(avatarId);
    }
  });

  test('AC-138 A «Лаванда» санал болгоход B зөвшөөрвөл хоёр апп-ын палитр ≤ 5 с-д солигдоно', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac138y');
    const A = partnerA.page;
    const B = partnerB.page;
    await openCoupleSettings(A, a);
    await openCoupleSettings(B, b);
    await expect(A.getByTestId('couple-theme-current')).toHaveText('Одоогийн сэдэв: Коралл');
    await expect.poll(() => palette(A)).toBe('CORAL');
    await expect.poll(() => palette(B)).toBe('CORAL');
    await B.waitForLoadState('networkidle');

    await A.getByTestId('couple-theme-LAVENDER').click();
    await A.getByTestId('couple-theme-propose').click();
    await expect(A.getByTestId('couple-theme-pending-mine')).toHaveText(`Та «Лаванда» санал болголоо — ${partnerB.name} зөвшөөрөхийг хүлээж байна.`);
    // Зөвшөөрөхөөс өмнө палитр хэвээр
    expect(await palette(A)).toBe('CORAL');

    // B-д санал realtime-аар (reload-гүй)
    await expect(B.getByTestId('couple-theme-pending-partner')).toHaveText(`${partnerA.name} «Лаванда» сэдэв санал болгож байна.`);
    await B.getByTestId('couple-theme-accept').click();
    const acceptedAt = Date.now();
    await expect.poll(() => palette(B), { timeout: 5_000 }).toBe('LAVENDER');
    await expect.poll(() => palette(A), { timeout: Math.max(500, 5_000 - (Date.now() - acceptedAt)) }).toBe('LAVENDER');
    expect(Date.now() - acceptedAt).toBeLessThanOrEqual(5_000);
    await expect(A.getByTestId('couple-theme-current')).toHaveText('Одоогийн сэдэв: Лаванда');
    await expect(B.getByTestId('couple-theme-current')).toHaveText('Одоогийн сэдэв: Лаванда');
    await expect(A.getByTestId('couple-theme-pending-mine')).toHaveCount(0);
    expect((await apiJson<{ theme: string }>(a, 'GET', '/couple')).theme).toBe('LAVENDER');

    // Серверт хадгалагдсан — B дахин нээхэд ч Лаванда
    await B.goto('/settings/couple');
    await expect.poll(() => palette(B)).toBe('LAVENDER');
  });

  test('AC-138 B татгалзвал палитр хэвээр, A-д мэдэгдэл', async ({ partnerA, partnerB }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac138n');
    const A = partnerA.page;
    const B = partnerB.page;
    await openCoupleSettings(A, a);
    await openCoupleSettings(B, b);
    await A.waitForLoadState('networkidle');
    await B.waitForLoadState('networkidle');

    await A.getByTestId('couple-theme-LAVENDER').click();
    await A.getByTestId('couple-theme-propose').click();
    await expect(A.getByTestId('couple-theme-pending-mine')).toBeVisible();
    await expect(B.getByTestId('couple-theme-pending-partner')).toBeVisible();
    await B.getByTestId('couple-theme-decline').click();

    // A-д санал хаагдана (realtime), палитр хоёр талд Коралл хэвээр
    await expect(A.getByTestId('couple-theme-pending-mine')).toHaveCount(0);
    await expect(B.getByTestId('couple-theme-pending-partner')).toHaveCount(0);
    await expect(A.getByTestId('couple-theme-current')).toHaveText('Одоогийн сэдэв: Коралл');
    await expect(B.getByTestId('couple-theme-current')).toHaveText('Одоогийн сэдэв: Коралл');
    expect(await palette(B)).toBe('CORAL');
    expect((await apiJson<{ theme: string }>(a, 'GET', '/couple')).theme).toBe('CORAL');

    // A-д мэдэгдэл (S-24) — THEME_DECLINED-ийн бичвэрүүдийн нэг
    let declinedTitle = '';
    await expect
      .poll(async () => {
        const page = await apiJson<{ items: { type: string; title: string }[] }>(a, 'GET', '/notifications');
        declinedTitle = page.items.find((n) => n.type === 'THEME_DECLINED')?.title ?? '';
        return declinedTitle;
      })
      .not.toBe('');
    await A.goto('/notifications');
    await expect(A.getByTestId('screen-S-24')).toBeVisible();
    await expect(A.getByTestId('notification-item-unread').filter({ hasText: declinedTitle })).toHaveCount(1);
    // Палитр reload-ын дараа ч Коралл
    await A.goto('/settings/couple');
    await expect.poll(() => palette(A)).toBe('CORAL');
  });

  test('AC-190 S-82 маскотын бүсний өнгө Бөмбөлөг, Бөмбий хоёуланд; S-91-д semver + build + commit SHA', async ({ partnerA, partnerB }) => {
    const [a] = await linkedCouple(partnerA.name, partnerB.name, 'ac190');
    const A = partnerA.page;
    await openCoupleSettings(A, a);
    const bombolog = A.getByTestId('couple-mascot-preview');
    const bombii = A.getByTestId('couple-mascot').getByTestId('mascot-bombii');
    await expect(bombolog).toBeVisible();
    await expect(bombii).toBeVisible();
    expect(await hasBelt(bombolog, rgb(MASCOT_MINT))).toBe(false);

    await A.getByTestId('couple-mascot-mint').click();
    await expect(A.getByTestId('couple-mascot-mint')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => hasBelt(bombolog, rgb(MASCOT_MINT))).toBe(true);
    await expect.poll(() => hasBelt(bombii, rgb(MASCOT_MINT))).toBe(true);
    await expect.poll(async () => (await apiJson<{ myView: { mascotColor: string } }>(a, 'GET', '/couple')).myView.mascotColor).toBe('mint');

    // Серверт хадгалагдсан — reload-ын дараа ч, S-91-ийн маскотод ч
    await A.reload();
    await expect(A.getByTestId('screen-S-82')).toBeVisible();
    await expect.poll(() => hasBelt(A.getByTestId('couple-mascot-preview'), rgb(MASCOT_MINT))).toBe(true);
    await expect.poll(() => hasBelt(A.getByTestId('couple-mascot').getByTestId('mascot-bombii'), rgb(MASCOT_MINT))).toBe(true);

    await A.goto('/settings/about');
    await expect(A.getByTestId('screen-S-91')).toBeVisible();
    await expect.poll(() => hasBelt(A.getByTestId('screen-S-91').getByTestId('mascot-bombolog'), rgb(MASCOT_MINT))).toBe(true);
    await expect(A.getByTestId('about-version')).toHaveText(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
    await expect(A.getByTestId('about-version')).toHaveText(EXPECTED_BUILD.version);
    await expect(A.getByTestId('about-build-number')).toHaveText(EXPECTED_BUILD.build);
    await expect(A.getByTestId('about-commit')).toHaveText(EXPECTED_BUILD.commit);
    if (process.env.EXPO_PUBLIC_COMMIT_SHA) await expect(A.getByTestId('about-commit')).toHaveText(/^[0-9a-f]{7,40}$/);
  });
});
