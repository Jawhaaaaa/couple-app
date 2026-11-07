import { defineConfig, devices } from '@playwright/test';

/**
 * Aura E2E (шаардлага §8.5): Expo web export дээр, утасны профайлаар.
 * - `E2E_BASE_URL` — апп (анхдагч: `mobile/dist`-ийг энэ тохиргоо өөрөө үйлчилнэ)
 * - `E2E_API_URL` — backend (`SPRING_PROFILES_ACTIVE=dev,e2e`, тестийн endpoint идэвхтэй)
 * - `E2E_MAILPIT_URL` — Mailpit UI/API
 * Хоёр хамтрагч = хоёр browser context (`fixtures/twoPartners.ts`).
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8091';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'mn-MN',
    timezoneId: 'Asia/Ulaanbaatar',
  },
  projects: [
    { name: 'chromium-pixel7', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-iphone14', use: { ...devices['iPhone 14'] } },
    {
      name: 'firefox-mobile',
      // Firefox нь isMobile/hasTouch дэмждэггүй — утасны хэмжээгээр л
      use: { browserName: 'firefox', viewport: devices['iPhone 14'].viewport, userAgent: devices['iPhone 14'].userAgent },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node scripts/serve-dist.mjs',
        url: `${BASE_URL}/healthz`,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
