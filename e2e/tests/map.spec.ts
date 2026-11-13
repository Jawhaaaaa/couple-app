import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { mockOsmTiles } from '../mocks/osmTiles';
import { linkedCouple } from '../support/couple';
import { createMemoryApi, makeJpeg } from '../support/memories';
import { signInUi } from '../support/users';

/**
 * Газрын зураг (T-64, FR-12.1, FR-5.13): Leaflet (вэбэд шууд) — ойрхон цэгүүд тоотой cluster,
 * товшвол тухайн газрын дурсамжууд, OSM attribution (AC-116); S-30 «Газрын зураг» таб S-70-тэй
 * ижил өгөгдөл (AC-86).
 */
test.describe('Газрын зураг', () => {
  test('AC-116 AC-86 ойрхон цэгүүд cluster, товшвол газрын дурсамжууд; attribution; S-30 таб ижил', async ({ partnerA }) => {
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'ac116');
    const jpeg = await makeJpeg(partnerA.page);
    await createMemoryApi(a, jpeg, { title: 'Сүхбаатарын талбай', occurredOn: '2026-05-01', location: { name: 'Улаанбаатар', lat: 47.918, lon: 106.917 } });
    await createMemoryApi(a, jpeg, { title: 'Зайсан', occurredOn: '2026-05-02', location: { name: 'Зайсан', lat: 47.886, lon: 106.917 } });
    await createMemoryApi(a, jpeg, { title: 'Токиогийн цэцэрлэг', occurredOn: '2026-06-01', location: { name: 'Токио', lat: 35.68, lon: 139.69 } });

    await mockOsmTiles(partnerA.page);
    await signInUi(partnerA.page, a);
    await partnerA.page.goto('/together/map');
    await expect(partnerA.page.getByTestId('screen-S-70')).toBeVisible();
    await expect(partnerA.page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
    await expect(partnerA.page.getByTestId('map-attribution')).toContainText('OpenStreetMap');

    // Улс хоорондын хүрээнд UB ба Зайсан нэг cluster (2), Токио тусдаа
    const cluster = partnerA.page.locator('[data-testid="map-cluster"]');
    await expect(cluster).toHaveCount(1);
    await expect(cluster).toHaveText('2');
    await cluster.click();
    await expect(partnerA.page.getByTestId('map-selection')).toContainText('Улаанбаатар');
    await expect(partnerA.page.getByTestId('map-selection')).toContainText('Зайсан');
    await partnerA.page.getByTestId('map-place').filter({ hasText: 'Зайсан' }).click();
    await expect(partnerA.page).toHaveURL(/memories\/search\?place=/);

    await partnerA.page.goto('/memories?view=map');
    await expect(partnerA.page.locator('[data-testid="map-cluster"], [data-testid="map-marker"]').first()).toBeVisible();
    await expect(partnerA.page.getByTestId('memories-place')).toHaveCount(3);
  });
});
