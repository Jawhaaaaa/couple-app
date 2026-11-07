import { expect, test } from '../fixtures/twoPartners';
import { startOAuthIdp } from '../mocks/oauthIdp';
import { startOpenMeteoMock } from '../mocks/openMeteo';
import { resetServerClock, setServerClock } from '../support/clock';
import { API_BASE, API_URL, MAILPIT_URL } from '../support/env';

/**
 * E2E орчны суурь (T-16): апп нээгдэх, хоёр context, backend-ийн тестийн endpoint,
 * Mailpit, mock-ууд. Backend шаардлагатай хэсэг compose (`dev,e2e` profile) дээр ажиллана.
 */
test.describe('E2E орчин', () => {
  test('апп-ын shell хоёр context-д тусдаа нээгдэнэ', async ({ partnerA, partnerB }) => {
    for (const { page } of [partnerA, partnerB]) {
      await page.goto('/home');
      await expect(page.getByTestId('tab-home')).toBeVisible();
      await expect(page.getByTestId('screen-S-20')).toBeVisible();
    }
    expect(partnerA.context).not.toBe(partnerB.context);
  });

  test('AC-209 backend health UP, Mailpit бэлэн', async ({ request }) => {
    const health = await request.get(`${API_URL}/actuator/health`);
    expect(health.status()).toBe(200);
    expect((await health.json()).status).toBe('UP');
    const mailpit = await request.get(`${MAILPIT_URL}/readyz`);
    expect(mailpit.ok()).toBe(true);
  });

  test('INV-10 e2e profile-д серверийн цаг тохирно', async ({ request }) => {
    await setServerClock('2026-11-07T15:59:00Z');
    await resetServerClock();
    const unknownJob = await request.post(`${API_BASE}/test/jobs/NO_SUCH_JOB/run`);
    expect(unknownJob.status()).toBe(404);
  });

  test('Open-Meteo ба OAuth IdP mock ажиллана', async () => {
    const weather = await startOpenMeteoMock();
    const idp = await startOAuthIdp();
    try {
      const geo = await (await fetch(`${weather.url}/v1/search?name=tokyo`)).json();
      expect(geo.results[0].timezone).toBe('Asia/Tokyo');
      weather.setFail(true);
      expect((await fetch(`${weather.url}/v1/forecast`)).status).toBe(503);
      const res = await fetch(`${idp.issuer}/authorize?redirect_uri=${encodeURIComponent('http://localhost/cb')}&state=s1`, {
        redirect: 'manual',
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toMatch(/^http:\/\/localhost\/cb\?code=\w+&state=s1$/);
    } finally {
      await weather.close();
      await idp.close();
    }
  });
});
