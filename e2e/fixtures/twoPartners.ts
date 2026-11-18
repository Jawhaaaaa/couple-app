import { type BrowserContext, type Page, test as base } from '@playwright/test';

export interface Partner {
  context: BrowserContext;
  page: Page;
  name: string;
}

/**
 * Нэвтэрсний дараах S-100 (суулгах заавар) / S-101 (мэдэгдлийн тайлбар) саналыг энэ context-д
 * «аль хэдийн харуулсан» болгоно (`aura.install-prompt` — installPromptStore-ийн persist).
 *
 * Шалтгаан: апп нүүрэнд буусаны 1.5 с-ийн дараа `/install` эсвэл `/push-permission` руу шилждэг
 * (FR-19.2, FR-19.3). WebKit-д (iPhone UA, standalone биш) S-100, Firefox/WebKit-д
 * `Notification.permission === 'default'` тул S-101 нээгдэж нүүрийг далдалдаг — нүүрний товч
 * «not visible» болж тест унадаг (CI run 43790105841). Chromium headless-д зөвшөөрөл `denied`
 * тул тэнд гардаггүй байсан. Эдгээр санал нь өөрсдийн UT-тэй (`mobile/src/pwa/__tests__/installPrompt.test.ts`
 * — `nextPwaPrompt`, `shouldOfferInstall`); бусад тестийн урсгалд оролцохгүй.
 * `dismissedAt` нь ирээдүйд — тестийн цаг (`support/clock.ts`) урагш шилжсэн ч 7 хоногийн
 * хугацаа дуусахгүй.
 */
export async function suppressPwaPrompts(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      const key = 'aura.install-prompt';
      if (window.localStorage.getItem(key) == null) {
        const farFuture = Date.now() + 10 * 365 * 24 * 3600_000;
        window.localStorage.setItem(key, JSON.stringify({ state: { dismissedAt: farFuture, pushOffered: true }, version: 0 }));
      }
    } catch {
      // localStorage хаалттай орчин — санал гарч болно, тест өөрөө илрүүлнэ
    }
  });
}

/**
 * Playwright Firefox-д `filechooser`-ийг барихад хөтөч нь файлын цонхыг өөрөө хааж `<input type=file>`
 * дээр trusted `cancel` үйл явдал шууд үүсгэдэг (жинхэнэ хэрэглэгч файл сонгоход гардаггүй).
 * `expo-image-picker` (вэб) `cancel`-ийг «цуцалсан» гэж уншаад input-ыг устгадаг тул дараа нь
 * `setFiles` хийсэн файл хэзээ ч ирэхгүй (CI run 43790105841, Firefox: S-32 «0 / 20 файл»).
 * Тестийн context-д файлын input-ын `cancel`-ийг capture шатанд зогсооно — хэрэглэгчийн цуцлалтыг
 * шалгах E2E байхгүй.
 */
export async function ignoreAutomationFileCancel(context: BrowserContext) {
  await context.addInitScript(() => {
    document.addEventListener(
      'cancel',
      (event) => {
        const target = event.target as HTMLInputElement | null;
        if (target?.tagName === 'INPUT' && target.type === 'file') event.stopImmediatePropagation();
      },
      true,
    );
  });
}

async function prepareContext(context: BrowserContext) {
  await suppressPwaPrompts(context);
  await ignoreAutomationFileCancel(context);
}

/**
 * Хоёр хамтрагч = хоёр browser context (шаардлага §8.5). Context бүр тусдаа
 * cookie, IndexedDB-тэй тул хоёр утас мэт ажиллана.
 */
export const test = base.extend<{ partnerA: Partner; partnerB: Partner }>({
  // Анхдагч `page`/`context`-ийг ашигладаг тест (one-hand г.м.) ч мөн адил бэлтгэгдэнэ
  context: async ({ context }, use) => {
    await prepareContext(context);
    await use(context);
  },
  partnerA: async ({ browser, contextOptions }, use) => {
    const context = await browser.newContext(contextOptions);
    await prepareContext(context);
    await use({ context, page: await context.newPage(), name: 'Бат' });
    await context.close();
  },
  partnerB: async ({ browser, contextOptions }, use) => {
    const context = await browser.newContext(contextOptions);
    await prepareContext(context);
    await use({ context, page: await context.newPage(), name: 'Ану' });
    await context.close();
  },
});

export { expect } from '@playwright/test';
