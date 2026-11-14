import { expect, type Page, test } from '@playwright/test';

import { confirmStartDate, linkedCouple } from '../support/couple';
import { signInUi, type TestUser } from '../support/users';

/**
 * AC-DS-05 (§3.2, NFR-07): системийн том фонт (200%)-д S-20, S-30, S-40, S-50, S-60, S-80-ийн текст
 * тайрагдахгүй, давхцахгүй. Вэбэд RN-ийн фонт px-ээр тул текст бүхий элемент бүрийн `font-size` ба
 * `line-height`-ийг 2 дахин өсгөж (системийн 200%-тай ижил) layout-ыг шалгана.
 */
const SCREENS = [
  ['S-20', '/home'],
  ['S-30', '/memories'],
  ['S-40', '/chat'],
  ['S-50', '/plans'],
  ['S-60', '/together'],
  ['S-80', '/settings'],
] as const;

test.skip(({ browserName }) => browserName !== 'chromium', 'Layout-ын шалгалт нэг хөтчид — smoke нь бусдыг хамарна');

/** Текст 200% болгоод тайрагдсан (ellipsis, overflow) ба давхцсан текстийн жагсаалтыг буцаана. */
async function largeTextIssues(page: Page, screenId: string): Promise<string[]> {
  return page.evaluate(async (screenId) => {
    const root = [...document.querySelectorAll<HTMLElement>(`[data-testid="${screenId}"]`)].find((e) => e.offsetParent !== null);
    if (!root) return [`${screenId} алга`];
    const texts = [...root.querySelectorAll<HTMLElement>('*')].filter(
      (el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) && el.offsetParent !== null,
    );
    for (const el of texts) {
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const line = cs.lineHeight === 'normal' ? size * 1.3 : parseFloat(cs.lineHeight);
      el.style.fontSize = `${size * 2}px`;
      el.style.lineHeight = `${line * 2}px`;
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const issues: string[] = [];
    const label = (el: HTMLElement) => `${el.getAttribute('data-testid') ?? el.tagName}: «${el.textContent!.trim().slice(0, 30)}»`;
    const boxes: { el: HTMLElement; r: DOMRect }[] = [];
    for (const el of texts) {
      const cs = getComputedStyle(el);
      // Хэвтээ гүйлгэдэг (чип, слайд) мөр доторх текст хэвийн
      let p: HTMLElement | null = el.parentElement;
      let inHScroll = false;
      for (; p && p !== root; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth) inHScroll = true;
      }
      if (inHScroll) continue;
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) issues.push(`ellipsis ${label(el)}`);
      else if (cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) issues.push(`мөр таслагдсан ${label(el)}`);
      else if (cs.overflow === 'hidden' && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
        issues.push(`тайрагдсан ${label(el)}`);
      }
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) boxes.push({ el, r });
    }
    // Давхцал: нэг нь нөгөөгийнхөө удам биш хоёр текстийн хүрээ 4px-ээс их огтлолцох
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const dx = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const dy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (dx > 4 && dy > 4) issues.push(`давхцсан ${label(a.el)} × ${label(b.el)}`);
      }
    }
    return issues;
  }, screenId);
}

test.describe('AC-DS-05 том фонт (200%)', () => {
  let a: TestUser;

  test.beforeAll(async () => {
    const [x, y] = await linkedCouple('Бат', 'Ану', 'large');
    await confirmStartDate(x, y, '2025-02-14');
    a = x;
  });

  test('гол дэлгэцүүдэд текст тайрагдахгүй, давхцахгүй', async ({ page }) => {
    test.setTimeout(120_000);
    await signInUi(page, a);
    for (const [sid, path] of SCREENS) {
      await test.step(sid, async () => {
        await page.goto(path);
        await expect(page.getByTestId(`screen-${sid}`).filter({ visible: true })).toBeVisible();
        await page.waitForTimeout(1_000);
        expect.soft(await largeTextIssues(page, `screen-${sid}`), sid).toEqual([]);
      });
    }
  });
});
