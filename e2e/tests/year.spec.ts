import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { linkedCouple } from '../support/couple';
import { createMemoryApi, makeJpeg } from '../support/memories';
import { signInUi } from '../support/users';

/** «Бидний жил» ба статистик (T-65, FR-12.3, FR-12.4): S-72 6–10 слайд, зураг болгон хадгалах (AC-118); S-30 Recap таб ижил өгөгдөл (AC-86). */
test.describe('Бидний жил', () => {
  test('AC-118 AC-86 S-30 Recap табаас S-72; 6–10 слайд; сүүлийнхийг PNG болгон татна', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac118');
    const jpeg = await makeJpeg(partnerA.page);
    const year = new Date().getFullYear();
    for (let i = 1; i <= 3; i += 1) {
      await createMemoryApi(a, jpeg, { title: `Дурсамж ${i}`, occurredOn: `${year}-0${i}-10`, location: { name: 'Тэрэлж', lat: 47.98, lon: 107.45 } });
    }
    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/memories?view=recap');
    await partnerA.page.getByTestId(`memories-year-${year}`).click();
    await expect(partnerA.page.getByTestId('screen-S-72')).toBeVisible();
    const label = await partnerA.page.getByTestId('recap-position').getAttribute('aria-label');
    const total = Number(label?.match(/(\d+)\D*$/)?.[1]);
    expect(total).toBeGreaterThanOrEqual(6);
    expect(total).toBeLessThanOrEqual(10);
    for (let i = 1; i < total; i += 1) await partnerA.page.getByTestId('recap-next').click();
    const download = partnerA.page.waitForEvent('download');
    await partnerA.page.getByTestId('year-save-image').click();
    expect((await download).suggestedFilename()).toBe(`aura-${year}.png`);
  });

  test('AC-117 S-71 тоонууд серверийн /stats-тай тэнцүү', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac117');
    await createMemoryApi(a, await makeJpeg(partnerA.page), { title: 'Нэг', occurredOn: '2026-05-01' });
    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/together/stats');
    await expect(partnerA.page.getByTestId('stat-memories-value')).toHaveText('1');
    await expect(partnerA.page.getByTestId('stat-photos-value')).toHaveText('1');
  });
});
