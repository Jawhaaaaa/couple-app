import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { setClock } from '../support/clock';
import { resetServerClock } from '../support/clock';
import { confirmStartDate, linkedCouple, patchMe } from '../support/couple';
import { createMemoryApi, makeJpeg } from '../support/memories';
import { signInUi } from '../support/users';

/**
 * Тохиргоо (T-80, T-81): S-80 → S-89 «Лиценз ба талархал» (§3.5, AC-AS-02), S-88 «English» — дахин
 * ачаалалгүй бүх дэлгэц англи, огноо/тоо англи форматаар (FR-18.1, §3.6, AC-135).
 */
interface Licenses {
  groups: { id: string; items: { name: string; notice: string }[] }[];
}

/** Апп-ын харуулдаг жагсаалтын эх (`docs/ASSETS.md`-ээс үүсгэсэн) — тест нэг ч мөр дутуу эсэхийг шалгана. */
const LICENSES = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../mobile/src/content/licenses.json', import.meta.url)), 'utf8'),
) as Licenses;

const NOON_UB = '2026-11-07T12:00:00+08:00';
const RELOAD_MARKER = '__auraLocaleMarker';

async function openSettings(page: Page, screen: string) {
  await page.getByTestId(screen).getByTestId('topbar-avatar').click();
  await expect(page.getByTestId('screen-S-80')).toBeVisible();
}

test.describe('Тохиргоо', () => {
  test.afterEach(async () => resetServerClock());

  test('AC-AS-02 S-80 → S-89: Noto © Google CC BY 4.0, Fluent Emoji MIT, фонт OFL, OSM ба Open-Meteo, бүх нээлттэй эхийн сан', async ({ partnerA }) => {
    const page = partnerA.page;
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'acas02');
    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await openSettings(page, 'screen-S-20');
    await page.getByTestId('settings-licenses').click();
    const s89 = page.getByTestId('screen-S-89');
    await expect(s89).toBeVisible();
    await expect(s89.getByText('Лиценз ба талархал').first()).toBeVisible();

    const assets = s89.getByTestId('licenses-assets');
    await expect(assets.getByText('Animated Noto Emoji © Google, CC BY 4.0', { exact: true })).toBeVisible();
    await expect(assets.getByText('Fluent Emoji 3D © Microsoft, MIT', { exact: true })).toBeVisible();

    const libraries = s89.getByTestId('licenses-libraries');
    for (const font of ['Nunito', 'Playfair Display']) {
      await expect(libraries.getByText(new RegExp(`^${font} .*SIL OFL 1\\.1$`)).first()).toBeVisible();
    }

    const data = s89.getByTestId('licenses-data');
    await expect(data.getByText('© OpenStreetMap contributors — ODbL 1.0', { exact: true })).toBeVisible();
    await expect(data.getByText('Open-Meteo — CC BY 4.0', { exact: true })).toBeVisible();

    // Жагсаалтын бүх мөр (нээлттэй эхийн сан бүр) дэлгэцэд, нэг ч дутуугүй
    const all = LICENSES.groups.flatMap((g) => g.items.map((item) => ({ group: g.id, notice: item.notice })));
    expect(all.length).toBeGreaterThanOrEqual(10);
    for (const { group, notice } of all) {
      await expect(s89.getByTestId(`licenses-${group}`).getByText(notice, { exact: true })).toBeVisible();
    }
    await expect(s89.getByTestId('license-item')).toHaveCount(all.length);
    // Гадаад холбоостой мөр бүр нэртэй link
    await expect(s89.getByRole('link', { name: /Animated Noto Emoji/ })).toBeVisible();
  });

  test('AC-135 S-88 «English» — дахин ачаалалгүй нүүр, тоолуур, дурсамж, тохиргоо англиар; огноо, тоо, цаг англи форматаар', async ({ partnerA }) => {
    const page = partnerA.page;
    await setClock([page], NOON_UB);
    const [a, b] = await linkedCouple(partnerA.name, 'Ану', 'ac135');
    await patchMe(b, { timezone: 'Asia/Tokyo' });
    // 2023-01-01-нөөс 2026-11-07 (хоёр тал ороод) = 1407 хоног
    await confirmStartDate(a, b, '2023-01-01');
    const memory = await createMemoryApi(a, await makeJpeg(page), { title: 'Summer in Terelj', occurredOn: '2025-07-12' });

    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    // Эхлэх төлөв — монгол
    await expect(page.getByTestId('tab-home')).toContainText('Нүүр');
    await expect(page.getByTestId('person-partner-time')).toHaveText(/^13:00$/);
    await expect(page.getByTestId('counter-days')).toHaveText('1407', { timeout: 3_000 });

    await page.evaluate((key) => ((window as unknown as Record<string, string>)[key] = 'same-document'), RELOAD_MARKER);
    await openSettings(page, 'screen-S-20');
    await page.getByTestId('settings-appearance').click();
    const s88 = page.getByTestId('screen-S-88');
    await expect(s88).toBeVisible();
    await expect(s88.getByText('Харагдах байдал').first()).toBeVisible();
    await page.getByTestId('appearance-locale-en').click();

    // S-88 өөрөө шууд англи
    await expect(s88.getByText('Appearance').first()).toBeVisible();
    await expect(s88.getByText('Language', { exact: true })).toBeVisible();
    await expect(s88.getByText('Харагдах байдал')).toHaveCount(0);
    await expect(page.getByTestId('appearance-theme-mode-dark')).toHaveAccessibleName('Dark');
    await expect(page.getByTestId('appearance-date-example')).toContainText('2026.11.07');

    // S-80
    await s88.getByTestId('stack-back').click();
    const s80 = page.getByTestId('screen-S-80');
    await expect(s80).toBeVisible();
    await expect(s80.getByText('Settings', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('settings-appearance')).toContainText('Appearance');
    await expect(page.getByTestId('settings-licenses')).toContainText(/Licen[cs]es/);

    // S-20 — табууд, хамтрагчийн цаг 12 цагийн форматаар
    await page.goBack();
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    for (const [tab, label] of [
      ['home', 'Home'],
      ['memories', 'Memories'],
      ['chat', 'Chat'],
      ['plans', 'Plans'],
      ['together', 'Together'],
    ]) {
      await expect(page.getByTestId(`tab-${tab}`)).toContainText(label);
    }
    await expect(page.getByTestId('person-partner-time')).toHaveText(/^1:00\s?PM$/);
    await expect(page.getByTestId('home-counter')).toHaveAccessibleName(/1407\s*days together/);

    // S-21 — тоо англи мянгатын таслалтай
    await page.getByTestId('home-counter').click();
    await expect(page.getByTestId('screen-S-21')).toBeVisible();
    await expect(page.getByTestId('counter-sheet-days')).toHaveText('1,407');
    await expect(page.getByTestId('counter-breakdown')).toHaveText('3 years 10 months 6 days');
    await expect(page.getByTestId('counter-start')).toHaveText('Started on 2023.01.01');

    // S-31 — огнооны урт хэлбэр англиар
    await page.getByTestId('tab-memories').click();
    await expect(page.getByTestId('screen-S-30')).toBeVisible();
    await expect(page.getByText('July 2025 · 1 memory')).toBeVisible();
    await page.getByTestId(`memory-card-${memory.id}`).click();
    await expect(page.getByTestId('screen-S-31')).toBeVisible();
    await expect(page.getByTestId('memory-date')).toHaveText('July 12, 2025');

    expect(await page.evaluate((key) => (window as unknown as Record<string, string>)[key], RELOAD_MARKER)).toBe('same-document');
  });
});
