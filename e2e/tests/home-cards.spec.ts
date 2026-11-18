import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import type { OpenMeteoMock } from '../mocks/openMeteo';
import { resetServerClock, setServerClock } from '../support/clock';
import { confirmStartDate, linkedCouple, patchMe } from '../support/couple';
import { signInUi } from '../support/users';
import { startConfiguredOpenMeteo, uniqueTokyo } from '../support/weather';

/**
 * S-20 нүүрний картууд (T-66, FR-3.2): хамтрагчийн картанд хотын цаг агаар (AC-71). Цаг агаарыг
 * backend (`WeatherService` → Open-Meteo) татаж `Dashboard.partner.weather`-д өгнө; E2E-д Open-Meteo
 * нь `mocks/openMeteo.ts` (`support/weather.ts`-ийн тохиргоо).
 */
let weather: OpenMeteoMock;

test.beforeEach(async () => {
  weather = await startConfiguredOpenMeteo();
});

test.afterEach(async () => {
  await weather?.close();
  await resetServerClock();
});

test.describe('S-20 нүүрний картууд', () => {
  test('AC-71 B-гийн хот Токио: хамтрагчийн картанд температур + дүрс; mock алдаа буцаахад цаг агаарын хэсэг нуугдаж бусад нь ажиллана', async ({
    partnerA,
    partnerB,
  }) => {
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac71');
    await confirmStartDate(a, b, '2025-03-01');
    const city = uniqueTokyo();
    await patchMe(b, { timezone: 'Asia/Tokyo', city });
    const page = partnerA.page;

    await signInUi(page, a);
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    const card = page.getByTestId('person-partner');
    await expect(card).toBeVisible();
    // Mock: −18.4 °C, WMO 71 (цас) → «-18°» + snowflake дүрс
    const forecastHit = () => weather.requests.some((r) => r.startsWith('/v1/forecast') && r.includes(`latitude=${city.lat}`));
    await expect.poll(forecastHit, { message: 'backend Open-Meteo mock-ийг дуудсангүй (AURA_WEATHER_BASE_URL)' }).toBe(true);
    await expect(page.getByTestId('weather-partner')).toBeVisible();
    await expect(page.getByTestId('weather-partner-temp')).toHaveText(/^[-−]18°$/);
    await expect(card.getByTestId('weather-partner-icon-snowflake')).toBeVisible();
    await expect(page.getByTestId('weather-partner')).toHaveAccessibleName(/[-−]18°/);

    // Open-Meteo унав: кэш (30 мин) дуусах хүртэл серверийн цагийг урагшлуулж нүүрийг дахин ачаална
    weather.setFail(true);
    const failedBefore = weather.requests.length;
    await setServerClock(new Date(Date.now() + 31 * 60_000));
    const dashboard = page.waitForResponse((r) => r.url().includes('/api/v1/dashboard') && r.request().method() === 'GET' && r.ok());
    await page.reload();
    await dashboard;
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
    await expect.poll(() => weather.requests.length, { message: 'Open-Meteo-г дахин дуудсангүй (кэш)' }).toBeGreaterThan(failedBefore);

    await expect(card).toBeVisible();
    await expect(page.getByTestId('weather-partner')).toHaveCount(0);
    // Картын бусад хэсэг ба нүүр хэвээр
    await expect(page.getByTestId('person-partner-name')).toHaveText(partnerB.name);
    await expect(page.getByTestId('person-partner-time')).toHaveText(/^\d{1,2}:\d{2}$/);
    await expect(page.getByTestId('person-partner-offset')).toHaveText('+1 цаг');
    await expect(page.getByTestId('person-me')).toBeVisible();
    await expect(page.getByTestId('home-counter')).toBeVisible();
  });
});
