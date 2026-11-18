import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/twoPartners';
import { confirmStartDate, linkedCouple } from '../support/couple';
import { signInUi, type TestUser } from '../support/users';

/**
 * AC-197 (NFR-07): гол дэлгэцүүд (S-03, S-20, S-30, S-40, S-50, S-60, S-80) axe-аар WCAG 2.2 AA-ийн
 * зөрчил 0; интерактив элемент бүр нэртэй (accessibilityLabel) ба ≥ 44×44. TalkBack/VoiceOver — ГАР
 * (`docs/MANUAL-TEST.md`).
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SCREENS = [
  ['S-20', '/home'],
  ['S-30', '/memories'],
  ['S-40', '/chat'],
  ['S-50', '/plans'],
  ['S-60', '/together'],
  ['S-80', '/settings'],
] as const;

async function axeViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
}

/** Харагдаж буй интерактив элемент бүрийн нэр ба хэмжээ (≥ 44×44, NFR-07). */
async function touchTargetIssues(page: Page) {
  return page.evaluate(() => {
    const issues: string[] = [];
    const nodes = document.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"]');
    nodes.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) return;
      if (rect.bottom < 0 || rect.top > innerHeight) return;
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || (el as HTMLInputElement).placeholder || '').trim();
      const id = el.getAttribute('data-testid') ?? el.outerHTML.slice(0, 80);
      if (!name && !el.getAttribute('aria-labelledby')) issues.push(`нэргүй: ${id}`);
      // Мөр доторх текстийн холбоос (WCAG 2.5.8-ийн «inline» үл хамаарал) — урт текстийн дунд
      const inline = el.tagName === 'A' && style.display === 'inline';
      if (!inline && (rect.width < 43.5 || rect.height < 43.5)) issues.push(`${Math.round(rect.width)}×${Math.round(rect.height)}: ${id}`);
    });
    return issues;
  });
}

test.describe('AC-197 хүртээмж (axe, WCAG 2.2 AA)', () => {
  let a: TestUser;

  test.beforeAll(async () => {
    const [x, y] = await linkedCouple('Бат', 'Ану', 'a11y');
    await confirmStartDate(x, y, '2025-02-14');
    a = x;
  });

  test('S-03 нэвтрэх — axe зөрчил 0, товч нэртэй ба ≥ 44×44', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('screen-S-03')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    expect(await touchTargetIssues(page)).toEqual([]);
  });

  test('гол таб ба тохиргоо — axe зөрчил 0, товч нэртэй ба ≥ 44×44', async ({ page }) => {
    await signInUi(page, a);
    for (const [sid, path] of SCREENS) {
      await test.step(sid, async () => {
        await page.goto(path);
        await expect(page.getByTestId(`screen-${sid}`)).toBeVisible();
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
        expect.soft(await axeViolations(page), `${sid} axe`).toEqual([]);
        expect.soft(await touchTargetIssues(page), `${sid} товч`).toEqual([]);
      });
    }
  });
});
