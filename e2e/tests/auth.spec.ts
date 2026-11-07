import { expect, type Page, test } from '@playwright/test';

import { API_BASE } from '../support/env';
import { extractCode, waitForMail } from '../support/mailpit';
import { uniqueEmail } from '../support/seed';

/**
 * Нэвтрэлт (T-21): S-04 бүртгэл → S-05 код (Mailpit) → S-07 → нүүр (AC-01),
 * 18+ (AC-04), бодлогын зөвшөөрөл (AC-63), нууц үгийн дүрэм (AC-164).
 * Хөтчийн бүс `Asia/Ulaanbaatar` (playwright.config.ts) — «өнөөдөр»-ийг тэр бүсээр.
 */
const ZONE = 'Asia/Ulaanbaatar';
const STRONG_PASSWORD = 'Talbai-Nuur-2026';
const AGE_MESSAGE = 'Aura нь 18+ хүмүүст зориулагдсан';

/** Тухайн бүсийн өнөөдөр [жил, сар, өдөр]. */
function todayParts(): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  return [parts[0], parts[1], parts[2]];
}

/** Өнөөдрөөс `years` жилийн өмнөх огноо + `plusDays` өдөр, `YYYYMMDD` (талбарт бичих цифр). */
function birthDigits(years: number, plusDays = 0): string {
  const [y, m, d] = todayParts();
  // 2-р сарын 29 → 28 (backend-ийн plusYears-тэй ижил хил)
  const day = m === 2 && d === 29 ? 28 : d;
  const date = new Date(Date.UTC(y - years, m - 1, day + plusDays));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function openRegister(page: Page) {
  await page.goto('/register');
  await expect(page.getByTestId('screen-S-04')).toBeVisible();
  // Бодлого (`GET /policies/current`) ачаалагдмагц зөвшөөрөх боломжтой болно
  await expect(page.getByTestId('policy-checkbox')).toBeEnabled();
}

async function fillRegister(page: Page, { email, password = STRONG_PASSWORD, birth = birthDigits(25) }: { email: string; password?: string; birth?: string }) {
  await page.getByTestId('register-name').fill('Бат');
  await page.getByTestId('register-email').fill(email);
  await page.getByTestId('register-password').fill(password);
  await page.getByTestId('register-birthdate').fill(birth);
}

async function currentPolicyVersion(): Promise<string> {
  const res = await fetch(`${API_BASE}/policies/current`);
  expect(res.ok).toBe(true);
  return ((await res.json()) as { version: string }).version;
}

async function registerViaApi(body: Record<string, unknown>) {
  return fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test.describe('Нэвтрэлт ба бүртгэл', () => {
  test('AC-63 бодлогыг зөвшөөрөөгүй бол «Бүртгүүлэх» идэвхгүй', async ({ page }) => {
    await openRegister(page);
    await fillRegister(page, { email: uniqueEmail('ac63') });

    const submit = page.getByTestId('register-submit');
    await expect(submit).toBeDisabled();

    await page.getByTestId('policy-checkbox').click();
    await expect(page.getByTestId('policy-checkbox')).toBeChecked();
    await expect(submit).toBeEnabled();

    await page.getByTestId('policy-checkbox').click();
    await expect(submit).toBeDisabled();
  });

  test('AC-04 18 хүрээгүй бол «Aura нь 18+ хүмүүст зориулагдсан», акаунт үүсэхгүй', async ({ page }) => {
    const email = uniqueEmail('ac04');
    await openRegister(page);
    // 18 насны өдрөөс нэг өдрийн өмнө (жишээ нь 2026-11-07-нд 2008-11-08)
    await fillRegister(page, { email, birth: birthDigits(18, 1) });
    await expect(page.getByText(AGE_MESSAGE)).toBeVisible();

    await page.getByTestId('policy-checkbox').click();
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('screen-S-04')).toBeVisible();
    await expect(page.getByTestId('screen-S-05')).toHaveCount(0);

    // Яг 18 насны өдөр (2008-11-07) — зөвшөөрнө
    await page.getByTestId('register-birthdate').fill(birthDigits(18));
    await expect(page.getByText(AGE_MESSAGE)).toHaveCount(0);

    // Сервер ч мөн татгалзана (AGE_RESTRICTED)
    const under = birthDigits(18, 1);
    const res = await registerViaApi({
      email: uniqueEmail('ac04api'),
      password: STRONG_PASSWORD,
      displayName: 'Бат',
      birthDate: `${under.slice(0, 4)}-${under.slice(4, 6)}-${under.slice(6)}`,
      locale: 'mn',
      timezone: ZONE,
      acceptedPolicyVersion: await currentPolicyVersion(),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('AGE_RESTRICTED');
  });

  test('AC-164 сул (7 тэмдэгт) ба түгээмэл нууц үгийг шалтгаантай татгалзаж, хүчтэйг бүртгэнэ', async ({ page }) => {
    const email = uniqueEmail('ac164');
    await openRegister(page);
    await fillRegister(page, { email, password: '1234567' });
    await page.getByTestId('policy-checkbox').click();

    await expect(page.getByTestId('password-issue')).toContainText('8 тэмдэгт');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('screen-S-04')).toBeVisible();

    await page.getByTestId('register-password').fill('password1');
    await expect(page.getByTestId('password-issue')).toContainText('түгээмэл');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('screen-S-04')).toBeVisible();

    // Сервер ч мөн татгалзана
    const version = await currentPolicyVersion();
    const base = { displayName: 'Бат', birthDate: '1998-05-14', locale: 'mn', timezone: ZONE, acceptedPolicyVersion: version };
    const weak = await registerViaApi({ ...base, email: uniqueEmail('ac164w'), password: '1234567' });
    expect(weak.status).toBe(400);
    expect(((await weak.json()) as { code: string }).code).toBe('PASSWORD_WEAK');
    const common = await registerViaApi({ ...base, email: uniqueEmail('ac164c'), password: 'password1' });
    expect(common.status).toBe(400);
    expect(((await common.json()) as { code: string }).code).toBe('PASSWORD_COMMON');

    await page.getByTestId('register-password').fill(STRONG_PASSWORD);
    await expect(page.getByTestId('password-issue')).toHaveCount(0);
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('screen-S-05')).toBeVisible();
  });

  test('AC-01 бүртгүүлж Mailpit-ийн 6 оронтой кодоор баталгаажуулаад S-07 → нүүр', async ({ page }) => {
    const email = uniqueEmail('ac01');
    await openRegister(page);
    await fillRegister(page, { email });
    await page.getByTestId('policy-checkbox').click();
    const sentAfter = new Date(Date.now() - 1000);
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('screen-S-05')).toBeVisible();
    await expect(page.getByTestId('resend-countdown')).toBeVisible();
    const mail = await waitForMail(email, { after: sentAfter });
    const code = extractCode(mail.text || mail.html);

    // Буруу код — үлдсэн оролдлогыг харуулна
    const wrong = code === '000000' ? '111111' : '000000';
    await page.getByTestId('code-input').fill(wrong);
    await expect(page.getByTestId('verify-error')).toContainText('Код буруу');

    await page.getByTestId('code-input').fill(code);
    await expect(page.getByTestId('screen-S-07')).toBeVisible();

    await page.getByTestId('profile-later').click();
    await expect(page.getByTestId('screen-S-20')).toBeVisible();
  });

  test('S-03 «Нууц үг мартсан» ба «Бүртгүүлэх» холбоос', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('screen-S-03')).toBeVisible();
    await page.getByTestId('login-forgot').click();
    await expect(page.getByTestId('screen-S-06')).toBeVisible();
    await page.getByTestId('forgot-back').click();
    await page.getByTestId('login-register').click();
    await expect(page.getByTestId('screen-S-04')).toBeVisible();
  });
});
