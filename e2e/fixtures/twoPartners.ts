import { type BrowserContext, type Page, test as base } from '@playwright/test';

export interface Partner {
  context: BrowserContext;
  page: Page;
  name: string;
}

/**
 * Хоёр хамтрагч = хоёр browser context (шаардлага §8.5). Context бүр тусдаа
 * cookie, IndexedDB-тэй тул хоёр утас мэт ажиллана.
 */
export const test = base.extend<{ partnerA: Partner; partnerB: Partner }>({
  partnerA: async ({ browser, contextOptions }, use) => {
    const context = await browser.newContext(contextOptions);
    await use({ context, page: await context.newPage(), name: 'Бат' });
    await context.close();
  },
  partnerB: async ({ browser, contextOptions }, use) => {
    const context = await browser.newContext(contextOptions);
    await use({ context, page: await context.newPage(), name: 'Ану' });
    await context.close();
  },
});

export { expect } from '@playwright/test';
