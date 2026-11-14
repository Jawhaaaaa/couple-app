import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { resetServerClock, setServerClock } from '../support/clock';
import { linkedCouple } from '../support/couple';
import { createMemoryApi, makeJpeg } from '../support/memories';
import { runJob } from '../support/seed';
import { apiAs, signInUi, reloginApi } from '../support/users';

/** Бүтэн хуулбар (T-72, FR-14.5): дараалалд орж бэлэн болоход мэдэгдэл, 7 хоногийн дараа 410 (AC-126). */
test.describe('Өгөгдлийн экспорт', () => {
  test.afterEach(async () => resetServerClock());

  test('AC-126 S-85-аас хуулбар бэлтгэж татна; 7 хоногийн дараа холбоос 410', async ({ partnerA }) => {
    const start = new Date('2026-11-07T04:00:00Z');
    await setServerClock(start);
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac126');
    await createMemoryApi(a, await makeJpeg(partnerA.page), { title: 'Хуулбарт орох дурсамж', occurredOn: '2026-11-01' });
    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/settings/data');
    await expect(partnerA.page.getByTestId('screen-S-85')).toBeVisible();
    await expect(partnerA.page.getByTestId('data-usage-text')).toContainText('GB');
    await partnerA.page.getByTestId('data-export-start').click();
    await expect(partnerA.page.getByTestId('data-export-started')).toBeVisible();

    const download = partnerA.page.locator('[data-testid^="export-download-"]');
    await expect(download.first()).toBeVisible({ timeout: 60_000 });
    const exports = (await (await apiAs(a, 'GET', '/exports')).json()) as { id: string; kind: string; status: string }[];
    const full = exports.find((e) => e.kind === 'FULL' && e.status === 'READY')!;
    expect((await apiAs(a, 'GET', `/exports/${full.id}/download`)).status).toBeLessThan(400);

    await setServerClock(new Date(start.getTime() + 8 * 24 * 3600_000));
    await runJob('exportExpiry').catch(() => undefined);
    // 8 хоног урагшлахад 15 минутын access token дууссан — шинээр нэвтэрнэ
    await reloginApi(a);
    expect((await apiAs(a, 'GET', `/exports/${full.id}/download`)).status).toBe(410);
  });
});
