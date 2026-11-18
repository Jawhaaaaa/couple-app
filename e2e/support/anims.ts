import { type BrowserContext, expect, type Page } from '@playwright/test';

import { ZONE } from './users';

/**
 * ANIM-ийн E2E ажиглалт (TQ-05, DD-AURA-026): `AnimatedMoment` нь вэбэд `data-anim="ANIM-XX"`,
 * `data-anim-state="playing|done|reduced|off"` тавина. Олон ANIM богино (ANIM-10 ≈ 350 мс,
 * ANIM-12 ≤ 1.6 с, ANIM-13 650 мс) тул polling-оор алдагдахаас сэргийлж хуудас бүрд
 * MutationObserver суулгаж, тэмдэглэгээ бүрийн төлөв ба DOM-оос гарсан агшныг бүртгэнэ.
 */
export type AnimState = 'playing' | 'done' | 'reduced' | 'off';

export interface AnimRecord {
  anim: string;
  state: AnimState | 'removed';
  /** `performance.now()` — нэг баримт (document) дотор л харьцуулна. */
  t: number;
  /** Тэмдэглэгээнээс дээшх `data-testid`-ууд (ойроос нь холруу). */
  within: string[];
}

declare global {
  interface Window {
    __animLog?: AnimRecord[];
  }
}

/** Баярын мөчийн дээд хугацаа (§3.4 зарчим 2, `motion.duration.celebrationMax`). */
export const CELEBRATION_MAX_MS = 2_500;
/** Хаагдах үеийн FadeOut (Reanimated) ба frame-ийн зөрүү. */
const EXIT_SLACK_MS = 500;

/** Init script — гадны хувьсагчгүй (Playwright эх бичвэрийг нь хуудсанд хуулна). */
function installAnimObserver() {
  if (window.__animLog) return;
  const log: AnimRecord[] = [];
  window.__animLog = log;
  const chain = (el: Element): string[] => {
    const ids: string[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const id = n.getAttribute('data-testid');
      if (id) ids.push(id);
    }
    return ids;
  };
  const push = (el: Element, removed: boolean) => {
    const anim = el.getAttribute('data-anim');
    const state = el.getAttribute('data-anim-state');
    if (!anim || !state) return;
    log.push({ anim, state: removed ? 'removed' : (state as AnimState), t: performance.now(), within: chain(el) });
  };
  const scan = (node: Node, removed: boolean) => {
    if (!(node instanceof Element)) return;
    if (node.hasAttribute('data-anim-state')) push(node, removed);
    node.querySelectorAll('[data-anim-state]').forEach((el) => push(el, removed));
  };
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        if (m.target instanceof Element) push(m.target, false);
      } else {
        m.addedNodes.forEach((n) => scan(n, false));
        m.removedNodes.forEach((n) => scan(n, true));
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-anim-state'] });
}

/** Context-ийн бүх хуудас, бүх navigation-д бүртгэгч суулгана — эхний `goto`-оос өмнө дууд. */
export async function recordAnims(context: BrowserContext) {
  await context.addInitScript(installAnimObserver);
}

/** Өдөөхөөс өмнө бүртгэлийг цэвэрлэнэ (үргэлж байдаг тэмдэглэгээний өмнөх төлөвийг тооцохгүй). */
export async function clearAnims(page: Page) {
  await page.evaluate(() => {
    if (window.__animLog) window.__animLog.length = 0;
  });
}

export async function animLog(page: Page, id: string): Promise<AnimRecord[]> {
  return page.evaluate((anim) => (window.__animLog ?? []).filter((r) => r.anim === anim), id);
}

/**
 * ANIM тоглогдсон: хэвийн үед `playing`, `reducedMotion: 'reduce'`-д `reduced` (AC-MO-01) төлөв
 * бүртгэлд эсвэл одоогийн DOM-д байна. `within` — тэмдэглэгээ тухайн testID-тай элемент дотор
 * (жишээ `screen-S-26`, `tab-chat`) гарсан байх ёстой.
 */
export async function expectAnim(page: Page, id: string, opts: { reduced: boolean; within?: string; timeout?: number }) {
  const want: AnimState = opts.reduced ? 'reduced' : 'playing';
  const within = opts.within ?? null;
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ anim, state, scope }) => {
            const logged = (window.__animLog ?? []).some((r) => r.anim === anim && r.state === state && (!scope || r.within.includes(scope)));
            if (logged) return true;
            return Array.from(document.querySelectorAll(`[data-anim="${anim}"]`)).some(
              (el) => el.getAttribute('data-anim-state') === state && (!scope || !!el.closest(`[data-testid="${scope}"]`)),
            );
          },
          { anim: id, state: want, scope: within },
        ),
      { message: `${id} → data-anim-state="${want}"${within ? ` (${within} дотор)` : ''}`, intervals: [50], timeout: opts.timeout ?? 10_000 },
    )
    .toBe(true);
}

/**
 * Баярын мөч (ANIM-05, 14, 18, 20, 21 — `CelebrationOverlay`) дуусгах (AC-MO-02, AC-214):
 * `tap` — товшимогц хаагдана (2.5 с-ийн автомат хаалтаас өмнө); `auto` — өөрөө ≤ 2.5 с-д хаагдана.
 * Хугацааг `celebration-overlay` доторх тэмдэглэгээ DOM-д орсноос гарах хүртэл хэмжинэ.
 */
export async function finishCelebration(page: Page, id: string, how: 'tap' | 'auto') {
  const overlay = page.getByTestId('celebration-overlay');
  if (how === 'tap') await overlay.click();
  await expect(overlay).toHaveCount(0, { timeout: how === 'tap' ? 1_500 : CELEBRATION_MAX_MS + 2_000 });
  const records = (await animLog(page, id)).filter((r) => r.within.includes('celebration-overlay'));
  const shown = records.find((r) => r.state !== 'removed');
  expect(shown, `${id}: celebration-overlay доторх тэмдэглэгээ бүртгэгдсэнгүй`).toBeTruthy();
  const removed = records.find((r) => r.state === 'removed' && r.t >= (shown?.t ?? 0));
  expect(removed, `${id}: тэмдэглэгээ DOM-оос гарсангүй`).toBeTruthy();
  const elapsed = (removed?.t ?? 0) - (shown?.t ?? 0);
  if (how === 'tap') expect(elapsed, `${id}: товшилтоор хаагдах ёстой`).toBeLessThan(CELEBRATION_MAX_MS);
  else expect(elapsed, `${id}: баярын мөч ≤ 2.5 с`).toBeLessThanOrEqual(CELEBRATION_MAX_MS + EXIT_SLACK_MS);
}

/** Тухайн бүсийн өнөөдрөөс `offsetDays` өдрийн зайтай огноо, `YYYY-MM-DD`. */
export function localDate(offsetDays = 0, zone = ZONE): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
