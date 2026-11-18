import { type Browser, type BrowserContextOptions, devices, expect, type Page, test } from '@playwright/test';

import { confirmStartDate, linkedCouple } from '../support/couple';
import { signInUi, type TestUser } from '../support/users';

/**
 * S-100 PWA суулгах заавар (T-84, FR-19.2, AC-153): нэвтэрсний дараа нүүрэнд (S-20) буухад апп өөрөө
 * санал болгоно (`PwaPrompts`, 1.5 с). Хөтчийн төрлийг user-agent-аар загварчилна:
 *  (а) iOS Safari, standalone биш → зурагтай 3 алхам;
 *  (б) `display-mode: standalone` (суусан) → гарахгүй;
 *  (в) хаагаад 6 хоногийн дараа гарахгүй, 8 хоногийн дараа гарна (хөтчийн цаг — `page.clock`);
 *  (г) iOS-ийн бусад хөтөч (CriOS) → «Safari-аар нээнэ үү»;
 *  (д) Android Chrome `beforeinstallprompt` → «Суулгах» товч.
 * Бүгдэд push/offline суулгасны дараа ажилладаг гэсэн тайлбар.
 *
 * `fixtures/twoPartners.ts` нь S-100/S-101-ийг анхдагчаар дардаг тул энэ spec `@playwright/test`-ийг
 * шууд ашиглана. S-101 (мэдэгдэл) нь S-100-аас хойш санал болгогддог тул «аль хэдийн санал болгосон»
 * гэж тэмдэглэнэ — энд зөвхөн S-100-ийн шийдвэрийг шалгана.
 */
const UA = {
  iosSafari: devices['iPhone 14'].userAgent,
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  androidChrome: devices['Pixel 7'].userAgent,
};
const DAY = 24 * 60 * 60 * 1000;
/** `PROMPT_DELAY_MS` (1.5 с)-ээс илүү — санал гарах эсэх шийдэгдсэн байна. */
const PAST_PROMPT_DELAY_MS = 3_000;

let user: TestUser;

test.beforeAll(async () => {
  const [a, b] = await linkedCouple('Бат', 'Ану', 'pwainst');
  await confirmStartDate(a, b, '2025-02-14');
  user = a;
});

interface OpenOptions {
  userAgent: string;
  /** Суусан PWA (`display-mode: standalone`, iOS `navigator.standalone`). */
  standalone?: boolean;
  /** Хөтчийн цагийг удирдах (`page.clock.install`) — эхлэх агшин. */
  clockAt?: Date;
}

async function openApp(browser: Browser, contextOptions: BrowserContextOptions, opts: OpenOptions): Promise<Page> {
  const context = await browser.newContext({ ...contextOptions, userAgent: opts.userAgent });
  await context.addInitScript(() => {
    // S-101-ийг (S-100-ийн дараагийн санал) «санал болгосон» гэж тэмдэглэнэ; S-100-ийн төлөвт хүрэхгүй
    const key = 'aura.install-prompt';
    if (window.localStorage.getItem(key) == null) {
      window.localStorage.setItem(key, JSON.stringify({ state: { dismissedAt: null, pushOffered: true }, version: 0 }));
    }
  });
  if (opts.standalone) {
    await context.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (!/display-mode:\s*standalone/.test(query)) return original(query);
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      };
      Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
    });
  }
  const page = await context.newPage();
  if (opts.clockAt) await page.clock.install({ time: opts.clockAt });
  return page;
}

/** Нэвтэрч нүүрэнд (S-20) буух хүртэл. */
async function signInToHome(page: Page) {
  await signInUi(page, user);
  await expect(page.getByTestId('screen-S-20').filter({ visible: true }).or(page.getByTestId('screen-S-100'))).toBeVisible();
}

/**
 * Нүүрэнд S-100 автоматаар гарахгүйг шалгана: хөтчийн цагийг саналын хугацаанаас цааш гүйлгэж
 * (`fastForward` — хугацаа нь болсон timer-ууд ажиллана) шийдвэр гарсны дараа S-100 алга, нүүр хэвээр.
 */
async function expectNoInstallOffer(page: Page) {
  await expect(page.getByTestId('screen-S-20').filter({ visible: true })).toBeVisible();
  await page.clock.fastForward(PAST_PROMPT_DELAY_MS);
  await page.clock.fastForward(PAST_PROMPT_DELAY_MS);
  await expect(page.getByTestId('screen-S-100')).toHaveCount(0);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('screen-S-20').filter({ visible: true })).toBeVisible();
}

/** Бүх хувилбарт: push ба offline нь суулгасны дараа ажилладаг гэсэн тайлбар. */
async function expectBenefits(page: Page) {
  const benefits = page.getByTestId('install-benefits');
  await expect(benefits).toBeVisible();
  await expect(benefits).toContainText('Мэдэгдэл (push)');
  await expect(benefits).toContainText('интернэтгүй');
  await expect(benefits).toContainText('суулгасны дараа');
}

test.describe('AC-153 S-100 суулгах заавар', () => {
  test('AC-153 (а) iOS Safari, standalone биш — нэвтэрсний дараа зурагтай 3 алхамт заавар', async ({ browser, contextOptions }) => {
    const page = await openApp(browser, contextOptions, { userAgent: UA.iosSafari });
    await signInToHome(page);
    await expect(page.getByTestId('screen-S-100')).toBeVisible();
    await expect(page).toHaveURL(/\/install$/);
    const steps = page.getByTestId('install-ios-steps');
    await expect(steps).toBeVisible();
    const expected = ['«Хуваалцах»', '«Нүүр дэлгэцэнд нэмэх»', '«Нэмэх»'];
    for (const [i, text] of expected.entries()) {
      const step = page.getByTestId(`install-ios-step-${i + 1}`);
      await expect(step).toBeVisible();
      await expect(step).toContainText(text);
      // Алхам бүр Safari-ийн товчтой ижил дүрстэй (зурагтай заавар)
      await expect(step.locator('svg').first()).toBeVisible();
    }
    await expect(page.getByTestId('install-ios-other')).toHaveCount(0);
    await expect(page.getByTestId('install-button')).toHaveCount(0);
    await expectBenefits(page);
    await page.context().close();
  });

  test('AC-153 (б) display-mode: standalone (суусан) — S-100 гарахгүй; гараар нээвэл «аль хэдийн суусан»', async ({ browser, contextOptions }) => {
    const page = await openApp(browser, contextOptions, { userAgent: UA.iosSafari, standalone: true, clockAt: new Date() });
    await signInToHome(page);
    await expectNoInstallOffer(page);
    await page.goto('/install');
    await expect(page.getByTestId('screen-S-100')).toBeVisible();
    await expect(page.getByTestId('install-standalone')).toBeVisible();
    await expect(page.getByTestId('install-ios-steps')).toHaveCount(0);
    await expect(page.getByTestId('install-later')).toHaveCount(0);
    await page.context().close();
  });

  test('AC-153 (в) S-100-г хаасны дараа 6 дахь өдөр гарахгүй, 8 дахь өдөр гарна', async ({ browser, contextOptions }) => {
    const start = new Date();
    const page = await openApp(browser, contextOptions, { userAgent: UA.iosSafari, clockAt: start });
    await signInToHome(page);
    await expect(page.getByTestId('screen-S-100')).toBeVisible();
    await page.getByTestId('install-later').click();
    await expect(page.getByTestId('screen-S-100')).toHaveCount(0);
    await expect(page.getByTestId('screen-S-20').filter({ visible: true })).toBeVisible();
    // Хаасан агшин хадгалагдсан (installPromptStore persist)
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aura.install-prompt') ?? '{}')?.state?.dismissedAt ?? null))
      .not.toBeNull();

    // 6 хоногийн дараа апп-ыг дахин нээнэ — гарахгүй
    await page.clock.setSystemTime(start.getTime() + 6 * DAY);
    await page.goto('/home');
    await expectNoInstallOffer(page);

    // 8 хоногийн дараа — дахин гарна
    await page.clock.setSystemTime(start.getTime() + 8 * DAY);
    await page.goto('/home');
    await expect(page.getByTestId('screen-S-20').filter({ visible: true }).or(page.getByTestId('screen-S-100'))).toBeVisible();
    await page.clock.fastForward(PAST_PROMPT_DELAY_MS);
    await expect(page.getByTestId('screen-S-100')).toBeVisible();
    await expect(page.getByTestId('install-ios-steps')).toBeVisible();
    await page.context().close();
  });

  test('AC-153 (г) iOS-ийн бусад хөтөч (Chrome — CriOS) — «Safari-аар нээнэ үү»', async ({ browser, contextOptions }) => {
    const page = await openApp(browser, contextOptions, { userAgent: UA.iosChrome });
    await signInToHome(page);
    await expect(page.getByTestId('screen-S-100')).toBeVisible();
    const other = page.getByTestId('install-ios-other');
    await expect(other).toBeVisible();
    await expect(other).toContainText('Safari-аар нээнэ үү');
    await expect(page.getByTestId('install-copy-link')).toBeVisible();
    await expect(page.getByTestId('install-ios-steps')).toHaveCount(0);
    await expect(page.getByTestId('install-button')).toHaveCount(0);
    await expectBenefits(page);
    await page.context().close();
  });

  test('AC-153 (д) Android Chrome `beforeinstallprompt` — «Суулгах» товч хөтчийн суулгах цонхыг нээнэ', async ({ browser, contextOptions }) => {
    const page = await openApp(browser, contextOptions, { userAgent: UA.androidChrome });
    await signInUi(page, user);
    await expect(page.getByTestId('screen-S-20').filter({ visible: true })).toBeVisible();
    // Хөтөч суулгахыг санал болгоно (Chromium-ийн `beforeinstallprompt` — бусад хөтөчид ижил хэлбэрээр
    // үүсгэнэ); апп үүнийг барьж (preventDefault — хөтчийн жижиг мөр гарахгүй) S-100-д товч болгоно
    const captured = await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      const w = window as unknown as { __installPrompts: number };
      w.__installPrompts = 0;
      Object.assign(event, {
        platforms: ['web'],
        prompt: () => {
          w.__installPrompts += 1;
          return Promise.resolve();
        },
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(captured).toBe(true);
    await expect(page.getByTestId('screen-S-100')).toBeVisible();
    await expect(page.getByTestId('install-prompt')).toBeVisible();
    const install = page.getByTestId('install-button');
    await expect(install).toBeVisible();
    await expect(install).toContainText('Суулгах');
    await expect(page.getByTestId('install-ios-steps')).toHaveCount(0);
    await expectBenefits(page);
    await install.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __installPrompts: number }).__installPrompts)).toBe(1);
    await expect(page.getByTestId('install-message')).toContainText('Суулгаж байна');
    await page.context().close();
  });
});
